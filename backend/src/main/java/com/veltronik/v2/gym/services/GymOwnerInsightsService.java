package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.security.SecurityUtils;
import com.veltronik.v2.gym.dto.OwnerInsightsDTO;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * El resumen de TODAS las sucursales del dueño: plata cobrada, altas y bajas, mes a mes.
 *
 * <p>Responde a la pregunta que hoy el dueño de tres locales contesta con una calculadora:
 * entra a cada sucursal, anota, y suma a mano. Tiene tres gimnasios en el mismo sistema y
 * el sistema no le dice el total.</p>
 *
 * <h3>Por qué las consultas son NATIVAS, y por qué eso importa</h3>
 * <p>El aislamiento entre sucursales lo aplica un filtro de Hibernate que se activa solo
 * ({@code TenantFilterAspect}) y le mete un {@code WHERE tenant_id = ?} a toda consulta
 * sobre entidades. Es la protección más fuerte del sistema — y acá jugaría en contra: el
 * dueño llega con una sucursal en el contexto, así que un JPQL normal quedaría
 * <b>silenciosamente acotado a esa sola sucursal</b> y el resumen mostraría un tercio de
 * la verdad sin ningún error a la vista. Las consultas nativas no pasan por el filtro.</p>
 *
 * <p>Esquivar el aislamiento a propósito obliga a poner la seguridad en otro lado, y acá
 * está: la lista de sucursales se arma <b>en el servidor</b>, desde las membresías OWNER
 * del usuario. El cliente no manda ni puede influir en qué sucursales se suman. Y lo que
 * sale son números agregados: nunca un socio, nunca una ficha.</p>
 *
 * <h3>Qué significa "baja"</h3>
 * <p>La formal —alguien entra a la ficha y apaga el interruptor— no sirve: en un gimnasio
 * nadie va al mostrador a rescindir, simplemente deja de venir. Contar solo esas daría un
 * número chiquito y mentiroso, y el dueño dejaría de mirarlo.</p>
 *
 * <p>Acá una baja es <b>se le venció la cuota y no volvió a pagar</b>. Funciona porque
 * cobrar corre la fecha de vencimiento (ver {@code GymPaymentService}): la fecha que el
 * socio tiene hoy ES el día en que dejó de estar cubierto. Si quedó en marzo y estamos en
 * agosto, se fue en marzo.</p>
 *
 * <p>⚠️ Por lo mismo, este número vale lo que valga esa fecha. Los socios que pagaron
 * antes del arreglo y quedaron figurando vencidos aparecerían acá como bajas: para eso
 * está la revisión de Ajustes → "Socios que pagaron y figuran vencidos".</p>
 */
@Service
@RequiredArgsConstructor
public class GymOwnerInsightsService {

    /** Zona del negocio: los meses son meses calendario ARGENTINOS, no del server. */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    /** Días de atraso tolerados antes de dar a alguien por ido. Decisión del dueño. */
    private static final int GRACE_DAYS = 30;

    private final TenantMembershipRepository membershipRepository;
    private final EntityManager entityManager;

    /**
     * @param months cuántos meses hacia atrás (incluido el actual)
     */
    @Transactional(readOnly = true)
    public OwnerInsightsDTO forCurrentOwner(int months) {
        final int ventana = Math.max(1, Math.min(months, 36)); // tope defensivo
        final LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        final YearMonth mesActual = YearMonth.from(ahora);
        final YearMonth primerMes = mesActual.minusMonths(ventana - 1L);

        OwnerInsightsDTO out = new OwnerInsightsDTO();
        out.setGraceDays(GRACE_DAYS);
        out.setMonths(listarMeses(primerMes, ventana));
        // El mes de "hace 30 días" y todo lo posterior todavía se puede mover.
        out.setProvisionalFrom(YearMonth.from(ahora.minusDays(GRACE_DAYS)).toString());

        // ── La lista de sucursales se arma ACÁ, nunca llega del cliente ──
        List<TenantMembership> propias = membershipRepository.findByUserId(SecurityUtils.getCurrentUserId())
                .stream()
                .filter(TenantMembership::isActive)
                .filter(m -> m.getRole() == UserRole.OWNER)
                .toList();

        if (propias.isEmpty()) {
            out.setBranches(List.of());
            out.setTotals(mesesVacios(out.getMonths()));
            return out;
        }

        List<UUID> ids = propias.stream().map(m -> m.getTenant().getId()).toList();
        final LocalDateTime desde = primerMes.atDay(1).atStartOfDay();
        final LocalDateTime corteBajas = ahora.minusDays(GRACE_DAYS);

        Map<String, BigDecimal> plata = sumarPlata(ids, desde);
        Map<String, Long> altas = contarAltas(ids, desde);
        Map<String, Long> bajas = contarBajas(ids, desde, corteBajas);

        List<OwnerInsightsDTO.Branch> branches = new ArrayList<>();
        for (TenantMembership m : propias) {
            OwnerInsightsDTO.Branch b = new OwnerInsightsDTO.Branch();
            b.setTenantId(m.getTenant().getId());
            b.setName(m.getTenant().getName());
            b.setMonths(out.getMonths().stream().map(mes -> {
                String k = clave(m.getTenant().getId(), mes);
                OwnerInsightsDTO.Month dato = new OwnerInsightsDTO.Month();
                dato.setMonth(mes);
                dato.setRevenue(plata.getOrDefault(k, BigDecimal.ZERO));
                dato.setNewMembers(altas.getOrDefault(k, 0L));
                dato.setChurned(bajas.getOrDefault(k, 0L));
                return dato;
            }).toList());
            branches.add(b);
        }
        branches.sort(java.util.Comparator.comparing(OwnerInsightsDTO.Branch::getName,
                String.CASE_INSENSITIVE_ORDER));
        out.setBranches(branches);
        out.setTotals(sumarTodo(out.getMonths(), branches));
        return out;
    }

