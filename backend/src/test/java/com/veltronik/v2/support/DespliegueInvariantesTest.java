package com.veltronik.v2.support;

import com.veltronik.v2.core.config.Escala;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Las reglas del DESPLIEGUE, verificadas en el build.
 *
 * <p><b>Por qué existe.</b> Hay decisiones que viven en el YAML del despliegue y de las que
 * el código Java depende sin tener forma de enterarse. Cuando alguien cambia el YAML, nada
 * se pone rojo: el código sigue compilando, los tests siguen verdes, y lo único que pasa es
 * que un comentario empieza a mentir en silencio.</p>
 *
 * <p>Este test es el cable que faltaba. No prueba comportamiento: prueba que dos archivos que
 * hablan de lo mismo sigan diciendo lo mismo.</p>
 *
 * <p>Es un test común y corriente, sin base ni contexto de Spring, porque lo único que
 * necesita es leer dos archivos de texto.</p>
 */
@DisplayName("Invariantes del despliegue")
class DespliegueInvariantesTest {

    private static final String WORKFLOW = ".github/workflows/deploy-cloudrun.yml";

    @Test
    @DisplayName("el tope de instancias del codigo es el mismo que el del despliegue")
    void elTopeDeInstanciasCoincide() throws IOException {
        Path workflow = ubicar(WORKFLOW);
        String yml = Files.readString(workflow);

        Matcher m = Pattern.compile("--max-instances=([0-9]+)").matcher(yml);
        assertTrue(m.find(),
                "No encontre --max-instances en " + workflow + ". Si se saco la bandera, Cloud Run "
                        + "pasa a usar SU default (100 hoy), y todos los frenos en memoria del sistema "
                        + "quedan multiplicados por eso. Hay que decidirlo a proposito, no heredarlo.");

        int enElDespliegue = Integer.parseInt(m.group(1));

        assertEquals(enElDespliegue, Escala.MAX_INSTANCIAS,
                """
                El despliegue levanta hasta %d copias del backend y Escala.MAX_INSTANCIAS dice %d.

                Esto no es un numero decorativo: varios frenos cuentan EN MEMORIA, asi que cada
                copia lleva su propio contador. El tope real de cada uno es su constante por la
                cantidad de copias. Al cambiar este numero hay que pasar por:

                  - PublicCheckinController  (escaneos y fallos del cartel de QR)
                  - PublicMolineteController (avisos de la puerta)
                  - CashierService           (intentos fallidos del PIN)

                y confirmar que el tope resultante sigue teniendo sentido. Despues, actualizar
                Escala.MAX_INSTANCIAS.
                """.formatted(enElDespliegue, Escala.MAX_INSTANCIAS));
    }

    /**
     * Busca un archivo del repositorio subiendo desde donde se esté corriendo.
     *
     * <p>Los tests arrancan con el directorio en {@code backend/}, pero alguien puede correrlos
     * desde la raíz. Subir hasta encontrarlo funciona en los dos casos y no depende de cuántos
     * niveles haya.</p>
     */
    private static Path ubicar(String relativo) {
        Path dir = Paths.get("").toAbsolutePath();
        while (dir != null) {
            Path candidato = dir.resolve(relativo);
            if (Files.exists(candidato)) {
                return candidato;
            }
            dir = dir.getParent();
        }
        throw new IllegalStateException(
                "No pude encontrar " + relativo + " subiendo desde " + Paths.get("").toAbsolutePath()
                        + ". Este test necesita el repositorio completo, no solo el módulo backend.");
    }
}
