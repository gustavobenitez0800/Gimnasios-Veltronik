package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.DashboardResumenDTO;
import com.veltronik.v2.gym.dto.GymMemberDTO;
import com.veltronik.v2.gym.mappers.GymMemberMapper;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class GymDashboardService {

    /**
     * Zona horaria del negocio (Argentina). Los timestamps se guardan SIN zona
     * ({@code timestamp without time zone}), representando la hora de pared de Argentina
     * (los pagos quedan a las 00:00 del día calendario AR).
     *
     * <p>Calcular el "mes actual" o el "ahora" con la zona del servidor (Railway corre
     * en UTC) corría el límite hasta 3 horas: en la franja 21:00–23:59 AR del último día
     * del mes, UTC ya marcaba el mes siguiente y "Ingresos del Mes" daba $0. Anclando los
     * cálculos a esta zona, la comparación es naive-AR vs naive-AR: exacta. Se usa el id
     * IANA (no un offset fijo {@code -03:00}) para ser robusto ante cualquier regla de DST.</p>
     */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

    private final GymMemberRepository memberRepository;
    private final GymPaymentRepository paymentRepository;
    private final GymMemberMapper memberMapper;
    private final com.veltronik.v2.gym.security.MemberAccessPolicy accessPolicy;

    public Map<String, Object> getDashboardStats() {
        UUID tenantId = TenantContextHolder.getTenantId();
        
        long totalMembers = memberRepository.countByTenantId(tenantId);
        long activeMembers = memberRepository.countByTenantIdAndIsActiveTrue(tenantId);

        // "Mes actual" y "ahora" en hora de Argentina (no la del servidor UTC).
        LocalDateTime startOfMonth = YearMonth.now(BUSINESS_ZONE).atDay(1).atStartOfDay();
        BigDecimal monthlyRevenue = paymentRepository.sumAmountByTenantIdAndDateAfter(tenantId, startOfMonth);

        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);
        LocalDateTime in7Days = now.plusDays(7);
        // COUNT en BD: el dashboard solo necesita el número, no las entidades.
        long expiringMembers = memberRepository.countByTenantIdAndMembershipEndBetween(tenantId, now, in7Days);
        long expiredMembers = memberRepository.countByTenantIdAndIsActiveTrueAndMembershipEndBefore(tenantId, now);

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalMembers", totalMembers);
        stats.put("activeMembers", activeMembers);
        stats.put("inactiveMembers", totalMembers - activeMembers);
        stats.put("monthlyRevenue", monthlyRevenue != null ? monthlyRevenue : BigDecimal.ZERO);
        stats.put("expiringMembers", expiringMembers);
        stats.put("expiredMembers", expiredMembers);

        return stats;
    }

    /**
     * Todo el Dashboard en un solo viaje, y contado en la base.
     *
     * <p>⭐ Reemplaza al trío {@code stats + TODOS los socios + TODOS los pagos} que la
     * pantalla pedía en cada apertura. Con 385 socios y un año de cobros eso eran miles de
     * filas —cada socio con su ficha entera— cruzando la conexión del gimnasio para pintar
     * cuatro números y dos gráficos. Lo que se manda ahora son conteos, una serie por mes y
     * dos listas cortas.</p>
     *
     * <p><b>Los criterios son los MISMOS que usaba la pantalla</b>, a propósito: si el número
     * cambiara al mudar la cuenta al servidor, el dueño vería que "el sistema empezó a decir
     * otra cosa" y no habría forma de saber cuál de las dos versiones tenía razón.</p>
     */
    @Transactional(readOnly = true)
    public DashboardResumenDTO getResumen() {
        UUID tenantId = TenantContextHolder.getTenantId();
        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);

        // ── El padrón, contado por estado ──
        long total = memberRepository.countByTenantId(tenantId);
        long activosSegunAlta = memberRepository.countByTenantIdAndIsActiveTrue(tenantId);
        long vencidos = memberRepository.countByTenantIdAndIsActiveTrueAndMembershipEndBefore(tenantId, ahora);
        DashboardResumenDTO.Socios socios = new DashboardResumenDTO.Socios(
                total,
                activosSegunAlta - vencidos,   // activo Y con la cuota al día
                total - activosSegunAlta,      // dados de baja
                vencidos,
                0);                            // ver el comentario del record

        // ── Los ingresos, agrupados por mes en Postgres ──
        List<DashboardResumenDTO.MesConTotal> serie = paymentRepository.ingresosPorMes(tenantId).stream()
                .map(fila -> new DashboardResumenDTO.MesConTotal(
                        ((java.sql.Timestamp) fila[0]).toLocalDateTime(),
                        (BigDecimal) fila[1]))
                .toList();

        YearMonth esteMes = YearMonth.now(BUSINESS_ZONE);
        DashboardResumenDTO.Ingresos ingresos = new DashboardResumenDTO.Ingresos(
                totalDelMes(serie, esteMes),
                totalDelMes(serie, esteMes.minusMonths(1)),
                serie);

        // ── Quiénes necesitan atención: vencidos y los que vencen en 7 días ──
        LocalDateTime en7Dias = ahora.plusDays(7);
        long estaSemana = memberRepository.countByTenantIdAndMembershipEndBetween(tenantId, ahora, en7Dias);
        long cuantosNecesitanAtencion = memberRepository.contarVencidosOPorVencer(tenantId, en7Dias);
        List<DashboardResumenDTO.Alerta> alertas = memberRepository
                .vencidosOPorVencer(tenantId, en7Dias, org.springframework.data.domain.PageRequest.of(0, MAXIMO_ALERTAS))
                .stream()
                .map(m -> new DashboardResumenDTO.Alerta(
                        m.getId(),
                        (nullSafe(m.getFirstName()) + " " + nullSafe(m.getLastName())).trim(),
                        // Hacia ARRIBA, como en la lista de socios: al que le quedan 12 horas
                        // le falta "1 día", no cero. Negativo = ya venció.
                        (long) Math.ceil(java.time.Duration.between(ahora, m.getMembershipEnd()).toMinutes() / 1440.0),
                        m.getMembershipEnd()))
                .toList();

        // ── Los cumpleaños de hoy y las últimas altas ──
        List<String> cumplen = memberRepository.cumplenHoy(tenantId, String.format("%02d-%02d", ahora.getMonthValue(), ahora.getDayOfMonth()))
                .stream()
                .map(m -> (nullSafe(m.getFirstName()) + " " + nullSafe(m.getLastName())).trim())
                .toList();

        List<GymMemberDTO> ultimos = memberMapper.toDtoList(
                memberRepository.findTop25ByTenantIdOrderByCreatedAtDesc(tenantId).stream().limit(5).toList(),
                accessPolicy);

        return new DashboardResumenDTO(socios, ingresos,
                new DashboardResumenDTO.Vencimientos(estaSemana, cuantosNecesitanAtencion, alertas),
                cumplen, ultimos);
    }

    /** Cuántos son los más urgentes que se mandan. El resto se cuenta, no se manda. */
    private static final int MAXIMO_ALERTAS = 20;

    /** El total de un mes dentro de la serie, o cero si ese mes no tuvo cobros. */
    private BigDecimal totalDelMes(List<DashboardResumenDTO.MesConTotal> serie, YearMonth mes) {
        return serie.stream()
                .filter(m -> YearMonth.from(m.mes()).equals(mes))
                .map(DashboardResumenDTO.MesConTotal::total)
                .findFirst()
                .orElse(BigDecimal.ZERO);
    }

    private static String nullSafe(String s) {
        return s == null ? "" : s;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getRetentionAnalytics() {
        UUID tenantId = TenantContextHolder.getTenantId();
        
        long totalMembers = memberRepository.countByTenantId(tenantId);
        long activeMembers = memberRepository.countByTenantIdAndIsActiveTrue(tenantId);
        long inactiveMembers = totalMembers - activeMembers;
        
        double retentionRate = totalMembers > 0 ? ((double) activeMembers / totalMembers) * 100.0 : 0.0;

        LocalDateTime now = LocalDateTime.now(BUSINESS_ZONE);
        LocalDateTime in7Days = now.plusDays(7);
        
        // Expiring soon: Memberships ending between now and next 7 days
        var expiringSoon = memberRepository.findByTenantIdAndMembershipEndBetween(tenantId, now, in7Days);
        
        // At risk: Members who are marked active but their membership has already expired
        var atRisk = memberRepository.findByTenantIdAndIsActiveTrueAndMembershipEndBefore(tenantId, now);
        
        Map<String, Object> analytics = new HashMap<>();
        analytics.put("total_members", totalMembers);
        analytics.put("active_members", activeMembers);
        analytics.put("inactive_members", inactiveMembers);
        analytics.put("retention_rate", Math.round(retentionRate));
        // DTO (no la entidad cruda): el front lee fullName/membershipEnd/phone. Con la entidad
        // cruda llegaban firstName/lastName (NO fullName) → los socios salían sin nombre, y se
        // exponia la entidad JPA (con su tenant lazy → riesgo de 500). Mandamiento #5.
        analytics.put("expiring_soon", memberMapper.toDtoList(expiringSoon, accessPolicy));
        analytics.put("at_risk", memberMapper.toDtoList(atRisk, accessPolicy));

        return analytics;
    }
}
