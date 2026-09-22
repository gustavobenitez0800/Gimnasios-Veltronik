package com.veltronik.v2.gym.services;

import java.text.Normalizer;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Qué período cubrió cada cobro del historial importado, reconstruido (V87).
 *
 * <p><b>El problema.</b> El sistema anterior exporta la caja (fecha, persona, concepto, monto)
 * y el padrón (con el vencimiento de cada socio), pero no el período de cada pago. En Pagos la
 * columna quedaba vacía para todo lo importado.</p>
 *
 * <p><b>Cómo se reconstruye.</b> ControlFit corre el vencimiento de a un mes <i>desde el
 * vencimiento de antes</i>, aunque el socio pague unos días tarde: el que vencía el 15 y pagó
 * el 16 pasa a vencer el 15 del mes siguiente. Entonces, con el vencimiento que trajo el padrón
 * como ancla, el último pago cubre el mes que termina ahí; el anterior, el mes previo; y así
 * para atrás. Medido con el historial real de Santo Sport (383 socios, 1.362 cuotas): el último
 * pago cae dentro de esa ventana en el 96% de los socios.</p>
 *
 * <p><b>Cuándo la cadena se corta.</b> Un pago encaja en un período si llegó hasta
 * {@value #ADELANTO_MAXIMO_DIAS} días antes de que empiece o hasta {@value #ATRASO_MAXIMO_DIAS}
 * después (medido: casi nadie paga con más de 9 días de adelanto). Se admite un mes salteado
 * —el socio que no vino en vacaciones y volvió—, porque ControlFit conserva el día. Si no
 * encaja ni así, el socio volvió después de un corte largo y el período arranca el día que
 * pagó, que es lo que hace el propio Veltronik pasada la gracia.</p>
 *
 * <p>⚠️ Es una <b>estimación</b> y se muestra aparte de la cobertura: nada de esto corre un
 * vencimiento (ver V87 y ADR-014).</p>
 */
final class PeriodosDelHistorial {

    /** Cuánto antes de que empiece su período puede llegar un pago y seguir siendo de ese período. */
    static final int ADELANTO_MAXIMO_DIAS = 10;
    /** Cuánto después: la gracia del mostrador y un poco más. */
    static final int ATRASO_MAXIMO_DIAS = 20;
    /** Meses que el socio puede saltear sin que se pierda el día en que le vence. */
    static final int MESES_SALTEADOS_MAXIMO = 1;
    /** Un período recortado para no pisar al siguiente tiene que durar al menos esto. */
    static final int RECORTE_MINIMO_DIAS = 15;

    private PeriodosDelHistorial() { }

    /** Qué cubre un concepto: un mes, o unos días (el pase). */
    record Cobertura(boolean meses, int cantidad) {
        static final Cobertura MES = new Cobertura(true, 1);

        LocalDate sumar(LocalDate desde, int veces) {
            return meses ? desde.plusMonths((long) cantidad * veces) : desde.plusDays((long) cantidad * veces);
        }
    }

    /** Un cobro de una persona. {@code cobertura} null = no cubre nada (un gasto, un recargo). */
    record Cobro(UUID id, LocalDate fecha, Cobertura cobertura) { }

    /** El período reconstruido: {@code hasta} es el día en que vence, como en los cobros de Veltronik. */
    record Periodo(LocalDate desde, LocalDate hasta) { }

    /**
     * Qué cubre un cobro importado, según su nota.
     *
     * <p>La nota del importado es el concepto del archivo, a veces con el nombre adelante
     * ("PÉREZ JUAN (DNI 123) · Cuota"). En ControlFit la inscripción ("Pago registro de socio")
     * cuesta lo mismo que la cuota porque ES la primera cuota: cubre el mes.</p>
     */
    static Cobertura coberturaDe(String nota) {
        if (nota == null) return null;
        for (String parte : nota.split("·")) {
            String t = normalizar(parte);
            if (t.contains("pase")) {
                if (t.contains("15") || t.contains("quincen")) return new Cobertura(false, 15);
                if (t.contains("semana")) return new Cobertura(false, 7);
                if (t.contains("dia") || t.contains("diario")) return new Cobertura(false, 1);
            }
            if (t.contains("cuota") || t.startsWith("inscrip") || t.contains("registro de socio")
                    || t.equals("mensual") || t.equals("abono")) {
                return Cobertura.MES;
            }
        }
        return null;
    }

    /**
     * Los períodos de los cobros de UNA persona.
     *
     * @param cobros los cobros importados de esa persona, en cualquier orden
     * @param ancla  hasta cuándo tenía pago al terminar el historial (el vencimiento que trajo el
     *               padrón, o donde arrancó su primer cobro en Veltronik). Null si no se sabe: un
     *               ex-socio. Entonces el último período arranca el día que pagó.
     * @return un período por cada cobro que cubre algo; los que no cubren nada no aparecen
     */
    static Map<UUID, Periodo> calcular(List<Cobro> cobros, LocalDate ancla) {
        Map<UUID, Periodo> salida = new HashMap<>();
        List<Cobro> delMasNuevo = new ArrayList<>(cobros);
        delMasNuevo.sort(Comparator.comparing(Cobro::fecha).reversed());

        // La cadena va para atrás desde un ORIGEN (el vencimiento, o el día en que volvió a pagar
        // después de un corte), contando meses. Cada mes se calcula desde el origen y no desde el
        // mes anterior: restando de a uno, un vencimiento del 31 pasaba por el 28 de febrero y
        // quedaba en 28 para siempre.
        LocalDate origen = ancla;
        int meses = 0;
        for (Cobro c : delMasNuevo) {
            Cobertura cubre = c.cobertura();
            if (cubre == null || c.fecha() == null) continue;

            // Un pase de un día no mueve la cadena de la cuota: es un día suelto.
            if (!cubre.meses()) {
                salida.put(c.id(), new Periodo(c.fecha(), cubre.sumar(c.fecha(), 1)));
                continue;
            }

            // Dónde arranca el período que sigue al que se está buscando.
            LocalDate siguiente = origen == null ? null : origen.minusMonths(meses);
            if (origen != null) {
                Integer salteados = encajar(c.fecha(), origen, meses);
                if (salteados != null) {
                    meses += salteados + 1;
                    salida.put(c.id(), new Periodo(origen.minusMonths(meses), origen.minusMonths(meses - 1L)));
                    continue;
                }
            }

            // Sin ancla, o después de un corte: arranca el día que pagó. Sin pisarse con el
            // período que sigue, que ya quedó asignado a un pago más nuevo... salvo que recortarlo
            // lo deje en unos días: dos pagos casi juntos (la cuota y otra actividad) no se leen
            // como "pagó por tres días".
            LocalDate hasta = cubre.sumar(c.fecha(), 1);
            if (siguiente != null && hasta.isAfter(siguiente)
                    && !siguiente.isBefore(c.fecha().plusDays(RECORTE_MINIMO_DIAS))) {
                hasta = siguiente;
            }
            salida.put(c.id(), new Periodo(c.fecha(), hasta));
            origen = c.fecha();
            meses = 0;
        }
        return salida;
    }

    /**
     * Si el pago encaja en el mes que termina donde arranca el siguiente (o uno antes, si salteó
     * un mes): cuántos meses salteó. Null si no encaja.
     */
    private static Integer encajar(LocalDate pago, LocalDate origen, int meses) {
        for (int salteados = 0; salteados <= MESES_SALTEADOS_MAXIMO; salteados++) {
            LocalDate desde = origen.minusMonths(meses + salteados + 1L);
            if (!pago.isBefore(desde.minusDays(ADELANTO_MAXIMO_DIAS))
                    && !pago.isAfter(desde.plusDays(ATRASO_MAXIMO_DIAS))) {
                return salteados;
            }
        }
        return null;
    }

    private static String normalizar(String s) {
        String sinTildes = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return sinTildes.toLowerCase(Locale.ROOT).trim();
    }
}
