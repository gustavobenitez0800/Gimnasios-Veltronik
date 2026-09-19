package com.veltronik.v2.gym.services;

import java.text.Normalizer;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cómo se lee una celda de un archivo de socios. Sin base de datos: reglas puras.
 *
 * <p><b>Por qué aparte.</b> Todo lo que salió mal en la migración del 31/08 salió mal
 * <i>acá</i>: una fecha que no existía, un período tipeado con fechas del pasado, un año 2027
 * pisado por 2026. Cada regla de esta clase tiene su caso en {@code ValorImportadoTest}, y el
 * mensaje de error de cada una está escrito para quien va a corregir el Excel, no para un
 * programador.</p>
 *
 * <p><b>Las fechas van día/mes/año.</b> Es Argentina. Un {@code 03/04/2026} es el 3 de abril,
 * siempre. Cuando el "mes" pasa de 12 y el "día" no, el error lo dice: es casi seguro un
 * archivo exportado en formato yanqui.</p>
 */
final class ValorImportado {

    private ValorImportado() {
    }

    /** Una fecha leída: el valor, o por qué no se pudo. Vacía no es error. */
    record Fecha(LocalDate valor, String error) {
        static final Fecha VACIA = new Fecha(null, null);

        boolean vacia() {
            return valor == null && error == null;
        }

        static Fecha ok(LocalDate d) {
            return new Fecha(d, null);
        }

        static Fecha mal(String error) {
            return new Fecha(null, error);
        }
    }

    // 2026-09-30, y también 2026-09-30 00:00:00 o 2026-09-30T00:00 (lo que deja Excel al exportar).
    private static final Pattern ISO = Pattern.compile("^(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[ T].*)?$");
    // 30/09/2026, 30-09-2026, 30.09.2026, 30/9/26 — con o sin hora atrás.
    private static final Pattern DMA = Pattern.compile("^(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{4}|\\d{2})(?:\\s.*)?$");
    // El número de serie de Excel: días desde el 30/12/1899. Aparece cuando la celda es fecha
    // pero el archivo se leyó sin formato. 20000 es 1954; 80000 es 2119.
    private static final Pattern SERIE_EXCEL = Pattern.compile("^(\\d{5})(?:[.,]\\d+)?$");
    private static final LocalDate ORIGEN_EXCEL = LocalDate.of(1899, 12, 30);

    static Fecha fecha(String crudo, LocalDate hoy) {
        String s = texto(crudo);
        if (s == null) return Fecha.VACIA;

        Matcher m = ISO.matcher(s);
        if (m.matches()) {
            return armar(s, entero(m.group(1)), entero(m.group(2)), entero(m.group(3)));
        }

        m = DMA.matcher(s);
        if (m.matches()) {
            int dia = entero(m.group(1));
            int mes = entero(m.group(2));
            int anio = entero(m.group(3));
            if (m.group(3).length() == 2) {
                // 26 → 2026, 85 → 1985. El corte está diez años adelante de hoy: alcanza para
                // cualquier vencimiento real y deja a los nacidos en el siglo pasado donde van.
                int corte = (hoy.getYear() % 100) + 10;
                anio += (anio <= corte) ? 2000 : 1900;
            }
            if (mes > 12) {
                String pista = dia <= 12
                        ? " ¿El archivo está en formato mes/día? En Argentina va día/mes/año."
                        : "";
                return Fecha.mal("«" + s + "»: el mes " + mes + " no existe." + pista);
            }
            return armar(s, anio, mes, dia);
        }

        m = SERIE_EXCEL.matcher(s);
        if (m.matches()) {
            int serie = entero(m.group(1));
            if (serie >= 20000 && serie <= 80000) {
                return Fecha.ok(ORIGEN_EXCEL.plusDays(serie));
            }
        }

        return Fecha.mal("«" + s + "» no es una fecha. Usá día/mes/año, por ejemplo 30/09/2026.");
    }

    private static Fecha armar(String original, int anio, int mes, int dia) {
        try {
            return Fecha.ok(LocalDate.of(anio, mes, dia));
        } catch (DateTimeException e) {
            return Fecha.mal("«" + original + "» no existe en el calendario.");
        }
    }

    // ── Estado ───────────────────────────────────────────────────────────────

    /**
     * "¿Sigue siendo socio o se dio de baja?". NO es "¿está al día?": eso lo decide el
     * vencimiento. Por eso "vencido" cuenta como socio activo — un vencido no se dio de baja,
     * debe una cuota.
     */
    record Estado(Boolean activo, boolean reconocido) {
        static final Estado VACIO = new Estado(null, true);
    }

    private static final Set<String> ACTIVO = Set.of(
            "activo", "activa", "si", "s", "1", "true", "verdadero", "vigente", "alta",
            "habilitado", "habilitada", "al dia", "vencido", "vencida", "moroso", "morosa");
    private static final Set<String> BAJA = Set.of(
            "baja", "de baja", "dado de baja", "dada de baja", "inactivo", "inactiva", "no", "n",
            "0", "false", "falso", "suspendido", "suspendida", "deshabilitado", "deshabilitada");

    static Estado estado(String crudo) {
        String s = texto(crudo);
        if (s == null) return Estado.VACIO;
        String clave = sinAcentos(s).toLowerCase(Locale.ROOT);
        if (ACTIVO.contains(clave)) return new Estado(true, true);
        if (BAJA.contains(clave)) return new Estado(false, true);
        return new Estado(null, false);
    }

    // ── Documento ────────────────────────────────────────────────────────────

    // 3.0111222E7 — lo que hace Excel con un número largo en una celda angosta.
    private static final Pattern NOTACION_CIENTIFICA = Pattern.compile("^\\d+(?:[.,]\\d+)?[eE][+-]?\\d+$");
    // 30111222.0 — un número que pasó por una planilla y volvió con decimales.
    private static final Pattern ENTERO_CON_CEROS = Pattern.compile("^(\\d+)[.,]0+$");

    static boolean esNotacionCientifica(String crudo) {
        String s = texto(crudo);
        return s != null && NOTACION_CIENTIFICA.matcher(s).matches();
    }

    /** El documento listo para comparar. Vacío si no hay. */
    static String documento(String crudo) {
        String s = texto(crudo);
        if (s == null) return "";
        Matcher m = ENTERO_CON_CEROS.matcher(s);
        if (m.matches()) s = m.group(1);
        return Documento.normalizar(s);
    }

    // ── Email ────────────────────────────────────────────────────────────────

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$");

    static boolean emailValido(String email) {
        return email != null && EMAIL.matcher(email).matches();
    }

    // ── Texto ────────────────────────────────────────────────────────────────

    /** Recortado y con los espacios repetidos colapsados. {@code null} si no queda nada. */
    static String texto(String crudo) {
        if (crudo == null) return null;
        String s = crudo.replace(' ', ' ').trim().replaceAll("[ \\t]+", " ");
        return s.isEmpty() ? null : s;
    }

    /** Para comparar nombres de arancel: sin mayúsculas, sin acentos, sin espacios de más. */
    static String clave(String crudo) {
        String s = texto(crudo);
        return s == null ? "" : sinAcentos(s).toLowerCase(Locale.ROOT);
    }

    /** Los dígitos de un teléfono: {@code 3756-41 7238} y {@code 3756417238} son el mismo. */
    static String digitos(String crudo) {
        return crudo == null ? "" : crudo.replaceAll("\\D", "");
    }

    static String sinAcentos(String s) {
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    }

    private static int entero(String s) {
        return Integer.parseInt(s);
    }
}
