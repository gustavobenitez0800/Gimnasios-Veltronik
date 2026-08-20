package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.dto.OwnerInsightsDTO;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * El resumen del dueño sobre todas sus sucursales, contra PostgreSQL de verdad.
 *
 * <p><b>Por qué tiene que ser integración y no un mock.</b> Lo que se está probando acá es
 * justamente lo que un mock no puede: que consultas NATIVAS cross-tenant devuelvan lo
 * correcto. Y hay dos formas específicas en que esto podría fallar en silencio:</p>
 * <ul>
 *   <li><b>Que el filtro de aislamiento las acote a una sola sucursal.</b> Es la razón por
 *       la que las consultas son nativas; si alguien las pasara a JPQL "para prolijear",
 *       el resumen mostraría un tercio de la verdad sin ningún error. El test siembra TRES
 *       sucursales y verifica que aparezcan las tres.</li>
 *   <li><b>Que sume sucursales ajenas.</b> Se siembra una sucursal de OTRO dueño con plata
 *       adentro, y no tiene que aparecer por ningún lado.</li>
 * </ul>
 */
class OwnerInsightsIntegrationTest extends EmbeddedPostgresTest {

    private static final ZoneId AR = ZoneId.of("America/Argentina/Buenos_Aires");

    @Autowired
    private GymOwnerInsightsService insightsService;

    @Autowired
    private JdbcTemplate jdbc;

    private final UUID dueño = UUID.randomUUID();
    private final UUID otroDueño = UUID.randomUUID();

    private UUID centro;
    private UUID norte;
    private UUID sur;
    private UUID ajena;

    @BeforeEach
    void sembrar() {
        crearUsuario(dueño, "dueno-" + dueño + "@test.com");
        crearUsuario(otroDueño, "otro-" + otroDueño + "@test.com");

        centro = crearSucursal("A-Centro", dueño, "OWNER");
        norte = crearSucursal("B-Norte", dueño, "OWNER");
        sur = crearSucursal("C-Sur", dueño, "OWNER");
        ajena = crearSucursal("Z-Ajena", otroDueño, "OWNER");

        autenticar(dueño);
    }

    @AfterEach
    void limpiar() {
        SecurityContextHolder.clearContext();
        TenantContextHolder.clear();
    }

    // ── Los tests ──────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Suma las TRES sucursales del dueño, no solo la que tiene seleccionada")
    void sumaTodasLasSucursalesDelDueño() {
        // La trampa que este test cuida: el dueño llega con una sucursal en el contexto, y
        // si las consultas pasaran por el filtro de aislamiento el resumen quedaría acotado
        // a esa sola — sin error, solo con números de menos.
        TenantContextHolder.setTenantId(centro);

        LocalDateTime esteMes = LocalDateTime.now(AR).withDayOfMonth(15).withHour(10);
        pago(centro, new BigDecimal("100000"), esteMes);
        pago(norte, new BigDecimal("50000"), esteMes);
        pago(sur, new BigDecimal("25000"), esteMes);

        OwnerInsightsDTO out = insightsService.forCurrentOwner(12);

        assertThat(out.getBranches()).extracting(OwnerInsightsDTO.Branch::getName)
                .containsExactly("A-Centro", "B-Norte", "C-Sur"); // ordenadas por nombre
        assertThat(totalDelMesActual(out).getRevenue())
                .isEqualByComparingTo(new BigDecimal("175000"));
    }

    @Test
    @DisplayName("NO suma la sucursal de otro dueño")
    void noSumaSucursalesAjenas() {
        LocalDateTime esteMes = LocalDateTime.now(AR).withDayOfMonth(15).withHour(10);
        pago(centro, new BigDecimal("100000"), esteMes);
        pago(ajena, new BigDecimal("999999"), esteMes); // plata de otro

        OwnerInsightsDTO out = insightsService.forCurrentOwner(12);

        assertThat(out.getBranches()).extracting(OwnerInsightsDTO.Branch::getTenantId)
                .doesNotContain(ajena);
        assertThat(totalDelMesActual(out).getRevenue())
                .isEqualByComparingTo(new BigDecimal("100000"));
    }

