package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.SesionCierre;
import com.veltronik.v2.core.repositories.SesionCierreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Anota por qué se cerró cada sesión de un terminal (V89).
 *
 * <p><b>Es diagnóstico y no puede romper nada.</b> Lo llama una app que acaba de iniciar
 * sesión: un aviso mal formado se descarta, no se rechaza el pedido entero. Lo peor que puede
 * pasar acá es perder un renglón de diagnóstico; lo peor que podría pasar si esto tirara es
 * que el terminal reintente para siempre un aviso que nunca va a entrar.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SesionCierreService {

    /** Cuántos avisos se aceptan por pedido. Un terminal guarda como mucho veinte. */
    public static final int MAXIMO_POR_PEDIDO = 20;

    /** Un aviso más viejo que esto ya no explica nada: se acota a este límite. */
    static final int DIAS_HACIA_ATRAS = 30;

    private static final int LARGO_MOTIVO = 40;
    private static final int LARGO_DETALLE = 500;
    private static final int LARGO_VERSION = 32;
    private static final int LARGO_PLATAFORMA = 20;

    private final SesionCierreRepository repository;

    /**
     * Lo que manda el terminal por cada cierre. Todo puede faltar menos el sello.
     *
     * <p>Son textos a propósito, también el sello y la fecha: con tipos, un solo valor mal
     * escrito haría que Jackson rechazara el pedido ENTERO con un 400, y el terminal se
     * quedaría reintentando la lista completa para siempre. Acá se lee cada uno por separado.</p>
     */
    public record Aviso(String clientRef, String ocurridoEn, String motivo, String detalle,
                        String userId, String plataforma) {}

    /** De dónde vino el pedido: sale del token y de las cabeceras, no del cuerpo. */
    public record Origen(UUID reportadoPor, UUID tenantId, UUID deviceId, String appVersion) {}

    /**
     * Anota los avisos que todavía no estaban.
     *
     * @return los sellos que quedaron anotados (los nuevos y los que ya estaban): son los que
     *         el terminal puede borrar de su lista
     */
    @Transactional
    public List<UUID> registrar(List<Aviso> avisos, Origen origen) {
        if (avisos == null || avisos.isEmpty() || origen == null || origen.reportadoPor() == null) {
            return List.of();
        }

        // Un sello por aviso: sin sello no hay cómo reconocer un reintento, y el mismo sello
        // repetido DENTRO del pedido cuenta una vez.
        Map<UUID, Aviso> validos = new LinkedHashMap<>();
        for (Aviso aviso : avisos) {
            if (validos.size() >= MAXIMO_POR_PEDIDO) break;
            UUID sello = aviso == null ? null : uuid(aviso.clientRef());
            if (sello != null) validos.putIfAbsent(sello, aviso);
        }
        if (validos.isEmpty()) return List.of();

        Set<UUID> yaAnotados = repository.findByClientRefIn(validos.keySet()).stream()
                .map(SesionCierre::getClientRef)
                .collect(Collectors.toSet());

        LocalDateTime ahora = LocalDateTime.now();
        List<SesionCierre> nuevos = new ArrayList<>();
        for (Map.Entry<UUID, Aviso> entrada : validos.entrySet()) {
            if (yaAnotados.contains(entrada.getKey())) continue;
            Aviso aviso = entrada.getValue();

            SesionCierre cierre = new SesionCierre();
            cierre.setClientRef(entrada.getKey());
            cierre.setOcurridoAt(acotar(momento(aviso.ocurridoEn()), ahora));
            cierre.setMotivo(recortar(vacioA(aviso.motivo(), "OTRO"), LARGO_MOTIVO));
            cierre.setDetalle(recortar(aviso.detalle(), LARGO_DETALLE));
            cierre.setUserId(uuid(aviso.userId()));
            cierre.setPlataforma(recortar(aviso.plataforma(), LARGO_PLATAFORMA));
            cierre.setReportadoPor(origen.reportadoPor());
            cierre.setTenantId(origen.tenantId());
            cierre.setDeviceId(origen.deviceId());
            cierre.setAppVersion(recortar(origen.appVersion(), LARGO_VERSION));
            nuevos.add(cierre);
        }
        if (!nuevos.isEmpty()) {
            repository.saveAll(nuevos);
            log.info("Cierres de sesión anotados: {} (equipo {}, sucursal {}): {}",
                    nuevos.size(), origen.deviceId(), origen.tenantId(),
                    nuevos.stream().map(SesionCierre::getMotivo).collect(Collectors.joining(",")));
        }
        return List.copyOf(validos.keySet());
    }

    /** Un UUID bien escrito, o null. */
    private static UUID uuid(String texto) {
        if (texto == null || texto.isBlank()) return null;
        try {
            return UUID.fromString(texto.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * El momento que dice el terminal, en la hora del servidor. Acepta la hora local sin zona
     * (como la manda la cola del mostrador) y también una con zona; lo que no se entiende es
     * null, y `acotar` lo vuelve "ahora".
     */
    private static LocalDateTime momento(String texto) {
        if (texto == null || texto.isBlank()) return null;
        String limpio = texto.trim();
        try {
            return LocalDateTime.parse(limpio);
        } catch (DateTimeParseException sinZona) {
            try {
                return OffsetDateTime.parse(limpio).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
            } catch (DateTimeParseException conZona) {
                return null;
            }
        }
    }

    /**
     * El reloj del terminal se acota, no se cree: la PC de un mostrador puede tener la fecha
     * corrida. Un momento del futuro pasa a ser ahora; uno demasiado viejo, el límite.
     */
    private static LocalDateTime acotar(LocalDateTime cuando, LocalDateTime ahora) {
        if (cuando == null || cuando.isAfter(ahora)) return ahora;
        LocalDateTime limite = ahora.minusDays(DIAS_HACIA_ATRAS);
        return cuando.isBefore(limite) ? limite : cuando;
    }

    private static String vacioA(String texto, String siVacio) {
        return (texto == null || texto.isBlank()) ? siVacio : texto.trim();
    }

    private static String recortar(String texto, int largo) {
        if (texto == null) return null;
        String limpio = texto.trim();
        if (limpio.isEmpty()) return null;
        return limpio.length() <= largo ? limpio : limpio.substring(0, largo);
    }
}
