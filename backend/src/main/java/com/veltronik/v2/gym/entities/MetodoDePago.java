package com.veltronik.v2.gym.entities;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;

/**
 * La forma de pago, escrita de UNA sola manera en toda la base.
 *
 * <p><b>Por qué existe.</b> Hasta la V88 cada camino guardaba el método como le salía: la app
 * mandaba {@code CASH}, el importador de historial {@code cash}, los movimientos de caja
 * {@code TRANSFERENCIA} si alguien lo escribía así. Cada lectura tenía que acordarse de
 * comparar sin mayúsculas y de reconocer los alias ({@code MERCADO_PAGO}, {@code MP}), y la que
 * se olvidaba mandaba esa plata a "otros" o no la contaba. Ahora el método se normaliza AL
 * GUARDAR —en la entidad, así no depende de quién escriba— y la base lo exige con un CHECK.</p>
 *
 * <p>Son cinco y no hay más: {@link #OTRO} es el lugar honesto para lo que no es ninguno de los
 * cuatro, en vez de inventar uno nuevo en cada pantalla.</p>
 */
public final class MetodoDePago {

    public static final String EFECTIVO = "CASH";
    public static final String TRANSFERENCIA = "TRANSFER";
    public static final String MERCADO_PAGO = "MERCADOPAGO";
    public static final String TARJETA = "CARD";
    public static final String OTRO = "OTHER";

    /** Los que acepta la base (el CHECK de la V88 dice lo mismo). */
    public static final Set<String> VALIDOS = Set.of(EFECTIVO, TRANSFERENCIA, MERCADO_PAGO, TARJETA, OTRO);

    private MetodoDePago() {
    }

    /**
     * El código canónico de lo que venga escrito, o {@code null} si no se entiende.
     *
     * <p>Un método vacío es {@link #OTRO}: así lo contaba la caja antes ("un método raro cae en
     * otros en vez de perderse"), y la plata tiene que quedar contada en algún lado.</p>
     */
    public static String reconocer(String crudo) {
        if (crudo == null || crudo.isBlank()) return OTRO;
        String c = clave(crudo);
        if (c.isEmpty()) return OTRO;
        if (c.equals("cash") || c.equals("efectivo") || c.equals("contado") || c.equals("caja")) return EFECTIVO;
        if (c.startsWith("transf") || c.equals("deposito") || c.equals("cbu") || c.equals("alias")) return TRANSFERENCIA;
        if (c.startsWith("mercadopago") || c.equals("mp") || c.equals("qr") || c.equals("mercado")) return MERCADO_PAGO;
        if (c.equals("card") || c.startsWith("tarjeta") || c.equals("debito") || c.equals("credito")
                || c.equals("posnet")) return TARJETA;
        if (c.equals("other") || c.equals("otro") || c.equals("otros")) return OTRO;
        return null;
    }

    /**
     * Para el guardado: lo que no se entiende queda como {@link #OTRO}, nunca se pierde el cobro.
     * Quien quiera rechazar un método desconocido (el alta por la API) usa {@link #reconocer}.
     */
    public static String normalizar(String crudo) {
        String c = reconocer(crudo);
        return c != null ? c : OTRO;
    }

    /** ¿Pasó por el cajón? Es lo único que el arqueo del efectivo puede contar. */
    public static boolean esEfectivo(String metodo) {
        return EFECTIVO.equals(normalizar(metodo));
    }

    /** Sin acentos, sin mayúsculas, sin nada que no sea letra o número. */
    private static String clave(String crudo) {
        String sinAcentos = Normalizer.normalize(crudo, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return sinAcentos.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }
}
