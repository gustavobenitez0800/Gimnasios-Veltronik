package com.veltronik.v2.core.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.veltronik.v2.core.exceptions.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;

/**
 * Alta de usuarios en Supabase desde el servidor, para que un empleado NO tenga que
 * registrarse solo.
 *
 * <p><b>El problema que resuelve.</b> Hasta ahora, sumar una recepcionista al equipo
 * exigía decirle "entrá a esta web, creá una cuenta, y después decime qué email usaste".
 * Con rotación de personal alta, ese baile se repite todo el tiempo — y el botón
 * "Invitar" no invitaba nada: solo vinculaba cuentas que ya existían.</p>
 *
 * <p><b>La clave de servicio.</b> Crear un usuario requiere la credencial de ADMINISTRADOR
 * de Supabase, que saltea todas las reglas de acceso del proyecto. Es la más poderosa que
 * hay, y por eso vive únicamente acá, en el backend: nunca en el frontend, nunca en el
 * instalable de escritorio. Si no está configurada, este servicio se declara no disponible
 * y el alta cae al camino de siempre (vincular una cuenta existente) en vez de romperse.</p>
 */
@Slf4j
@Service
public class SupabaseAdminService {

    private static final Duration TIMEOUT = Duration.ofSeconds(15);

    private final String supabaseUrl;
    private final String serviceRoleKey;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    private final ObjectMapper json = new ObjectMapper();

    public SupabaseAdminService(
            @Value("${veltronik.supabase.url:}") String supabaseUrl,
            @Value("${veltronik.supabase.service-role-key:}") String serviceRoleKey) {
        this.supabaseUrl = supabaseUrl == null ? "" : supabaseUrl.trim().replaceAll("/+$", "");
        this.serviceRoleKey = serviceRoleKey == null ? "" : serviceRoleKey.trim();
    }

    /** ¿Se puede dar de alta gente desde el servidor, o falta la credencial? */
    public boolean isAvailable() {
        return !supabaseUrl.isBlank() && !serviceRoleKey.isBlank();
    }

    /** Resultado del alta: el id del usuario y la contraseña que hay que entregarle. */
    public record CreatedUser(UUID userId, String temporaryPassword) {}

    /**
     * Crea el usuario en Supabase con una contraseña temporal y el email ya confirmado.
     *
     * <p>Se confirma el email a propósito: no hay casilla que revisar ni mail que llegue.
     * La persona entra con lo que le pase el dueño y listo — que es justamente el punto.</p>
     *
     * <p>La fila de {@code app_user} NO se crea acá: la crea sola el trigger
     * {@code on_auth_user_created} (V11) cuando Supabase inserta el usuario.</p>
     *
     * @throws BusinessException si falta la credencial o si Supabase rechaza el alta
     */
    public CreatedUser createUser(String email, String fullName) {
        if (!isAvailable()) {
            throw new BusinessException(
                    "El alta de empleados desde el sistema no está configurada. "
                            + "Por ahora, la persona tiene que crear su cuenta y después la agregás por su email.");
        }

        String password = generateTemporaryPassword();
        String[] partes = splitName(fullName);

        String body;
        try {
            body = json.writeValueAsString(Map.of(
                    "email", email,
                    "password", password,
                    "email_confirm", true,
                    "user_metadata", Map.of("first_name", partes[0], "last_name", partes[1])));
        } catch (Exception e) {
            throw new BusinessException("No se pudo preparar el alta del empleado.");
        }

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(supabaseUrl + "/auth/v1/admin/users"))
                .timeout(TIMEOUT)
                .header("apikey", serviceRoleKey)
                .header("Authorization", "Bearer " + serviceRoleKey)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BusinessException("El alta del empleado quedó interrumpida. Probá de nuevo.");
        } catch (Exception e) {
            log.warn("Supabase admin no respondió al crear {}: {}", email, e.getMessage());
            throw new BusinessException("No pudimos comunicarnos con el servicio de cuentas. Probá de nuevo.");
        }

        if (response.statusCode() >= 300) {
            // El cuerpo de Supabase puede traer detalles; NUNCA se devuelve al cliente tal
            // cual (puede filtrar información del proyecto). Se loguea y se traduce.
            log.warn("Supabase rechazó el alta de {} (HTTP {}): {}", email, response.statusCode(), response.body());
            throw new BusinessException(mensajeDeError(response.statusCode(), response.body()));
        }

        try {
            String id = json.readTree(response.body()).path("id").asText(null);
            if (id == null || id.isBlank()) {
                throw new BusinessException("El servicio de cuentas no devolvió el usuario creado.");
            }
            return new CreatedUser(UUID.fromString(id), password);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("No se pudo leer la respuesta del servicio de cuentas.");
        }
    }

    /** Traduce el error de Supabase a algo que le sirva al dueño. */
    private static String mensajeDeError(int status, String body) {
        String lower = body == null ? "" : body.toLowerCase();
        if (status == 422 || lower.contains("already been registered") || lower.contains("already exists")) {
            return "Ese email ya tiene una cuenta en Veltronik. Agregalo al equipo por su email, sin crear una nueva.";
        }
        if (lower.contains("password")) {
            return "La contraseña generada no cumple los requisitos del servicio de cuentas.";
        }
        if (status == 401 || status == 403) {
            return "La credencial del servicio de cuentas no es válida. Revisá la configuración del servidor.";
        }
        return "No se pudo crear la cuenta del empleado. Probá de nuevo en unos minutos.";
    }

    /**
     * Contraseña temporal legible para dictar por teléfono o anotar en un papel.
     *
     * <p>Sin caracteres que se confundan al leerlos en voz alta (0/O, 1/l/I): el dueño se
     * la va a pasar a la recepcionista hablando o por WhatsApp, y una clave que se tipea
     * mal tres veces termina en una llamada a soporte.</p>
     */
    private static String generateTemporaryPassword() {
        final String alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder(13);
        for (int bloque = 0; bloque < 3; bloque++) {
            if (bloque > 0) sb.append('-');
            for (int i = 0; i < 4; i++) {
                sb.append(alfabeto.charAt(random.nextInt(alfabeto.length())));
            }
        }
        return sb.toString();
    }

    /** Parte "Ana María Pérez" en nombre y apellido, tolerando que venga vacío. */
    private static String[] splitName(String fullName) {
        String limpio = fullName == null ? "" : fullName.trim();
        if (limpio.isEmpty()) return new String[]{"", ""};
        int corte = limpio.indexOf(' ');
        if (corte < 0) return new String[]{limpio, ""};
        return new String[]{limpio.substring(0, corte), limpio.substring(corte + 1).trim()};
    }
}
