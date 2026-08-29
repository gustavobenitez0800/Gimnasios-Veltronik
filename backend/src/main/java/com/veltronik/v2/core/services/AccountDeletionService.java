package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.AppUser;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.entities.UserRole;
import com.veltronik.v2.core.repositories.AppUserRepository;
import com.veltronik.v2.core.repositories.TenantMembershipRepository;
import com.veltronik.v2.core.repositories.SubscriptionRepository;
import com.veltronik.v2.core.repositories.TenantRepository;
import jakarta.persistence.EntityManager;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Borrar la cuenta entera: los gimnasios, los socios, los cobros y el login.
 *
 * <p><b>No confundir con cancelar la suscripción.</b> Cancelar corta el cobro y deja todo
 * intacto: el cliente vuelve cuando quiere y encuentra sus datos. Esto borra. Son la puerta
 * de salida y la demolición, y no se parecen en nada.</p>
 *
 * <p><b>Todo lo de acá está diseñado alrededor de una sola idea:</b> que arrepentirse a los
 * 29 días sea trivial, y que a los 31 sea imposible. Por eso el borrado nunca es inmediato,
 * el sistema se cierra pero el login sigue abierto, y la purga es un trabajo aparte que corre
 * de noche.</p>
 */
@Service
@Slf4j
public class AccountDeletionService {

    private final AppUserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final TenantService tenantService;
    private final TenantMembershipRepository membershipRepository;
    private final BillingService billingService;
    private final SubscriptionRepository subscriptionRepository;
    private final SupabaseAdminService supabaseAdmin;
    private final EntityManager em;

    private static final java.time.ZoneId BUSINESS_ZONE =
            java.time.ZoneId.of("America/Argentina/Buenos_Aires");

    private final int graciaDias;

    public AccountDeletionService(AppUserRepository userRepository,
                                  TenantRepository tenantRepository,
                                  TenantService tenantService,
                                  TenantMembershipRepository membershipRepository,
                                  BillingService billingService,
                                  SubscriptionRepository subscriptionRepository,
                                  SupabaseAdminService supabaseAdmin,
                                  EntityManager em,
                                  @Value("${veltronik.account.deletion-grace-days:30}") int graciaDias) {
        this.userRepository = userRepository;
        this.tenantRepository = tenantRepository;
        this.tenantService = tenantService;
        this.membershipRepository = membershipRepository;
        this.billingService = billingService;
        this.subscriptionRepository = subscriptionRepository;
        this.supabaseAdmin = supabaseAdmin;
        this.em = em;
        this.graciaDias = graciaDias;
    }

    /** Lo que ve la pantalla de "tu cuenta se está borrando". */
    public record EstadoBorrado(boolean pendiente, LocalDateTime pedido, LocalDateTime programado,
                                long diasRestantes, int gimnasios) {}

    // ─────────────────────────────────────────────────────────────────────────
    // Pedir el borrado
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Marca la cuenta para borrarse dentro de {@code graciaDias}.
     *
     * <p><b>Lo primero que hace es cortar el cobro.</b> No es un detalle de orden: si la
     * suscripción siguiera viva, Mercado Pago le seguiría debitando la tarjeta a alguien que
     * pidió que le borren la cuenta. De todos los errores posibles acá, ese es el peor —y el
     * que más rápido se convierte en un reclamo.</p>
     *
     * <p>Si cancelar falla, el borrado NO se registra: es preferible que el cliente tenga que
     * reintentar a dejarlo marcado para borrar y cobrándole igual.</p>
     */
    @Transactional
    public EstadoBorrado solicitar(UUID userId) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Usuario inexistente"));

        if (user.getDeletionScheduledAt() != null) {
            return estado(user); // ya estaba pedido: no se reinicia el reloj
        }

        List<Tenant> propios = gimnasiosPropios(userId);

