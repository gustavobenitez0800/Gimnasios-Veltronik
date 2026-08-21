package com.veltronik.v2.core.services;

import com.veltronik.v2.core.entities.Cashier;
import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.exceptions.EntityNotFoundException;
import com.veltronik.v2.core.repositories.CashierRepository;
import com.veltronik.v2.core.security.CashierContextCache;
import com.veltronik.v2.core.security.TenantContextHolder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Las personas del mostrador y su PIN.
 *
 * <p>Ver {@link Cashier} para el porqué de la figura. Acá está la parte delicada: validar
 * cuatro dígitos sin que sean adivinables.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CashierService {

    /** Exactamente 4 dígitos. Ni letras, ni 3, ni 6: la pantalla del mostrador es un teclado numérico. */
    private static final Pattern PIN_VALIDO = Pattern.compile("^\\d{4}$");

    /** PINs que no protegen nada y que la gente elige por defecto. */
    private static final java.util.Set<String> PIN_OBVIOS =
            java.util.Set.of("0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
                    "1234", "4321", "1212", "2121");

    /** Intentos fallidos seguidos antes de bloquear. */
    private static final int MAX_INTENTOS = 5;

    /** Cuánto dura el bloqueo. Corto a propósito: es un mostrador, no un banco. */
    private static final Duration BLOQUEO = Duration.ofMinutes(1);

    private final CashierRepository repository;
    private final CashierContextCache contextCache;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /**
     * Intentos fallidos por cajero, en memoria.
     *
     * <p>Cuatro dígitos son 10.000 combinaciones: sin freno, un script las prueba todas en
     * minutos y el PIN no protege nada. Con cinco intentos y un minuto de espera, probarlas
     * todas lleva más de un día — suficiente para un mostrador donde además hay gente
     * mirando.</p>
     *
     * <p>En memoria y no en la base a propósito: escribir un contador en cada tecleo mal
     * puesto es tráfico contra Supabase por algo que se puede perder sin consecuencias. Se
     * resetea al redeployar, y está bien: lo peor que pasa es que alguien recupere sus
     * cinco intentos.</p>
     */
    private final Map<UUID, Intentos> intentos = new ConcurrentHashMap<>();

    private record Intentos(int fallidos, Instant bloqueadoHasta) {}

    // ── Gestión (la hace el dueño) ─────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<Cashier> listAll() {
        return repository.findByTenantIdOrderByActiveDescNameAsc(TenantContextHolder.getTenantId());
    }

    /** Los que se ofrecen en la pantalla de cambio de turno. */
    @Transactional(readOnly = true)
    public List<Cashier> listActive() {
        return repository.findByTenantIdAndActiveTrueOrderByNameAsc(TenantContextHolder.getTenantId());
    }

    @Transactional
    public Cashier create(String name, String pin) {
        final UUID tenantId = TenantContextHolder.getTenantId();
        final String nombre = validarNombre(name);
        validarPin(pin);

        repository.findByTenantIdAndNameIgnoreCase(tenantId, nombre).ifPresent(c -> {
            throw new BusinessException("Ya hay alguien con ese nombre en el mostrador. Usá un nombre que los distinga.");
        });

        Cashier cashier = new Cashier();
        Tenant tenant = new Tenant();
        tenant.setId(tenantId);
        cashier.setTenant(tenant);
        cashier.setName(nombre);
        cashier.setPinHash(encoder.encode(pin));
        cashier.setActive(true);

        Cashier guardado = repository.save(cashier);
        contextCache.evict(guardado.getId(), tenantId);
        return guardado;
    }

    /** Cambia el PIN. El dueño no puede ver el anterior: no existe en ningún lado legible. */
    @Transactional
    public void changePin(UUID cashierId, String newPin) {
        validarPin(newPin);
        Cashier cashier = findOwned(cashierId);
        cashier.setPinHash(encoder.encode(newPin));
        repository.save(cashier);
        intentos.remove(cashierId); // un PIN nuevo destraba un bloqueo en curso
    }

    @Transactional
    public void rename(UUID cashierId, String name) {
        final UUID tenantId = TenantContextHolder.getTenantId();
        final String nombre = validarNombre(name);
        repository.findByTenantIdAndNameIgnoreCase(tenantId, nombre)
                .filter(otro -> !otro.getId().equals(cashierId))
                .ifPresent(otro -> {
                    throw new BusinessException("Ya hay alguien con ese nombre en el mostrador.");
                });
        Cashier cashier = findOwned(cashierId);
        cashier.setName(nombre);
        repository.save(cashier);
    }

    /**
     * Da de baja (o vuelve a dar de alta) a alguien del mostrador.
     *
     * <p>Nunca se borra: sus movimientos históricos apuntan a esta fila y tienen que seguir
     * diciendo quién fue. Una persona que se fue del gimnasio hace dos años sigue siendo
     * quien cobró aquella cuota.</p>
     */
    @Transactional
    public void setActive(UUID cashierId, boolean active) {
        Cashier cashier = findOwned(cashierId);
        cashier.setActive(active);
        repository.save(cashier);
        contextCache.evict(cashierId, cashier.getTenant().getId());
        if (!active) intentos.remove(cashierId);
    }

    // ── El turno ───────────────────────────────────────────────────────────────

    /**
     * Verifica el PIN y abre el turno.
     *
     * <p>El mensaje de error NO distingue "PIN incorrecto" de "esa persona no existe":
     * quien se equivoca de fila no debería enterarse de nada, y quien prueba PINs ajenos
     * tampoco.</p>
     *
     * @return el cajero, si el PIN es correcto
     * @throws BusinessException si el PIN no coincide o hay demasiados intentos fallidos
     */
    @Transactional(readOnly = true)
    public Cashier verifyPin(UUID cashierId, String pin) {
        final UUID tenantId = TenantContextHolder.getTenantId();

        Intentos estado = intentos.get(cashierId);
        if (estado != null && estado.bloqueadoHasta() != null && Instant.now().isBefore(estado.bloqueadoHasta())) {
            long segundos = Duration.between(Instant.now(), estado.bloqueadoHasta()).toSeconds() + 1;
            throw new BusinessException("Demasiados intentos. Esperá " + segundos + " segundos.");
        }

        Cashier cashier = repository.findById(cashierId)
                .filter(c -> c.getTenant() != null && tenantId.equals(c.getTenant().getId()))
                .filter(Cashier::isActive)
                .orElse(null);

        if (cashier == null || pin == null || !encoder.matches(pin, cashier.getPinHash())) {
            registrarFallo(cashierId);
            throw new BusinessException("PIN incorrecto.");
        }

        intentos.remove(cashierId);
        return cashier;
    }

    private void registrarFallo(UUID cashierId) {
        intentos.compute(cashierId, (id, previo) -> {
            int fallidos = (previo == null ? 0 : previo.fallidos()) + 1;
            Instant bloqueo = fallidos >= MAX_INTENTOS ? Instant.now().plus(BLOQUEO) : null;
            if (bloqueo != null) {
                log.info("Cajero {} bloqueado por {} intentos fallidos", cashierId, fallidos);
                return new Intentos(0, bloqueo); // se reinicia el contador junto con el bloqueo
            }
            return new Intentos(fallidos, null);
        });
    }

    // ── Validaciones ───────────────────────────────────────────────────────────

    private Cashier findOwned(UUID cashierId) {
        final UUID tenantId = TenantContextHolder.getTenantId();
        return repository.findById(cashierId)
                .filter(c -> c.getTenant() != null && tenantId.equals(c.getTenant().getId()))
                .orElseThrow(() -> new EntityNotFoundException("cajero de esta sucursal", cashierId));
    }

    private static String validarNombre(String name) {
        String limpio = name == null ? "" : name.trim();
        if (limpio.isEmpty()) throw new BusinessException("Poné el nombre de la persona.");
        if (limpio.length() > 120) limpio = limpio.substring(0, 120);
        return limpio;
    }

    private static void validarPin(String pin) {
        if (pin == null || !PIN_VALIDO.matcher(pin).matches()) {
            throw new BusinessException("El PIN tiene que ser de 4 números.");
        }
        if (PIN_OBVIOS.contains(pin)) {
            throw new BusinessException("Ese PIN es muy fácil de adivinar. Elegí otro.");
        }
    }
}
