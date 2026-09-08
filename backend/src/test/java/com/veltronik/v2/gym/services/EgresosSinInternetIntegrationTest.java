package com.veltronik.v2.gym.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.gym.repositories.CajaMovimientoRepository;
import com.veltronik.v2.support.EmbeddedPostgresTest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ⭐ LOS EGRESOS ANOTADOS SIN INTERNET (Fase 3, paso 5).
 *
 * <p>Del cajón sale plata durante el día, y hasta ahora eso solo se podía anotar con conexión.
 * Con el internet caído, quien atiende le paga a la chica de la limpieza y <b>no tiene dónde
 * escribirlo</b>: a la noche el sistema espera esa plata igual, el cierre dice FALTANTE y acusa
 * a alguien que no robó nada. Es el mismo bug que motivó el módulo entero, ahora disparado por
 * la falta de conexión en vez de por la falta de la función.</p>
 *
 * <p><b>Por qué estos casos y no otros.</b> Son las reglas de {@code docs/FASE3-CAMINOS.md}
 * traducidas a este camino, y se prueban <b>juntas y contra Postgres de verdad</b> — con un
 * mock, las dos garantías que importan (el índice único y el rango de fechas del arqueo) no
 * existen, y el test repetiría exactamente lo que uno ya creía.</p>
 *
 * <ol>
 *   <li><b>Un reintento no cuenta el gasto dos veces.</b></li>
 *   <li><b>El orden de llegada no cambia ningún total.</b></li>
 *   <li><b>Un egreso de ayer no cae en el arqueo de hoy</b>, llegue cuando llegue.</li>
 *   <li><b>El reloj del terminal se acota, no se cree</b> — y aun así el gasto se guarda.</li>
 * </ol>
 */
@Transactional
class EgresosSinInternetIntegrationTest extends EmbeddedPostgresTest {

    @Autowired
    private EntityManager em;

    @Autowired
    private CajaService cajaService;

    @Autowired
    private CajaMovimientoRepository movimientos;

    private UUID gym;

    @BeforeEach
    void sembrar() {
        gym = crearGimnasio("Gimnasio de los egresos");
        TenantContextHolder.setTenantId(gym);
    }

    @AfterEach
    void limpiar() {
        TenantContextHolder.clear();
    }

    private UUID crearGimnasio(String nombre) {
        UUID id = UUID.randomUUID();
        em.createNativeQuery("""
                INSERT INTO tenant (id, created_at, updated_at, name, is_active)
                VALUES (:id, now(), now(), :nombre, true)
                """).setParameter("id", id).setParameter("nombre", nombre).executeUpdate();
        return id;
    }

