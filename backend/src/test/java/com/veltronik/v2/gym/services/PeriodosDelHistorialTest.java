package com.veltronik.v2.gym.services;

import com.veltronik.v2.gym.services.PeriodosDelHistorial.Cobertura;
import com.veltronik.v2.gym.services.PeriodosDelHistorial.Cobro;
import com.veltronik.v2.gym.services.PeriodosDelHistorial.Periodo;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * La reconstrucción del período de cada cobro importado. Datos inventados: el repositorio es
 * público y los casos salen de patrones del historial real, no de sus personas.
 */
@DisplayName("El período del historial importado")
class PeriodosDelHistorialTest {

    private static LocalDate d(String iso) {
        return LocalDate.parse(iso);
    }

    /** Una cuota por cada fecha, en el orden en que se escriben. */
    private static List<Cobro> cuotas(String... fechas) {
        List<Cobro> l = new ArrayList<>();
        for (String f : fechas) l.add(new Cobro(UUID.randomUUID(), d(f), Cobertura.MES));
        return l;
    }

    private static Periodo de(Map<UUID, Periodo> r, Cobro c) {
        return r.get(c.id());
    }

    @Nested
    @DisplayName("con el vencimiento que trajo el padrón")
    class ConAncla {

        @Test
        @DisplayName("⭐ el último pago termina en el vencimiento, aunque haya pagado unos días tarde")
        void elUltimoTerminaEnElVencimiento() {
            // Vencía el 15 de agosto, pagó el 16 y el sistema anterior le corrió al 15 de
            // septiembre: el período es 15/08 al 15/09, no 16/08 al 16/09.
            var c = cuotas("2026-08-16");
            var r = PeriodosDelHistorial.calcular(c, d("2026-09-15"));

            assertEquals(new Periodo(d("2026-08-15"), d("2026-09-15")), de(r, c.get(0)));
        }

        @Test
        @DisplayName("los anteriores se encadenan hacia atrás, un mes cada uno")
        void seEncadenan() {
            var c = cuotas("2026-06-03", "2026-07-01", "2026-07-30");
            var r = PeriodosDelHistorial.calcular(c, d("2026-09-01"));

            assertEquals(new Periodo(d("2026-08-01"), d("2026-09-01")), de(r, c.get(2)), "pagó un par de días antes");
            assertEquals(new Periodo(d("2026-07-01"), d("2026-08-01")), de(r, c.get(1)));
            assertEquals(new Periodo(d("2026-06-01"), d("2026-07-01")), de(r, c.get(0)));
        }

        @Test
        @DisplayName("⭐ si salteó un mes, no corre todos los anteriores un mes para atrás")
        void unMesSalteado() {
            // Pagó en junio y julio, no vino en agosto y volvió en septiembre. Sin aceptar el mes
            // salteado, el pago de julio se leía como adelanto de agosto y arrastraba a todos.
            var c = cuotas("2026-06-02", "2026-07-08", "2026-09-02");
            var r = PeriodosDelHistorial.calcular(c, d("2026-10-02"));

            assertEquals(new Periodo(d("2026-09-02"), d("2026-10-02")), de(r, c.get(2)));
            assertEquals(new Periodo(d("2026-07-02"), d("2026-08-02")), de(r, c.get(1)), "agosto quedó sin pagar");
            assertEquals(new Periodo(d("2026-06-02"), d("2026-07-02")), de(r, c.get(0)));
        }

        @Test
        @DisplayName("después de un corte largo, el período arranca el día que volvió a pagar")
        void despuesDeUnCorte() {
            // Pagaba el 4 de cada mes, dejó dos meses y volvió el 27: desde ahí vence el 27.
            var c = cuotas("2026-04-06", "2026-05-04", "2026-07-27");
            var r = PeriodosDelHistorial.calcular(c, d("2026-08-27"));

            assertEquals(new Periodo(d("2026-07-27"), d("2026-08-27")), de(r, c.get(2)));
            assertEquals(new Periodo(d("2026-05-04"), d("2026-06-04")), de(r, c.get(1)), "el corte no la arrastra al 27");
            assertEquals(new Periodo(d("2026-04-04"), d("2026-05-04")), de(r, c.get(0)), "y la cadena sigue desde ahí");
        }