    // ── Consultas ──────────────────────────────────────────────────────────────

    /** Cuotas cobradas por mes. UPPER(status) porque conviven "paid" y "PAID" en datos viejos. */
    private Map<String, BigDecimal> sumarPlata(List<UUID> ids, LocalDateTime desde) {
        List<?> filas = entityManager.createNativeQuery(
                        "SELECT tenant_id, to_char(date_trunc('month', payment_date), 'YYYY-MM'), COALESCE(SUM(amount), 0) "
                                + "FROM gym_payments "
                                + "WHERE tenant_id IN (:ids) AND UPPER(status) = 'PAID' AND payment_date >= :desde "
                                + "GROUP BY 1, 2")
                .setParameter("ids", ids)
                .setParameter("desde", desde)
                .getResultList();

        Map<String, BigDecimal> out = new HashMap<>();
        for (Object fila : filas) {
            Object[] c = (Object[]) fila;
            out.put(clave((UUID) c[0], (String) c[1]), (BigDecimal) c[2]);
        }
        return out;
    }

    /** Socios dados de alta por mes. */
    private Map<String, Long> contarAltas(List<UUID> ids, LocalDateTime desde) {
        return contar(entityManager.createNativeQuery(
                        "SELECT tenant_id, to_char(date_trunc('month', created_at), 'YYYY-MM'), COUNT(*) "
                                + "FROM gym_members "
                                + "WHERE tenant_id IN (:ids) AND created_at >= :desde "
                                + "GROUP BY 1, 2")
                .setParameter("ids", ids)
                .setParameter("desde", desde)
                .getResultList());
    }

    /**
     * Bajas por mes: la cobertura terminó en ese mes y ya pasó el período de gracia.
     *
     * <p>No hace falta comprobar "y no volvió a pagar" aparte: si hubiera pagado, cobrar le
     * habría corrido la fecha hacia adelante y no caería en ese mes. La fecha de
     * vencimiento ES el registro de hasta cuándo estuvo.</p>
     */
    private Map<String, Long> contarBajas(List<UUID> ids, LocalDateTime desde, LocalDateTime corte) {
        return contar(entityManager.createNativeQuery(
                        "SELECT tenant_id, to_char(date_trunc('month', membership_end), 'YYYY-MM'), COUNT(*) "
                                + "FROM gym_members "
                                + "WHERE tenant_id IN (:ids) AND membership_end IS NOT NULL "
                                + "AND membership_end >= :desde AND membership_end < :corte "
                                + "GROUP BY 1, 2")
                .setParameter("ids", ids)
                .setParameter("desde", desde)
                .setParameter("corte", corte)
                .getResultList());
    }

    private Map<String, Long> contar(List<?> filas) {
        Map<String, Long> out = new HashMap<>();
        for (Object fila : filas) {
            Object[] c = (Object[]) fila;
            out.put(clave((UUID) c[0], (String) c[1]), ((Number) c[2]).longValue());
        }
        return out;
    }

    // ── Armado ─────────────────────────────────────────────────────────────────

    private static String clave(UUID tenantId, String mes) {
        return tenantId + "|" + mes;
    }

    private static List<String> listarMeses(YearMonth primero, int cantidad) {
        List<String> meses = new ArrayList<>(cantidad);
        for (int i = 0; i < cantidad; i++) meses.add(primero.plusMonths(i).toString());
        return meses;
    }

    private static List<OwnerInsightsDTO.Month> mesesVacios(List<String> meses) {
        return meses.stream().map(mes -> {
            OwnerInsightsDTO.Month m = new OwnerInsightsDTO.Month();
            m.setMonth(mes);
            m.setRevenue(BigDecimal.ZERO);
            return m;
        }).toList();
    }

    private static List<OwnerInsightsDTO.Month> sumarTodo(List<String> meses, List<OwnerInsightsDTO.Branch> branches) {
        List<OwnerInsightsDTO.Month> totales = new ArrayList<>(meses.size());
        for (int i = 0; i < meses.size(); i++) {
            OwnerInsightsDTO.Month t = new OwnerInsightsDTO.Month();
            t.setMonth(meses.get(i));
            BigDecimal plata = BigDecimal.ZERO;
            long altas = 0;
            long bajas = 0;
            for (OwnerInsightsDTO.Branch b : branches) {
                OwnerInsightsDTO.Month m = b.getMonths().get(i);
                plata = plata.add(m.getRevenue());
                altas += m.getNewMembers();
                bajas += m.getChurned();
            }
            t.setRevenue(plata);
            t.setNewMembers(altas);
            t.setChurned(bajas);
            totales.add(t);
        }
        return totales;
    }
}
