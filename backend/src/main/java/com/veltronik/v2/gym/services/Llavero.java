package com.veltronik.v2.gym.services;

import java.util.regex.Pattern;

/**
 * Qué cuenta como "el mismo llavero". Una sola definición para todo el sistema (ADR-016 §2).
 *
 * <p>La usan la asignación, la búsqueda y el paso de los llaveros que vinieron en el DNI. Del
 * lado de la pantalla, {@code lib/llaveros.js} aplica exactamente la misma limpieza a lo que
 * escribe el lector, y el CHECK de la V90 frena en la base lo que no la respete.</p>
 *
 * <p><b>La regla: sin espacios y en mayúsculas. Nada más.</b> Es más corta que la del DNI
 * ({@link Documento}) a propósito:</p>
 * <ul>
 *   <li><b>No se sacan los ceros de adelante.</b> El lector típico escribe diez dígitos
 *       ({@code 0012345678}). Sin los ceros queda {@code 12345678}, que es un DNI válido y
 *       podría ser el de otro socio. Diez dígitos nunca son un DNI argentino; ocho, sí.</li>
 *   <li><b>No se sacan la coma ni los puntos.</b> Un lector Wiegand escribe {@code 188,22136};
 *       sin la coma serían ocho dígitos, otra vez con forma de DNI.</li>
 *   <li><b>No se convierte de formato.</b> El mismo llavero puede salir decimal o hexadecimal
 *       según el lector: se guarda lo que escribe el lector del gimnasio, y por eso los
 *       llaveros se asignan pasándolos por ese lector.</li>
 * </ul>
 */
public final class Llavero {

    /** Más corto no es un llavero: es un dedo que tocó el teclado. */
    public static final int LARGO_MINIMO = 4;

    /** El largo de la columna. Ningún lector escribe tanto. */
    public static final int LARGO_MAXIMO = 64;

    /**
     * Letras, dígitos y los separadores que usan los lectores (coma del Wiegand, puntos, dos
     * puntos y guiones de algunos hexadecimales). Cualquier otra cosa es un error de tipeo o
     * un lector con la distribución de teclado cambiada, y es mejor decirlo que guardarlo.
     */
    private static final Pattern PERMITIDO = Pattern.compile("[0-9A-Z,.:_-]+");

    private Llavero() {
    }

    /** El código como se guarda y se compara. Nunca devuelve null. */
    public static String normalizar(String crudo) {
        if (crudo == null) return "";
        return crudo.replaceAll("\\s+", "").toUpperCase();
    }

    /** ¿Esto, ya normalizado, puede ser el código de un llavero? */
    public static boolean esValido(String codigo) {
        return codigo != null
                && codigo.length() >= LARGO_MINIMO
                && codigo.length() <= LARGO_MAXIMO
                && PERMITIDO.matcher(codigo).matches();
    }

    /**
     * ¿Este DOCUMENTO parece en realidad el número de un llavero?
     *
     * <p>Es lo que hacía ControlFit: guardaba el llavero en el campo DNI/ID. Se reconoce por
     * la forma: solo dígitos, y más largo que cualquier DNI argentino (nueve o más; el lector
     * típico escribe diez).</p>
     *
     * <p>No alcanza con que empiece con cero: hay sistemas que guardan un DNI de siete dígitos
     * rellenado a ocho ({@code 01234567}), y ese es un documento de verdad.</p>
     *
     * <p>⚠️ <b>Parece, no es.</b> Un CPF brasileño tiene once dígitos y una cédula colombiana
     * diez: por eso esto arma una lista para que una persona la revise, y nunca pasa nada
     * solo.</p>
     */
    public static boolean pareceLlavero(String documento) {
        String d = normalizar(documento);
        return d.length() >= 9 && d.length() <= LARGO_MAXIMO && d.chars().allMatch(c -> c >= '0' && c <= '9');
    }
}
