package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.AppUser;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.TenantMembership;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.repositories.AppUserRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import com.veltronik.v2.core.security.MembershipCache;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.repositories.AccessLogRepository;
import com.veltronik.v2.gym.repositories.GymMemberRepository;
import com.veltronik.v2.gym.repositories.GymPaymentRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Tests de la validación de roles asignables (parseAssignableRole, vía inviteMember/updateRole).
 *
 * SEGURIDAD (escalación de privilegios): el rol OWNER NUNCA puede asignarse desde la
 * gestión de equipo — un OWNER inyectado quedaría irremovible y con poder total.
 */
@ExtendWith(MockitoExtension.class)
class GymTeamServiceTest {

    @Mock
    private TenantMembershipRepository membershipRepository;
    @Mock
    private AppUserRepository userRepository;
    @Mock
    private TenantRepository tenantRepository;
    @Mock
    private AccessLogRepository accessLogRepository;
    @Mock
    private GymPaymentRepository paymentRepository;
    @Mock
    private GymMemberRepository memberRepository;
    @Mock
    private MembershipCache membershipCache;
    @Mock
    private com.veltronik.v2.core.services.SupabaseAdminService supabaseAdminService;

    @InjectMocks
    private GymTeamService service;

    private final UUID tenantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private Tenant tenant;
    private AppUser user;

    @BeforeEach
    void setUp() {
        TenantContextHolder.setTenantId(tenantId);

        tenant = new Tenant();
        tenant.setId(tenantId);

        user = new AppUser();
        user.setId(userId);
        user.setEmail("empleado@gym.com");
        user.setFirstName("Juan");
        user.setLastName("Pérez");
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    /** Mocks mínimos para que inviteMember llegue hasta la validación del rol. */
    private void givenTenantExists() {
        when(tenantRepository.findById(tenantId)).thenReturn(Optional.of(tenant));
    }

    /**
     * Ojo con el orden: el rol se valida ANTES de buscar al usuario, así que los tests que
     * rechazan un rol nunca llegan a esta segunda consulta. No es un detalle — desde que
     * el alta puede CREAR la cuenta, validar el rol tarde dejaría una cuenta huérfana en
     * Supabase cada vez que alguien manda un rol inválido.
     */
    private void givenTenantAndUserExist() {
        givenTenantExists();
        when(userRepository.findByEmail(user.getEmail())).thenReturn(Optional.of(user));
    }

    private TenantMembership membershipWithRole(UserRole role) {
        TenantMembership membership = new TenantMembership();
        membership.setUser(user);
        membership.setTenant(tenant);
        membership.setRole(role);
        membership.setActive(true);
        return membership;
    }

    // ──────────────────── inviteMember: validación de rol ────────────────────

    @Test
    @DisplayName("inviteMember rechaza el rol OWNER (escalación de privilegios)")
    void inviteMemberRejectsOwnerRole() {
        givenTenantExists();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.inviteMember(user.getEmail(), "OWNER", "Empleado de Prueba"));
        assertTrue(ex.getMessage().contains("dueño"));
        verify(membershipRepository, never()).save(any());
    }

    @Test
    @DisplayName("inviteMember rechaza 'owner' también en minúscula")
    void inviteMemberRejectsOwnerRoleLowercase() {
        givenTenantExists();

        assertThrows(BusinessException.class, () -> service.inviteMember(user.getEmail(), "owner", "Empleado de Prueba"));
        verify(membershipRepository, never()).save(any());
    }