        // 1) Cortar el cobro ANTES de marcar nada.
        for (Tenant t : propios) {
            // Se pregunta si hay algo que cancelar en vez de intentarlo y ver qué pasa.
            //
            // No es un detalle: `cancelSubscription` LANZA cuando no hay suscripción, y un
            // gimnasio en período de prueba —o uno que nunca cargó la tarjeta— no tiene
            // ninguna. Sin esta pregunta, esa gente quedaba atrapada: pedían borrar su cuenta
            // y el sistema respondía "no pudimos dar de baja el cobro" para siempre, por un
            // cobro que nunca existió.
            boolean tieneSuscripcion = subscriptionRepository
                    .findFirstByTenantIdOrderByCreatedAtDesc(t.getId()).isPresent();
            if (!tieneSuscripcion) continue;

            try {
                billingService.cancelSubscription(t);
            } catch (Exception e) {
                log.error("No se pudo cancelar la suscripción del gimnasio {} al pedir el borrado de cuenta. "
                        + "El borrado NO se registra.", t.getId(), e);
                throw new IllegalStateException(
                        "No pudimos dar de baja el cobro automático. No marcamos la cuenta para borrar "
                        + "hasta resolverlo, para que no te sigan cobrando.");
            }
        }

        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        LocalDateTime cuando = ahora.plusDays(graciaDias);

        // 2) Marcar la cuenta y cerrar sus gimnasios.
        user.setDeletionRequestedAt(ahora);
        user.setDeletionScheduledAt(cuando);
        userRepository.save(user);

        for (Tenant t : propios) {
            t.setDeletionScheduledAt(cuando);
        }
        tenantRepository.saveAll(propios);