    @Test
    @DisplayName("Un pago PENDIENTE no cuenta como plata cobrada")
    void elPendienteNoCuenta() {
        LocalDateTime esteMes = LocalDateTime.now(AR).withDayOfMonth(15).withHour(10);
        pago(centro, new BigDecimal("100000"), esteMes, "paid", null);
        pago(centro, new BigDecimal("77000"), esteMes, "pending", null);

        assertThat(totalDelMesActual(insightsService.forCurrentOwner(12)).getRevenue())
                .isEqualByComparingTo(new BigDecimal("100000"));
    }

    @Test
    @DisplayName("La plata cuenta igual con el estado en mayúscula (datos viejos)")
    void cuentaLosDatosViejosEnMayuscula() {
        LocalDateTime esteMes = LocalDateTime.now(AR).withDayOfMonth(15).withHour(10);
        pago(centro, new BigDecimal("40000"), esteMes, "PAID", null);

        assertThat(totalDelMesActual(insightsService.forCurrentOwner(12)).getRevenue())
                .isEqualByComparingTo(new BigDecimal("40000"));
    }

    @Test
    @DisplayName("Cuenta las altas en el mes en que se dieron de alta")
    void cuentaAltasPorMes() {
        LocalDateTime haceDosMeses = LocalDateTime.now(AR).minusMonths(2).withDayOfMonth(10);
        socio(centro, haceDosMeses, null);
        socio(centro, haceDosMeses, null);
        socio(norte, LocalDateTime.now(AR).withDayOfMonth(5), null);

        OwnerInsightsDTO out = insightsService.forCurrentOwner(12);

        String mesViejo = YearMonth.from(haceDosMeses).toString();
        assertThat(mes(out.getTotals(), mesViejo).getNewMembers()).isEqualTo(2);
        assertThat(totalDelMesActual(out).getNewMembers()).isEqualTo(1);
    }

    @Test
    @DisplayName("Una baja se cuenta en el mes en que se le venció la cuota")
    void cuentaBajasEnElMesDelVencimiento() {
        // Venció hace 3 meses y nunca volvió a pagar → se fue ese mes.
        LocalDateTime vencioHace3Meses = LocalDateTime.now(AR).minusMonths(3).withDayOfMonth(20);
        socio(centro, vencioHace3Meses.minusMonths(1), vencioHace3Meses);

        OwnerInsightsDTO out = insightsService.forCurrentOwner(12);

        assertThat(mes(out.getTotals(), YearMonth.from(vencioHace3Meses).toString()).getChurned())
                .isEqualTo(1);
    }

    @Test
    @DisplayName("El que se atrasó unos días NO figura como baja todavía")
    void elAtrasadoRecienteNoEsBaja() {
        // Esto es el período de gracia de 30 días haciendo su trabajo: sin él, todo el que
        // se atrasa una semana aparecería como que se fue.
        LocalDateTime vencioHace5Dias = LocalDateTime.now(AR).minusDays(5);
        socio(centro, vencioHace5Dias.minusMonths(1), vencioHace5Dias);

        OwnerInsightsDTO out = insightsService.forCurrentOwner(12);

        long bajasTotales = out.getTotals().stream().mapToLong(OwnerInsightsDTO.Month::getChurned).sum();
        assertThat(bajasTotales).isZero();
    }

    @Test
    @DisplayName("El socio al día no es baja")
    void elSocioAlDiaNoEsBaja() {
        LocalDateTime venceElMesQueViene = LocalDateTime.now(AR).plusMonths(1);
        socio(centro, LocalDateTime.now(AR).minusMonths(2), venceElMesQueViene);

        long bajas = insightsService.forCurrentOwner(12).getTotals().stream()
                .mapToLong(OwnerInsightsDTO.Month::getChurned).sum();
        assertThat(bajas).isZero();
    }