    @Test
    @DisplayName("inviteMember rechaza un rol inexistente")
    void inviteMemberRejectsUnknownRole() {
        givenTenantExists();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.inviteMember(user.getEmail(), "SUPERADMIN", "Empleado de Prueba"));
        assertEquals("Rol no válido", ex.getMessage());
        verify(membershipRepository, never()).save(any());
    }

    @Test
    @DisplayName("inviteMember rechaza un rol null")
    void inviteMemberRejectsNullRole() {
        givenTenantExists();

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.inviteMember(user.getEmail(), null, "Empleado de Prueba"));
        assertEquals("Rol no válido", ex.getMessage());
        verify(membershipRepository, never()).save(any());
    }

    @Test
    @DisplayName("inviteMember acepta un rol asignable (admin) y crea la membresía")
    void inviteMemberAcceptsAssignableRole() {
        givenTenantAndUserExist();
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId)).thenReturn(Optional.empty());

        Map<String, Object> result = service.inviteMember(user.getEmail(), "admin", "Empleado de Prueba");

        assertEquals("admin", result.get("role"));
        ArgumentCaptor<TenantMembership> captor = ArgumentCaptor.forClass(TenantMembership.class);
        verify(membershipRepository).save(captor.capture());
        TenantMembership saved = captor.getValue();
        assertEquals(UserRole.ADMIN, saved.getRole());
        assertTrue(saved.isActive());
        assertEquals(userId, saved.getUser().getId());
        assertEquals(tenantId, saved.getTenant().getId());
    }

    @Test
    @DisplayName("inviteMember reactiva una membresía inactiva con el rol nuevo (nunca OWNER)")
    void inviteMemberReactivatesInactiveMembership() {
        givenTenantAndUserExist();
        TenantMembership inactive = membershipWithRole(UserRole.STAFF);
        inactive.setActive(false);
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId)).thenReturn(Optional.of(inactive));

        Map<String, Object> result = service.inviteMember(user.getEmail(), "RECEPTION", "Empleado de Prueba");

        assertEquals("reception", result.get("role"));
        assertTrue(inactive.isActive());
        assertEquals(UserRole.RECEPTION, inactive.getRole());
        verify(membershipRepository).save(inactive);
    }

    @Test
    @DisplayName("inviteMember rechaza invitar a quien ya pertenece al equipo")
    void inviteMemberRejectsAlreadyActiveMember() {
        givenTenantAndUserExist();
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId))
                .thenReturn(Optional.of(membershipWithRole(UserRole.STAFF)));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.inviteMember(user.getEmail(), "STAFF", "Empleado de Prueba"));
        assertTrue(ex.getMessage().contains("ya pertenece"));
        verify(membershipRepository, never()).save(any());
    }

    // ──────────────────── updateRole: validación de rol ────────────────────

    @Test
    @DisplayName("updateRole rechaza promover a OWNER")
    void updateRoleRejectsOwnerRole() {
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId))
                .thenReturn(Optional.of(membershipWithRole(UserRole.STAFF)));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.updateRole(userId, "OWNER"));
        assertTrue(ex.getMessage().contains("dueño"));
        verify(membershipRepository, never()).save(any());
    }

    @Test
    @DisplayName("updateRole rechaza un rol inexistente")
    void updateRoleRejectsUnknownRole() {
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId))
                .thenReturn(Optional.of(membershipWithRole(UserRole.STAFF)));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.updateRole(userId, "HACKER"));
        assertEquals("Rol no válido", ex.getMessage());
        verify(membershipRepository, never()).save(any());
    }

    @Test
    @DisplayName("updateRole no permite tocar el rol del OWNER actual")
    void updateRoleProtectsExistingOwner() {
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId))
                .thenReturn(Optional.of(membershipWithRole(UserRole.OWNER)));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.updateRole(userId, "staff"));
        assertTrue(ex.getMessage().contains("dueño"));
        verify(membershipRepository, never()).save(any());
    }

    @Test
    @DisplayName("updateRole acepta un cambio de rol válido (staff → admin)")
    void updateRoleAcceptsValidChange() {
        TenantMembership membership = membershipWithRole(UserRole.STAFF);
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId))
                .thenReturn(Optional.of(membership));

        Map<String, Object> result = service.updateRole(userId, "admin");

        assertEquals("admin", result.get("role"));
        assertEquals(UserRole.ADMIN, membership.getRole());
        verify(membershipRepository).save(membership);
        // El rol cambiado debe invalidar la caché de seguridad (efecto inmediato del nuevo rol).
        verify(membershipCache).evict(userId, tenantId);
    }

    // ── Alta de empleados SIN que se registren solos ───────────────────────────

    @Test
    @DisplayName("Si el empleado no tiene cuenta, se la crea y devuelve la contraseña una sola vez")
    void inviteMemberCreatesAccountWhenMissing() {
        // El caso que motivó todo: el dueño no tendría que decirle "andá a registrarte y
        // después decime qué email usaste".
        givenTenantExists();
        String nuevoEmail = "recepcion@gimnasio.com";
        UUID nuevoId = UUID.randomUUID();
        AppUser creado = new AppUser();
        creado.setId(nuevoId);
        creado.setEmail(nuevoEmail);
        creado.setFirstName("Mariana");
        creado.setLastName("López");

        when(userRepository.findByEmail(nuevoEmail)).thenReturn(Optional.empty(), Optional.of(creado));
        when(supabaseAdminService.isAvailable()).thenReturn(true);
        when(supabaseAdminService.createUser(nuevoEmail, "Mariana López"))
                .thenReturn(new com.veltronik.v2.core.services.SupabaseAdminService.CreatedUser(nuevoId, "ABCD-2345-WXYZ"));
        when(membershipRepository.findByUserIdAndTenantId(nuevoId, tenantId)).thenReturn(Optional.empty());

        Map<String, Object> result = service.inviteMember(nuevoEmail, "reception", "Mariana López");

        assertEquals("reception", result.get("role"));
        assertEquals(Boolean.TRUE, result.get("accountCreated"));
        assertEquals("ABCD-2345-WXYZ", result.get("temporaryPassword"));
        verify(membershipRepository).save(any(TenantMembership.class));
    }

    @Test
    @DisplayName("Si el empleado YA tiene cuenta, se vincula la que hay y NO se devuelve contraseña")
    void inviteMemberDoesNotCreateWhenUserExists() {
        // Caso real: la persona ya trabaja en otra sucursal del mismo dueño. Crear una
        // cuenta nueva le rompería el acceso a la otra.
        givenTenantAndUserExist();
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId)).thenReturn(Optional.empty());

        Map<String, Object> result = service.inviteMember(user.getEmail(), "staff", "No Importa");

        assertEquals(Boolean.FALSE, result.get("accountCreated"));
        assertNull(result.get("temporaryPassword"));
        verify(supabaseAdminService, never()).createUser(any(), any());
    }

    @Test
    @DisplayName("Sin credencial de servicio configurada, se explica qué hacer en vez de romper")
    void inviteMemberFallsBackWhenAdminUnavailable() {
        // El servidor puede estar sin la clave de servicio (es un secreto que se carga a
        // mano). No es motivo para tirar un error técnico en la cara del dueño.
        givenTenantExists();
        when(userRepository.findByEmail("nadie@gimnasio.com")).thenReturn(Optional.empty());
        when(supabaseAdminService.isAvailable()).thenReturn(false);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.inviteMember("nadie@gimnasio.com", "staff", "Alguien"));

        assertTrue(ex.getMessage().contains("cuenta registrada"));
        verify(membershipRepository, never()).save(any());
    }

    @Test
    @DisplayName("El email se normaliza: mayúsculas y espacios no crean cuentas duplicadas")
    void inviteMemberNormalizesEmail() {
        // Sin esto, "Recepcion@Gym.com " y "recepcion@gym.com" serían dos personas.
        givenTenantAndUserExist();
        when(membershipRepository.findByUserIdAndTenantId(userId, tenantId)).thenReturn(Optional.empty());

        service.inviteMember("  " + user.getEmail().toUpperCase() + "  ", "staff", "Alguien");

        verify(userRepository).findByEmail(user.getEmail());
    }
}
