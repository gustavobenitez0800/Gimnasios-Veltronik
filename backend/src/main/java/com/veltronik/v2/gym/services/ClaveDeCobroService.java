package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.exceptions.BusinessException;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.entities.ClaveDeCobro;
import com.veltronik.v2.gym.repositories.ClaveDeCobroRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * ⭐ LA CLAVE PARA COBRAR (08/11/2026).
 *
 * <p>Lo pidió un gimnasio: «a veces los socios se renuevan solos la cuota». La PC del mostrador
 * queda con la sesión abierta y cualquiera que se acerque puede registrarse un cobro. El dueño
 * prende, si quiere, una clave en Ajustes; con ella puesta, el mostrador la pide para cobrar,
 * para editar o anular un cobro y para cambiar a mano el vencimiento de un socio.</p>
 *
 * <p><b>Es la cerradura del mostrador, no una bóveda</b> (lo mismo que el PIN del turno, V45): la
 * pide la pantalla antes de cada uno de esos pasos. El cobro en sí no la exige, a propósito: lo
 * que se cobra sin internet sube después por la cola, y una cola que rebota por una clave se
 * queda trabada para siempre. Lo que cuida la plata es el libro de ingresos, la firma de quien
 * atiende y la hora de cada cobro.</p>
 *
 * <p>Las reglas, las del PIN: solo números (de 4 a 8), nada obvio (0000, 1234…), y un freno de 5
 * intentos con un minuto de espera — sin freno, 10.000 combinaciones se prueban en minutos.</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClaveDeCobroService {

    private static final Pattern CLAVE_VALIDA = Pattern.compile("\\d{4,8}");
    private static final Set<String> CLAVES_OBVIAS = Set.of(
            "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
            "1234", "4321", "1212", "2121", "123456", "654321", "000000", "111111", "12345678", "87654321");
    private static final int MAX_INTENTOS = 5;
    private static final Duration BLOQUEO = Duration.ofMinutes(1);

    private final ClaveDeCobroRepository repository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** Los intentos fallidos, por sucursal. En memoria, como los del PIN (ver CashierService). */
    private final Map<UUID, Intentos> intentos = new ConcurrentHashMap<>();

    private record Intentos(int fallidos, Instant bloqueadoHasta) {}

    /** ¿Esta sucursal pide clave para cobrar? */
    @Transactional(readOnly = true)
    public boolean activa() {
        return repository.existsByTenantId(TenantContextHolder.getTenantId());
    }

    /**
     * Pone o cambia la clave. Si ya había una, hay que saberla: si no, el que se renueva solo la
     * cuota iría a Ajustes y la cambiaría (la sesión del mostrador suele ser la del dueño).
     */
    @Transactional
    public void fijar(String nueva, String actual) {
        validar(nueva);
        UUID tenantId = TenantContextHolder.getTenantId();

        Optional<ClaveDeCobro> existente = repository.findByTenantId(tenantId);
        existente.ifPresent(c -> comprobar(tenantId, c, actual));

        ClaveDeCobro clave = existente.orElseGet(() -> {
            Tenant tenant = new Tenant();
            tenant.setId(tenantId);
            ClaveDeCobro nuevaFila = new ClaveDeCobro();
            nuevaFila.setTenant(tenant);
            return nuevaFila;
        });
        clave.setClaveHash(encoder.encode(nueva));
        repository.save(clave);
    }

    /** La saca (deja de pedirse). También hay que saberla. */
    @Transactional
    public void sacar(String actual) {
        UUID tenantId = TenantContextHolder.getTenantId();
        repository.findByTenantId(tenantId).ifPresent(c -> {
            comprobar(tenantId, c, actual);
            repository.delete(c);
        });
    }

    /**
     * Comprueba la clave antes de cobrar. Sin clave puesta no hay nada que comprobar.
     *
     * @throws BusinessException si no coincide, o si hubo demasiados intentos
     */
    @Transactional(readOnly = true)
    public void verificar(String clave) {
        UUID tenantId = TenantContextHolder.getTenantId();
        repository.findByTenantId(tenantId).ifPresent(c -> comprobar(tenantId, c, clave));
    }

    private void comprobar(UUID tenantId, ClaveDeCobro guardada, String clave) {
        Intentos estado = intentos.get(tenantId);
        if (estado != null && estado.bloqueadoHasta() != null && Instant.now().isBefore(estado.bloqueadoHasta())) {
            long segundos = Duration.between(Instant.now(), estado.bloqueadoHasta()).toSeconds() + 1;
            throw new BusinessException("Demasiados intentos. Esperá " + segundos + " segundos.");
        }
        if (clave == null || !encoder.matches(clave, guardada.getClaveHash())) {
            registrarFallo(tenantId);
            throw new BusinessException("Clave incorrecta.");
        }
        intentos.remove(tenantId);
    }

    private void registrarFallo(UUID tenantId) {
        intentos.compute(tenantId, (id, previo) -> {
            int fallidos = (previo == null ? 0 : previo.fallidos()) + 1;
            if (fallidos >= MAX_INTENTOS) {
                log.info("Clave para cobrar de {} bloqueada por {} intentos fallidos", tenantId, fallidos);
                return new Intentos(0, Instant.now().plus(BLOQUEO));
            }
            return new Intentos(fallidos, null);
        });
    }

    private static void validar(String clave) {
        if (clave == null || !CLAVE_VALIDA.matcher(clave).matches()) {
            throw new BusinessException("La clave tiene que ser de 4 a 8 números.");
        }
        if (CLAVES_OBVIAS.contains(clave)) {
            throw new BusinessException("Esa clave es muy fácil de adivinar. Elegí otra.");
        }
    }
}
