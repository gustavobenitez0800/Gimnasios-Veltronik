package com.veltronik.v2.core.security;

import com.veltronik.v2.core.entities.Device;
import com.veltronik.v2.core.entities.DeviceStatus;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.DeviceRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * LA SEGUNDA LLAVE (Fase 3): un equipo enrolado queda atado a SU sucursal.
 *
 * <p>La primera llave —la membresía— dice qué sucursales puede tocar la PERSONA, y ya
 * estaba. Esta dice cuál puede tocar la MÁQUINA, y es la que responde al pedido concreto
 * del dueño: que un empleado con acceso a dos sucursales no pueda abrir la otra desde el
 * mostrador donde está parado.</p>
 *
 * <p>Lo que se prueba es la matriz completa de decisiones, incluidos los casos donde el
 * filtro tiene que DEJAR PASAR: si se pasara de estricto dejaría un gimnasio sin poder
 * trabajar, que es peor que el problema que resuelve.</p>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TenantContextFilterDeviceBindingTest {

    @Mock private TenantMembershipRepository membershipRepository;
    @Mock private DeviceRepository deviceRepository;
    @Mock private FilterChain chain;

    private MembershipCache membershipCache;
    private DeviceBindingCache bindingCache;
    private TenantContextFilter filter;

    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

    private final UUID userId = UUID.randomUUID();
    private final UUID sucursalCentro = UUID.randomUUID();
    private final UUID sucursalNorte = UUID.randomUUID();
    private final UUID terminalDeCentro = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        membershipCache = new MembershipCache();
        bindingCache = new DeviceBindingCache();
        filter = new TenantContextFilter(membershipRepository, membershipCache, deviceRepository, bindingCache);

        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();

        // Usuario autenticado (Supabase pone el id del usuario en el claim "sub").
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "ES256")
                .subject(userId.toString())
                .claim("email", "empleado@gimnasio.com")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, List.of()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContextHolder.clear();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /** El usuario es miembro de la sucursal pedida, con ese rol. */
    private void conMembresia(UUID tenantId, UserRole role) {
        membershipCache.put(userId, tenantId, role);
    }

    /** El equipo está enrolado y ACTIVO en esa sucursal. */
    private void equipoEnroladoEn(UUID deviceId, UUID tenantId) {
        Device device = new Device();
        device.setId(deviceId);
        device.setEnrolledTenantId(tenantId);
        device.setStatus(DeviceStatus.ACTIVE);
        when(deviceRepository.findById(deviceId)).thenReturn(Optional.of(device));
    }

    private void pedirSucursal(UUID tenantId, UUID deviceId) throws Exception {
        request.addHeader("X-Tenant-ID", tenantId.toString());
        if (deviceId != null) request.addHeader("X-Device-Id", deviceId.toString());
        filter.doFilter(request, response, chain);
    }

    private void assertPasa() throws Exception {
        verify(chain).doFilter(any(), any());
        assertThat(response.getStatus()).isEqualTo(200);
    }

    private void assertBloqueadoPorEquipo() throws Exception {
        verify(chain, never()).doFilter(any(), any());
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("DEVICE_BOUND_TO_OTHER_TENANT");
    }

    // ── El caso que motivó todo ────────────────────────────────────────────────

    @Test
    @DisplayName("Empleado de dos sucursales NO puede abrir la otra desde el terminal de Centro")
    void empleadoNoCruzaDeSucursalDesdeUnTerminalEnrolado() throws Exception {
        conMembresia(sucursalNorte, UserRole.STAFF);   // sí es miembro de Norte...
        equipoEnroladoEn(terminalDeCentro, sucursalCentro); // ...pero el equipo es de Centro

        pedirSucursal(sucursalNorte, terminalDeCentro);

        assertBloqueadoPorEquipo();
    }

    @Test
    @DisplayName("El mismo empleado SÍ trabaja la sucursal del terminal")
    void empleadoTrabajaLaSucursalDeSuTerminal() throws Exception {
        conMembresia(sucursalCentro, UserRole.STAFF);
        equipoEnroladoEn(terminalDeCentro, sucursalCentro);

        pedirSucursal(sucursalCentro, terminalDeCentro);

        assertPasa();
    }

    @Test
    @DisplayName("RECEPCIÓN queda atada igual que STAFF")
    void recepcionTambienQuedaAtada() throws Exception {
        conMembresia(sucursalNorte, UserRole.RECEPTION);
        equipoEnroladoEn(terminalDeCentro, sucursalCentro);

        pedirSucursal(sucursalNorte, terminalDeCentro);

        assertBloqueadoPorEquipo();
    }

    // ── Las exenciones, que importan tanto como la regla ───────────────────────

    @Test
    @DisplayName("El DUEÑO entra a cualquiera de sus sucursales desde cualquier equipo")
    void elDuenoNoQuedaEncerrado() throws Exception {
        conMembresia(sucursalNorte, UserRole.OWNER);
        equipoEnroladoEn(terminalDeCentro, sucursalCentro);

        pedirSucursal(sucursalNorte, terminalDeCentro);

        assertPasa();
        // Ni siquiera se molesta en consultar la atadura: se corta antes.
        verify(deviceRepository, never()).findById(any());
    }

    @Test
    @DisplayName("Equipo SIN enrolar (todo navegador web) pasa sin restricción")
    void equipoSinEnrolarNoRestringe() throws Exception {
        conMembresia(sucursalNorte, UserRole.STAFF);
        when(deviceRepository.findById(any())).thenReturn(Optional.empty());

        pedirSucursal(sucursalNorte, UUID.randomUUID());

        assertPasa();
    }

    @Test
    @DisplayName("Equipo REVOCADO deja de atar: se lo trata como no enrolado")
    void equipoRevocadoNoAta() throws Exception {
        conMembresia(sucursalNorte, UserRole.STAFF);
        Device revocado = new Device();
        revocado.setId(terminalDeCentro);
        revocado.setEnrolledTenantId(sucursalCentro);
        revocado.setStatus(DeviceStatus.REVOKED);
        when(deviceRepository.findById(terminalDeCentro)).thenReturn(Optional.of(revocado));

        pedirSucursal(sucursalNorte, terminalDeCentro);

        assertPasa();
    }

    @Test
    @DisplayName("Sin X-Device-Id no hay atadura que verificar")
    void sinDniDeEquipoPasa() throws Exception {
        conMembresia(sucursalNorte, UserRole.STAFF);

        pedirSucursal(sucursalNorte, null);

        assertPasa();
        verify(deviceRepository, never()).findById(any());
    }

    @Test
    @DisplayName("Si la base se cae, la atadura FALLA ABIERTA: no deja un gimnasio sin trabajar")
    void fallaAbiertaSiLaBaseSeCae() throws Exception {
        conMembresia(sucursalNorte, UserRole.STAFF);
        when(deviceRepository.findById(any())).thenThrow(new RuntimeException("base caída"));

        pedirSucursal(sucursalNorte, terminalDeCentro);

        // Pasa igual: el aislamiento fuerte (la membresía) ya se aplicó arriba, así que
        // lo peor que puede pasar es ver una sucursal PROPIA desde el equipo equivocado.
        assertPasa();
    }

    // ── Que la caché no cambie la respuesta, solo la velocidad ─────────────────

    @Test
    @DisplayName("La segunda request no vuelve a la base, y decide igual")
    void laCacheNoCambiaElVeredicto() throws Exception {
        conMembresia(sucursalNorte, UserRole.STAFF);
        equipoEnroladoEn(terminalDeCentro, sucursalCentro);

        pedirSucursal(sucursalNorte, terminalDeCentro);
        assertBloqueadoPorEquipo();

        // Segunda request, request/response nuevos.
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        pedirSucursal(sucursalNorte, terminalDeCentro);

        assertThat(response.getStatus()).isEqualTo(403);
        verify(deviceRepository, times(1)).findById(terminalDeCentro); // una sola consulta
    }
}
