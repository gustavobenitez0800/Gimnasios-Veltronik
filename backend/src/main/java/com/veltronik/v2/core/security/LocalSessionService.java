package com.veltronik.v2.core.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.veltronik.v2.core.entities.Cashier;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Sesiones locales del cajero (ladrillo 6, ADR local-auth): emite y valida tokens
 * firmados con HMAC-SHA256, sin depender de Supabase ni de internet.
 *
 * <p><b>El secreto</b> se genera UNA vez por instalación y vive en {@code sync_state}
 * (clave {@code local_session_secret}): así los tokens sobreviven reinicios del cerebro,
 * pero jamás salen de la máquina. HMAC (no cifrado) alcanza: el payload no es secreto,
 * solo debe ser infalsificable — y el token nunca sale de {@code 127.0.0.1}.</p>
 *
 * <p>Formato compacto tipo JWT, hecho a mano para no sumar dependencias (jjwt no está en
 * el classpath): {@code base64url(payload).base64url(hmac)}. Solo usa {@code javax.crypto}
 * de {@code java.base} — nada nuevo que agregar al jlink.</p>
 */
@Slf4j
@Service
@Profile("local")
public class LocalSessionService {

    private static final String SECRET_KEY = "local_session_secret";
    private static final Duration TTL = Duration.ofHours(12); // un turno largo de mostrador
    private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getUrlDecoder();

    private final ObjectMapper mapper;
    private final byte[] secret;

    public LocalSessionService(JdbcTemplate jdbcTemplate, ObjectMapper mapper) {
        this.mapper = mapper;
        this.secret = loadOrCreateSecret(jdbcTemplate);
    }

    /** Segundos de vida del token — el frontend lo usa para saber cuándo re-pedir PIN. */
    public long ttlSeconds() {
        return TTL.toSeconds();
    }

    /** Emite un token para el cajero recién autenticado por PIN. */
    public String issue(LocalPrincipal principal) {
        ObjectNode claims = mapper.createObjectNode();
        claims.put("cid", principal.cashierId().toString());
        claims.put("tid", principal.tenantId().toString());
        claims.put("role", principal.role().name());
        claims.put("name", principal.name());
        claims.put("exp", Instant.now().plus(TTL).getEpochSecond());

        String payload;
        try {
            payload = B64.encodeToString(mapper.writeValueAsBytes(claims));
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo serializar la sesión local", e);
        }
        return payload + "." + B64.encodeToString(hmac(payload));
    }

    /** Valida un token: firma correcta y no vencido. Vacío si algo no cierra. */
    public Optional<LocalPrincipal> verify(String token) {
        if (token == null || token.isBlank()) return Optional.empty();
        int dot = token.indexOf('.');
        if (dot <= 0 || dot == token.length() - 1) return Optional.empty();

        String payload = token.substring(0, dot);
        byte[] presented = B64D.decode(token.substring(dot + 1));
        // Comparación en tiempo constante contra falsificación de firma.
        if (!MessageDigest.isEqual(presented, hmac(payload))) return Optional.empty();

        try {
            JsonNode claims = mapper.readTree(B64D.decode(payload));
            if (claims.path("exp").asLong(0) < Instant.now().getEpochSecond()) return Optional.empty();
            return Optional.of(new LocalPrincipal(
                    UUID.fromString(claims.path("cid").asText()),
                    UUID.fromString(claims.path("tid").asText()),
                    Cashier.Role.valueOf(claims.path("role").asText()),
                    claims.path("name").asText("")));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private byte[] hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(payload.getBytes(StandardCharsets.US_ASCII));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC no disponible", e); // imposible en JVM estándar
        }
    }

    private byte[] loadOrCreateSecret(JdbcTemplate jdbcTemplate) {
        List<String> existing = jdbcTemplate.queryForList(
                "SELECT value FROM sync_state WHERE key = ?", String.class, SECRET_KEY);
        if (existing != null && !existing.isEmpty()) {
            return Base64.getDecoder().decode(existing.get(0));
        }
        byte[] fresh = new byte[32];
        new SecureRandom().nextBytes(fresh);
        jdbcTemplate.update(
                "INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, now()) "
                        + "ON CONFLICT (key) DO NOTHING",
                SECRET_KEY, Base64.getEncoder().encodeToString(fresh));
        // Re-leer por si otro arranque ganó la carrera del INSERT.
        List<String> after = jdbcTemplate.queryForList(
                "SELECT value FROM sync_state WHERE key = ?", String.class, SECRET_KEY);
        return (after == null || after.isEmpty()) ? fresh : Base64.getDecoder().decode(after.get(0));
    }
}