    @Test
    @DisplayName("Devuelve 12 meses calendario y marca desde dónde las bajas son provisorias")
    void devuelveLaVentanaCompleta() {
        OwnerInsightsDTO out = insightsService.forCurrentOwner(12);

        assertThat(out.getMonths()).hasSize(12);
        assertThat(out.getMonths().get(11)).isEqualTo(YearMonth.now(AR).toString()); // el último es el actual
        assertThat(out.getGraceDays()).isEqualTo(30);
        assertThat(out.getProvisionalFrom())
                .isEqualTo(YearMonth.from(LocalDateTime.now(AR).minusDays(30)).toString());
        // Cada sucursal trae los 12 meses, con ceros donde no hubo nada.
        assertThat(out.getBranches()).allSatisfy(b -> assertThat(b.getMonths()).hasSize(12));
    }

    @Test
    @DisplayName("Quien no es dueño de nada recibe un resumen vacío, no un error")
    void sinSucursalesPropiasNoRompe() {
        UUID empleado = UUID.randomUUID();
        crearUsuario(empleado, "empleado-" + empleado + "@test.com");
        membresia(empleado, centro, "STAFF"); // trabaja en Centro, pero no es dueño
        autenticar(empleado);

        OwnerInsightsDTO out = insightsService.forCurrentOwner(12);

        assertThat(out.getBranches()).isEmpty();
        assertThat(out.getMonths()).hasSize(12); // la ventana igual viene armada
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private void autenticar(UUID userId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "ES256").subject(userId.toString())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt, List.of()));
    }

    private void crearUsuario(UUID id, String email) {
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO app_user (id, created_at, updated_at, email) VALUES (?,?,?,?)",
                id, now, now, email);
    }

    private UUID crearSucursal(String nombre, UUID ownerId, String rol) {
        UUID id = UUID.randomUUID();
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type) VALUES (?,?,?,?,?)",
                id, now, now, nombre, "GYM");
        membresia(ownerId, id, rol);
        return id;
    }

    private void membresia(UUID userId, UUID tenantId, String rol) {
        LocalDateTime now = LocalDateTime.now();
        jdbc.update("INSERT INTO tenant_membership (id, created_at, updated_at, user_id, tenant_id, role, is_active) "
                        + "VALUES (?,?,?,?,?,?,?)",
                UUID.randomUUID(), now, now, userId, tenantId, rol, true);
    }

    private void pago(UUID tenantId, BigDecimal monto, LocalDateTime fecha) {
        pago(tenantId, monto, fecha, "paid", null);
    }

    private void pago(UUID tenantId, BigDecimal monto, LocalDateTime fecha, String status, LocalDateTime periodEnd) {
        UUID socioId = socio(tenantId, fecha, null);
        jdbc.update("INSERT INTO gym_payments (id, created_at, updated_at, tenant_id, member_id, amount, "
                        + "payment_date, status, period_end) VALUES (?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID(), fecha, fecha, tenantId, socioId, monto, fecha, status, periodEnd);
    }

    /** @return el id del socio creado. `altaEn` va a created_at: es lo que cuenta como alta. */
    private UUID socio(UUID tenantId, LocalDateTime altaEn, LocalDateTime venceEn) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO gym_members (id, created_at, updated_at, tenant_id, first_name, last_name, "
                        + "email, is_active, membership_end) VALUES (?,?,?,?,?,?,?,?,?)",
                id, altaEn, altaEn, tenantId, "Socio", id.toString().substring(0, 8),
                id + "@test.com", true, venceEn);
        return id;
    }

    private OwnerInsightsDTO.Month totalDelMesActual(OwnerInsightsDTO out) {
        return mes(out.getTotals(), YearMonth.now(AR).toString());
    }

    private OwnerInsightsDTO.Month mes(List<OwnerInsightsDTO.Month> meses, String mes) {
        return meses.stream().filter(m -> m.getMonth().equals(mes)).findFirst().orElseThrow();
    }
}