        @Test
        @DisplayName("un vencimiento del 31 no queda en 28 después de pasar por febrero")
        void finDeMes() {
            var c = cuotas("2025-12-31", "2026-01-31", "2026-02-28");
            var r = PeriodosDelHistorial.calcular(c, d("2026-03-31"));

            assertEquals(new Periodo(d("2026-02-28"), d("2026-03-31")), de(r, c.get(2)), "febrero no tiene 31");
            assertEquals(new Periodo(d("2026-01-31"), d("2026-02-28")), de(r, c.get(1)), "enero vuelve a ser 31");
            assertEquals(new Periodo(d("2025-12-31"), d("2026-01-31")), de(r, c.get(0)));
        }
    }

    @Nested
    @DisplayName("sin vencimiento conocido (un ex-socio)")
    class SinAncla {

        @Test
        @DisplayName("el último arranca el día que pagó y los anteriores se encadenan")
        void arrancaElDiaQuePago() {
            var c = cuotas("2026-03-10", "2026-04-12");
            var r = PeriodosDelHistorial.calcular(c, null);

            assertEquals(new Periodo(d("2026-04-12"), d("2026-05-12")), de(r, c.get(1)));
            assertEquals(new Periodo(d("2026-03-12"), d("2026-04-12")), de(r, c.get(0)));
        }
    }

    @Nested
    @DisplayName("lo que no es una cuota")
    class OtrosConceptos {

        @Test
        @DisplayName("un pase de un día cubre ese día y no mueve la cadena de la cuota")
        void paseDelDia() {
            var cuota = new Cobro(UUID.randomUUID(), d("2026-08-01"), Cobertura.MES);
            var pase = new Cobro(UUID.randomUUID(), d("2026-08-20"), new Cobertura(false, 1));
            var r = PeriodosDelHistorial.calcular(List.of(cuota, pase), d("2026-09-01"));

            assertEquals(new Periodo(d("2026-08-20"), d("2026-08-21")), r.get(pase.id()));
            assertEquals(new Periodo(d("2026-08-01"), d("2026-09-01")), r.get(cuota.id()), "la cuota sigue siendo la del vencimiento");
        }

        @Test
        @DisplayName("lo que no cubre nada no lleva período")
        void sinCobertura() {
            var recargo = new Cobro(UUID.randomUUID(), d("2026-08-01"), null);
            assertFalse(PeriodosDelHistorial.calcular(List.of(recargo), d("2026-09-01")).containsKey(recargo.id()));
        }

        @Test
        @DisplayName("el concepto se lee de la nota, con o sin el nombre adelante")
        void conceptos() {
            assertEquals(Cobertura.MES, PeriodosDelHistorial.coberturaDe("Cuota"));
            assertEquals(Cobertura.MES, PeriodosDelHistorial.coberturaDe("PÉREZ JUAN (DNI 30111222) · Cuota"));
            assertEquals(Cobertura.MES, PeriodosDelHistorial.coberturaDe("Inscripción"), "en ControlFit la inscripción es la primera cuota");
            assertEquals(new Cobertura(false, 1), PeriodosDelHistorial.coberturaDe("Pase por día"));
            assertEquals(new Cobertura(false, 7), PeriodosDelHistorial.coberturaDe("Pase por semana"));
            assertEquals(new Cobertura(false, 15), PeriodosDelHistorial.coberturaDe("Pase por 15 días"));
            assertNull(PeriodosDelHistorial.coberturaDe("Nueva actividad"));
            assertNull(PeriodosDelHistorial.coberturaDe("Movimiento de cuenta"));
            assertNull(PeriodosDelHistorial.coberturaDe(null));
        }

        @Test
        @DisplayName("dos pagos casi juntos no dejan un período de tres días")
        void pagosCasiJuntos() {
            // La cuota y, cuatro días después, otra cuota (otra actividad): el recorte para no
            // pisarse dejaría "del 28/08 al 01/09". Mejor un mes entero que un disparate.
            var c = cuotas("2026-08-28", "2026-09-01");
            var r = PeriodosDelHistorial.calcular(c, d("2026-10-01"));

            assertEquals(new Periodo(d("2026-09-01"), d("2026-10-01")), de(r, c.get(1)));
            assertEquals(new Periodo(d("2026-08-28"), d("2026-09-28")), de(r, c.get(0)),
                    "un mes entero desde que pagó, aunque se superponga");
        }
    }
}