        log.warn("Cuenta {} marcada para borrado el {} ({} gimnasios).", userId, cuando, propios.size());
        return estado(user);
    }

    /**
     * El arrepentimiento. Devuelve todo a como estaba.
     *
     * <p>Lo único que NO vuelve sola es la suscripción: se canceló en Mercado Pago y ahí no hay
     * "descancelar". El cliente tiene que volver a cargar la tarjeta. Se le avisa en la pantalla
     * — descubrirlo por un corte de servicio quince días después sería inaceptable.</p>
     */
    @Transactional
    public EstadoBorrado cancelar(UUID userId) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Usuario inexistente"));

        user.setDeletionRequestedAt(null);
        user.setDeletionScheduledAt(null);
        userRepository.save(user);

        List<Tenant> propios = gimnasiosPropios(userId);
        for (Tenant t : propios) {
            t.setDeletionScheduledAt(null);
        }
        tenantRepository.saveAll(propios);

        log.warn("Cuenta {} canceló su borrado: {} gimnasios restaurados.", userId, propios.size());
        return estado(user);
    }

    @Transactional(readOnly = true)
    public EstadoBorrado consultar(UUID userId) {
        return userRepository.findById(userId).map(this::estado)
                .orElse(new EstadoBorrado(false, null, null, 0, 0));
    }

    private EstadoBorrado estado(AppUser user) {
        if (user.getDeletionScheduledAt() == null) {
            return new EstadoBorrado(false, null, null, 0, 0);
        }
        long dias = Math.max(0, java.time.Duration.between(
                LocalDateTime.now(BUSINESS_ZONE), user.getDeletionScheduledAt()).toDays());
        return new EstadoBorrado(true, user.getDeletionRequestedAt(), user.getDeletionScheduledAt(),
                dias, gimnasiosPropios(user.getId()).size());
    }

    /** Los gimnasios donde esta persona es DUEÑA. Son los que se van con ella. */
    private List<Tenant> gimnasiosPropios(UUID userId) {
        return membershipRepository.findByUserId(userId).stream()
                .filter(m -> m.getRole() == UserRole.OWNER)
                .map(m -> tenantRepository.findById(m.getTenant().getId()).orElse(null))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Borrar UNA sucursal
    // ─────────────────────────────────────────────────────────────────────────
    //
    // Vive acá y no en su propio servicio porque comparte toda la maquinaria con el borrado
    // de cuenta: la misma columna, el mismo archivo de ingresos y el mismo trabajo nocturno.
    // Separarlo sería duplicar tres cosas delicadas para que hagan lo mismo.

    /**
     * Programa el borrado de una sucursal para dentro de {@code graciaDias}.
     *
     * <p><b>Antes esto era instantáneo y definitivo.</b> Un clic borraba el gimnasio con sus
     * socios, sus pagos y todo su historial, sin un minuto de arrepentimiento — mientras que
     * borrar la cuenta ENTERA sí tenía 30 días. La acción más chica estaba menos protegida que
     * la grande, que es exactamente al revés de como debería ser.</p>
     *
     * <p>Como la maquinaria de los 30 días ya existía, darle lo mismo a la sucursal salió
     * casi gratis.</p>
     */
    @Transactional
    public LocalDateTime programarBorradoSucursal(UUID tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException("Gimnasio inexistente"));

        if (tenant.getDeletionScheduledAt() != null) {
            return tenant.getDeletionScheduledAt(); // ya estaba pedido: no se reinicia el reloj
        }

        // Cortar el cobro de ESTA sucursal. Cada una tiene su propia suscripción, así que
        // borrar una no puede tocar lo que se le cobra a las otras.
        if (subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId).isPresent()) {
            try {
                billingService.cancelSubscription(tenant);
            } catch (Exception e) {
                log.error("No se pudo cancelar la suscripción del gimnasio {} al programar su borrado. "
                        + "El borrado NO se registra.", tenantId, e);
                throw new IllegalStateException(
                        "No pudimos dar de baja el cobro automático de esta sucursal. No la marcamos "
                        + "para borrar hasta resolverlo, para que no te sigan cobrando.");
            }
        }

        LocalDateTime cuando = LocalDateTime.now(BUSINESS_ZONE).plusDays(graciaDias);
        tenant.setDeletionScheduledAt(cuando);
        tenantRepository.save(tenant);

        log.warn("Gimnasio {} ({}) marcado para borrado el {}.", tenant.getName(), tenantId, cuando);
        return cuando;
    }

    /** El arrepentimiento, para una sucursal. */
    @Transactional
    public void cancelarBorradoSucursal(UUID tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException("Gimnasio inexistente"));
        tenant.setDeletionScheduledAt(null);
        tenantRepository.save(tenant);
        log.warn("Gimnasio {} ({}) canceló su borrado.", tenant.getName(), tenantId);
    }

    /**
     * Borra las sucursales sueltas cuya gracia venció.
     *
     * <p>Separado de {@link #purgarVencidas()} porque son dos cosas distintas: allá se va una
     * PERSONA con todo lo suyo, acá se va un local y su dueño se queda. Una sucursal marcada
     * por el borrado de su cuenta la levanta el otro camino; si por alguna razón la levantan
     * los dos, el segundo la encuentra borrada y sigue de largo.</p>
     */
    public int purgarSucursalesVencidas() {
        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        List<Tenant> vencidas = tenantRepository.findByDeletionScheduledAtBefore(ahora);

        int hechas = 0;
        for (Tenant t : vencidas) {
            try {
                purgarSucursal(t.getId());
                hechas++;
            } catch (Exception e) {
                log.error("Falló la purga del gimnasio {}. Se reintenta mañana.", t.getId(), e);
            }
        }
        if (hechas > 0) log.warn("Purga de sucursales: {} borradas definitivamente.", hechas);
        return hechas;
    }

    @Transactional
    public void purgarSucursal(UUID tenantId) {
        if (tenantRepository.findById(tenantId).isEmpty()) return; // ya la borró el otro camino
        archivarIngresos(tenantId);
        tenantService.delete(tenantId);
        log.warn("Gimnasio {} borrado definitivamente.", tenantId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // La purga
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Borra de verdad las cuentas cuya gracia ya venció.
     *
     * <p>Corre de noche y una cuenta por transacción: si una falla —un dato raro, una clave
     * foránea inesperada— las demás igual se procesan, y la que falló se reintenta mañana. Un
     * error en una cuenta no puede dejar a otras diez esperando para siempre.</p>
     *
     * @return cuántas cuentas se purgaron
     */
    public int purgarVencidas() {
        LocalDateTime ahora = LocalDateTime.now(BUSINESS_ZONE);
        List<AppUser> vencidas = userRepository.findByDeletionScheduledAtBefore(ahora);

        int hechas = 0;
        for (AppUser u : vencidas) {
            try {
                purgarCuenta(u.getId());
                hechas++;
            } catch (Exception e) {
                log.error("Falló la purga de la cuenta {}. Se reintenta mañana.", u.getId(), e);
            }
        }
        if (hechas > 0) log.warn("Purga de cuentas: {} borradas definitivamente.", hechas);
        return hechas;
    }

    /**
     * El borrado real de UNA cuenta.
     *
     * <p><b>El orden importa y no es arbitrario:</b></p>
     * <ol>
     *   <li>Primero se ARCHIVA lo que es de Veltronik (los ingresos), porque después de borrar
     *       el gimnasio esa información ya no existe.</li>
     *   <li>Después se borran los gimnasios, que arrastran en cascada socios, cobros, accesos
     *       y todo lo del cliente.</li>
     *   <li>Último el login en Supabase. Va al final porque es lo único que NO está en esta
     *       base: si fallara algo antes, la transacción vuelve atrás sola. Si borráramos el
     *       login primero y después fallara la base, quedaría una cuenta sin dueño y sin forma
     *       de entrar a arreglarla.</li>
     * </ol>
     */
    @Transactional
    public void purgarCuenta(UUID userId) {
        AppUser user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Usuario inexistente"));

        List<Tenant> propios = gimnasiosPropios(userId);

        for (Tenant t : propios) {
            archivarIngresos(t.getId());
        }

        for (Tenant t : propios) {
            // Se reusa el purgador que ya existe para borrar una sucursal, en vez de escribir
            // otro: resuelve el orden de las claves foráneas recorriendo TODAS las tablas con
            // tenant_id en varias pasadas, y además libera los equipos —que no tienen tenant_id
            // y si no quedarían atados a una sucursal muerta, sin poder entrar a ninguna otra.
            // Ese detalle ya costó un bug una vez; no hay razón para volver a aprenderlo.
            tenantService.delete(t.getId());
        }
        tenantRepository.flush();

        // El login. Con el trigger de la V48, borrarlo en Supabase se lleva también app_user y
        // sus membresías. Si Supabase no está configurado, se borra igual lo de esta base y
        // queda el login huérfano — mejor eso que dejar los datos del cliente sin borrar.
        if (supabaseAdmin.isAvailable()) {
            try {
                supabaseAdmin.deleteUser(userId);
            } catch (Exception e) {
                log.error("Se borraron los datos de la cuenta {} pero NO su login en Supabase. "
                        + "Borrarlo a mano desde el panel.", userId, e);
            }
        } else {
            log.error("Cuenta {} purgada SIN borrar su login: falta SUPABASE_SERVICE_ROLE_KEY. "
                    + "Borrarlo a mano desde el panel de Supabase.", userId);
        }

        log.warn("Cuenta {} borrada definitivamente ({} gimnasios).", userId, propios.size());
    }

    /**
     * Copia los ingresos de este gimnasio al libro de Veltronik, sin nada que lo identifique.
     *
     * <p>{@code tenant_payment} mezcla dos cosas: el dato del cliente y el registro de que
     * Veltronik cobró. Lo primero es suyo y se borra; lo segundo es de Veltronik y no puede
     * desaparecer — sin eso no hay forma de cuadrar con Mercado Pago ni de justificar los
     * ingresos declarados.</p>
     *
     * <p>{@code cliente_ref} es un hash del id: permite ver que ocho cobros fueron del mismo
     * cliente, sin poder saber cuál era. Nativo porque escribe en una tabla que a propósito
     * no tiene entidad — no es dominio de la app, es el libro contable.</p>
     */
    private void archivarIngresos(UUID tenantId) {
        // Referencia derivada SOLO del gimnasio: sirve igual para agrupar ("estos ocho cobros
        // fueron del mismo cliente") y no cambia según se borre la cuenta entera o una sola
        // sucursal, que si no dejaría dos referencias distintas para el mismo local.
        String clienteRef = Integer.toHexString(tenantId.hashCode())
                + "-" + tenantId.toString().substring(0, 8);

        em.createNativeQuery("""
                INSERT INTO saas_revenue (id, created_at, cliente_ref, amount, paid_at,
                                          mp_payment_id, mp_preapproval_id, archived_at)
                SELECT gen_random_uuid(), now(), :ref, p.amount, p.payment_date,
                       p.mp_payment_id, p.mp_preapproval_id, now()
                  FROM tenant_payment p
                 WHERE p.tenant_id = :tenantId
                   AND UPPER(p.status) = 'APPROVED'
                ON CONFLICT DO NOTHING
                """)
                .setParameter("ref", clienteRef)
                .setParameter("tenantId", tenantId)
                .executeUpdate();
    }
}
