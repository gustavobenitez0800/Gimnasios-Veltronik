package com.veltronik.v2.core.security;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.LongSupplier;

/**
 * Cuenta pedidos por clave en ventanas de un minuto, <b>con techo de memoria</b>.
 *
 * <p>Lo usan las puertas públicas (el cartel de QR y el molinete), que frenan por el token que
 * llega en el pedido. Antes cada una tenía su propio mapa, y los dos tenían el mismo agujero:
 * anotaban CUALQUIER token —aunque no existiera— y solo lo borraban si ese mismo token volvía a
 * llegar un minuto después. Alguien que mandara millones de tokens inventados, sin cuenta y sin
 * saber nada del sistema, iba llenando la memoria hasta voltear el servidor.</p>
 *
 * <p><b>El techo y qué pasa al tocarlo.</b> Se recuerdan hasta {@link #MAX_CLAVES} claves. Al
 * llegar, primero se tiran las que ya vencieron; si sigue lleno —o sea, alguien está mandando
 * miles de claves distintas por minuto— las claves NUEVAS no se anotan. Es a propósito: el freno
 * existe para cuidar los tokens reales (que nadie barra documentos contra un cartel fotografiado),
 * y esos ya están adentro porque se usan todo el tiempo. Un token inventado no hace falta frenarlo:
 * no se puede adivinar uno de verdad (192 bits al azar) y la base lo rechaza igual.</p>
 *
 * <p>No es un bean: cada puerta crea el suyo, así los topes de una no se mezclan con los de otra.</p>
 */
public final class FrenoPorMinuto {

    /** Claves que se recuerdan a la vez. Mil gimnasios con dos puertas cada uno entran de sobra. */
    static final int MAX_CLAVES = 10_000;

    /**
     * Una clave más larga que esto no es un token nuestro (los reales tienen 32 caracteres). Las
     * puertas la rechazan antes de llegar acá, de la base y de los registros.
     */
    public static final int MAX_LARGO_CLAVE = 128;

    private static final long VENTANA_SEGUNDOS = 60;

    private final ConcurrentHashMap<String, Ventana> ventanas = new ConcurrentHashMap<>();
    private final LongSupplier ahora;
    /** Barrer el mapa entero cuesta: con un barrido por segundo alcanza, aunque lleguen mil pedidos. */
    private volatile long ultimaPurga;

    public FrenoPorMinuto() {
        this(() -> Instant.now().getEpochSecond());
    }

    /** Con un reloj a mano, para los tests. Devuelve segundos. */
    FrenoPorMinuto(LongSupplier ahoraEnSegundos) {
        this.ahora = ahoraEnSegundos;
    }

    private static final class Ventana {
        volatile long desde;
        final AtomicInteger total = new AtomicInteger();
        final AtomicInteger fallos = new AtomicInteger();

        Ventana(long desde) {
            this.desde = desde;
        }
    }

    /** ¿Esta clave ya llegó, en el minuto en curso, a alguno de los dos topes? */
    public boolean frenado(String clave, int topeTotal, int topeFallos) {
        Ventana v = ventanas.get(clave);
        if (v == null) return false;
        if (vencida(v)) {
            ventanas.remove(clave, v);
            return false;
        }
        return v.total.get() >= topeTotal || v.fallos.get() >= topeFallos;
    }

    /** Anota un pedido de esta clave; {@code fallo} suma además al tope de fallos. */
    public void registrar(String clave, boolean fallo) {
        Ventana v = ventanas.get(clave);
        if (v == null) {
            if (ventanas.size() >= MAX_CLAVES) {
                purgarVencidas();
                if (ventanas.size() >= MAX_CLAVES) return; // lleno de claves vivas: ver el javadoc
            }
            v = ventanas.computeIfAbsent(clave, k -> new Ventana(ahora.getAsLong()));
        }
        if (vencida(v)) {
            v.desde = ahora.getAsLong();
            v.total.set(0);
            v.fallos.set(0);
        }
        v.total.incrementAndGet();
        if (fallo) v.fallos.incrementAndGet();
    }

    /** Cuántas claves se están recordando. Para los tests. */
    int claves() {
        return ventanas.size();
    }

    private boolean vencida(Ventana v) {
        return ahora.getAsLong() - v.desde >= VENTANA_SEGUNDOS;
    }

    private void purgarVencidas() {
        long t = ahora.getAsLong();
        if (t == ultimaPurga) return;
        ultimaPurga = t;
        ventanas.values().removeIf(this::vencida);
    }
}