    /** Un egreso en efectivo, como lo manda la cola: con sello y con su momento. */
    private com.veltronik.v2.gym.entities.CajaMovimiento encolado(
            UUID sello, String monto, LocalDateTime cuando) {
        return cajaService.registrar("EGRESO", "Limpieza", "Sueldo de la semana",
                new BigDecimal(monto), "CASH", "Recepción", sello, cuando);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1 · Un reintento no cuenta el gasto dos veces
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("el mismo egreso mandado dos veces se guarda UNA sola vez")
    void reintentoNoDuplica() {
        UUID sello = UUID.randomUUID();
        LocalDateTime cuando = LocalDateTime.now().minusHours(2);

        var primero = encolado(sello, "15000", cuando);
        var segundo = encolado(sello, "15000", cuando);

        // Misma fila, no dos. Y esto es plata: dos filas serían un faltante de $15.000 que
        // nunca existió, con el dedo apuntando a quien atendió.
        assertEquals(primero.getId(), segundo.getId(), "el reintento tiene que devolver el que ya estaba");
        em.flush();
        assertEquals(1, cuantosEgresosHay(), "quedó anotado dos veces");
    }

    @Test
    @DisplayName("y ni siquiera vuelve a validar: devuelve el que hay antes de tocar nada")
    void reintentoNoRevalida() {
        UUID sello = UUID.randomUUID();
        var guardado = encolado(sello, "15000", LocalDateTime.now().minusHours(2));

        // El mismo sello con un cuerpo que NO pasaría las validaciones (monto cero, sin
        // detalle). Si la guarda estuviera después de validar, esto explotaría — y en
        // producción sería una fila que se queda trabada en la cola para siempre,
        // reintentándose contra un 400 que nunca va a dejar de dar 400.
        var reintento = cajaService.registrar("EGRESO", "", "", BigDecimal.ZERO, "CASH", null,
                sello, LocalDateTime.now());

        assertEquals(guardado.getId(), reintento.getId());
        assertEquals(0, new BigDecimal("15000").compareTo(reintento.getMonto()),
                "el reintento pisó el monto del que ya estaba");
    }

    @Test
    @DisplayName("dos gastos distintos del mismo día SÍ se anotan los dos")
    void selloDistintoNoSeConfunde() {
        // El contrapeso del test de arriba: si la guarda fuera demasiado ancha —por monto y
        // categoría, digamos— dos pagos iguales al mismo proveedor se contarían como uno.
        LocalDateTime cuando = LocalDateTime.now().minusHours(1);
        encolado(UUID.randomUUID(), "15000", cuando);
        encolado(UUID.randomUUID(), "15000", cuando);

        em.flush();
        assertEquals(2, cuantosEgresosHay());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2 · El orden de llegada no cambia ningún total
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("suban en el orden que suban, el arqueo del período da lo mismo")
    void elOrdenNoCambiaElTotal() {
        LocalDateTime hace3h = LocalDateTime.now().minusHours(3);
        LocalDateTime hace1h = LocalDateTime.now().minusHours(1);

        encolado(UUID.randomUUID(), "5000", hace1h);   // el más nuevo, primero
        encolado(UUID.randomUUID(), "7000", hace3h);   // el más viejo, después
        em.flush();

        BigDecimal total = cajaService.resumenAbierto().egresosEfectivo();
        assertEquals(0, new BigDecimal("12000").compareTo(total),
                "el orden de llegada movió el total");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3 · Un egreso de ayer no cae en el arqueo de hoy
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("⭐ el gasto de anoche que sube hoy queda en el día que fue")
    void elMomentoRealMandaSobreElDeLlegada() {
        // El caso entero de este paso: se pagó a las 22:00 con el internet caído, el terminal
        // se apagó, y a las 09:00 del día siguiente sube. Sin momento propio caería HOY: el
        // arqueo de anoche diría faltante —esa plata salió y no figura— y el de hoy, sobrante.
        LocalDateTime anoche = LocalDateTime.now().minusDays(1).withHour(22).withMinute(0);
        var m = encolado(UUID.randomUUID(), "15000", anoche);

        assertEquals(anoche.withSecond(0).withNano(0), m.getFecha().withSecond(0).withNano(0),
                "se guardó con la hora de llegada en vez de la del hecho");

        // Y el balance de HOY no lo cuenta: es de ayer.
        BigDecimal hoy = cajaService.balance(false).egresosEfectivo();
        assertEquals(0, BigDecimal.ZERO.compareTo(hoy),
                "un gasto de ayer se metió en el balance de hoy");
    }

    @Test
    @DisplayName("sin momento declarado —el camino con internet— se usa ahora")
    void sinMomentoEsAhora() {
        var m = cajaService.registrar("EGRESO", "Proveedor", "Agua, f. 4412",
                new BigDecimal("3000"), "CASH", "Recepción");

        assertNull(m.getClientRef(), "lo anotado con conexión no lleva sello");
        assertEquals(LocalDateTime.now().toLocalDate(), m.getFecha().toLocalDate());
        // Y cuenta en el balance de hoy, que es lo que ya hacía antes de este cambio.
        assertEquals(0, new BigDecimal("3000").compareTo(cajaService.balance(false).egresosEfectivo()));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4 · El reloj del terminal se acota, no se cree
    // ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("un reloj adelantado no escribe un gasto en el futuro")
    void relojEnElFuturoSeAcota() {
        LocalDateTime dentroDeUnMes = LocalDateTime.now().plusDays(30);
        var m = encolado(UUID.randomUUID(), "1000", dentroDeUnMes);

        assertTrue(m.getFecha().isBefore(LocalDateTime.now().plusMinutes(1)),
                "se guardó un gasto que todavía no pasó");
        // Y no se pierde: cuenta hoy. Perder el renglón sería peor que la hora corrida —
        // la plata salió del cajón igual.
        assertEquals(0, new BigDecimal("1000").compareTo(cajaService.balance(false).egresosEfectivo()));
    }

    @Test
    @DisplayName("un reloj atrasado tres meses no ensucia un período ya cerrado")
    void relojMuyViejoSeAcota() {
        LocalDateTime haceTresMeses = LocalDateTime.now().minusMonths(3);
        var m = encolado(UUID.randomUUID(), "1000", haceTresMeses);

        assertTrue(m.getFecha().isAfter(LocalDateTime.now().minusHours(37)),
                "un reloj roto escribió en un mes que ya se cerró");
        // Un corte de internet de día y medio es creíble; uno de tres meses es un reloj roto.
        assertNotEquals(haceTresMeses.toLocalDate(), m.getFecha().toLocalDate());
    }

    private int cuantosEgresosHay() {
        return movimientos.findByTenantIdAndFechaBetweenOrderByFechaDesc(
                gym, LocalDateTime.now().minusDays(90), LocalDateTime.now().plusDays(90)).size();
    }
}
