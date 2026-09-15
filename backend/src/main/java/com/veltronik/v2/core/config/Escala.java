package com.veltronik.v2.core.config;

/**
 * Cuántas copias del backend pueden estar atendiendo al mismo tiempo.
 *
 * <p><b>Por qué esto existe como constante y no como comentario suelto.</b> Varios frenos
 * del sistema cuentan en memoria: los escaneos del cartel de QR, los avisos del molinete,
 * los intentos fallidos del PIN. Cada copia del backend lleva <i>su propio</i> contador y no
 * sabe nada de las otras, así que el tope real de cualquiera de esos frenos no es el número
 * que dice su constante: es ese número multiplicado por cuántas copias haya.</p>
 *
 * <p>Ese multiplicador vivía únicamente en {@code .github/workflows/deploy-cloudrun.yml},
 * en la bandera {@code --max-instances}. El código Java nunca se enteró de que existía, y
 * por eso tres comentarios distintos prometían un tope que no era el que el sistema aplica.
 * Un acoplamiento sin ningún cable que lo una es un comentario que envejece sin avisar.</p>
 *
 * <p><b>El cable está en el build.</b> {@code DespliegueInvariantesTest} lee ese workflow y
 * compara. Si alguien sube {@code --max-instances} y no pasa por acá, el build se pone rojo
 * y lo obliga a revisar los frenos — que es exactamente el momento en que hay que revisarlos
 * y no seis meses después.</p>
 *
 * <p><b>Por qué no se arregla "de verdad", con un contador compartido.</b> Se podría, y
 * costaría Redis o un viaje a la base por cada escaneo, en el camino crítico de una puerta
 * que tiene gente esperando. Estos frenos son paredes contra barridos automáticos, no
 * auditorías: que el tope sea 40 o 120 por minuto no cambia en nada que un barrido de
 * documentos siga siendo inviable. Lo que sí importaba era que el código dijera la verdad.</p>
 */
public final class Escala {

    /**
     * Tope de copias simultáneas del backend.
     *
     * <p>Tiene que coincidir con {@code --max-instances} en
     * {@code .github/workflows/deploy-cloudrun.yml}. El build lo verifica.</p>
     */
    public static final int MAX_INSTANCIAS = 3;

    private Escala() {
    }
}
