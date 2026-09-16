package com.veltronik.v2.support;

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
 * Las reglas de los PRECIOS, verificadas en el build.
 *
 * <p><b>Por que existe.</b> Hasta el 2026-09-16 los tres valores de facturacion vivian
 * <b>solo en la consola de Cloud Run</b>, puestos a mano, y el repo decia otra cosa: 45.000
 * cuando se cobraban 55.000, el premium apagado cuando estaba prendido, y 80.000 cuando
 * valia 145.000. Nadie lo noto durante semanas porque la variable de entorno le gana al
 * default y todo funcionaba igual.</p>
 *
 * <p><b>Como fallaba.</b> El dia que esas variables se perdieran —un servicio recreado, un
 * borrado, otra via de deploy— el precio volvia <b>en silencio</b> a 45.000. Y el centinela
 * de {@code SubscriptionBillingService} no lo habria atrapado: compara el cobro contra
 * {@code monthly-price}, asi que si ese tambien cayo, un cobro de 45.000 cuadra perfecto.</p>
 *
 * <p><b>Que se defiende aca.</b> Que el mismo numero no viva escrito distinto en tres
 * lugares. El precio no es un secreto —esta publicado en veltronik.com.ar— asi que el repo
 * puede y debe decir la verdad.</p>
 *
 * <p>Es un test comun, sin base ni contexto de Spring: lo unico que necesita es leer tres
 * archivos de texto y comparar numeros.</p>
 *
 * <p>⛔ NO verifica contra Cloud Run: nadie de aca puede leer sus variables. Verifica que el
 * repo sea coherente consigo mismo. Si alguien cambia un precio en la consola y no lo cambia
 * aca, esta prueba no se entera — pero el default deja de ser una trampa silenciosa, porque
 * ya vale lo mismo que el precio real.</p>
 */
@DisplayName("Invariantes de los precios")
class PreciosInvariantesTest {

    private static final String PROPS = "backend/src/main/resources/application.properties";
    private static final String BILLING = "backend/src/main/java/com/veltronik/v2/core/config/BillingProperties.java";
    private static final String CATALOGO = "backend/src/main/java/com/veltronik/v2/core/config/PlanCatalog.java";
    private static final String LANDING = "landing/src/lib/plans.js";

    @Test
    @DisplayName("el default de Java y el de application.properties dicen lo mismo")
    void losDosDefaultsCoinciden() throws IOException {
        // Los `@Value("${...:default}")` de Java son una SEGUNDA fuente de verdad: solo se
        // usan si la propiedad no existe, pero cuando se desincronizan nadie lo ve.
        assertEquals(enProperties("veltronik.billing.monthly-price"),
                enJava(BILLING, "veltronik.billing.monthly-price"),
                "application.properties y BillingProperties dicen precios distintos para el "
                        + "plan basico. Es el mismo numero: que digan lo mismo.");

        assertEquals(enProperties("veltronik.billing.premium-price"),
                enJava(CATALOGO, "veltronik.billing.premium-price"),
                "Lo mismo para el premium, entre application.properties y PlanCatalog.");
    }

    @Test
    @DisplayName("⭐ la landing no publica un precio que el backend no cobra")
    void laLandingNoPublicaUnPrecioQueNoSeCobra() throws IOException {
        // ⚠️ ESTE ES EL QUE PROTEGE PLATA. La landing le pide el precio al backend en tiempo
        // de COMPILACION; si Cloud Run esta frio en ese momento, publica su respaldo. Con el
        // respaldo desactualizado la web anuncia un precio y el sistema cobra otro — y
        // alguien puede suscribirse mirando el numero equivocado.
        String js = Files.readString(ubicar(LANDING));
        Matcher m = Pattern.compile("price:\\s*([0-9]+)").matcher(js);
        assertTrue(m.find(), "No encontre el precio del respaldo en " + LANDING);

        assertEquals(enProperties("veltronik.billing.monthly-price"), m.group(1),
                """
                El respaldo de la landing publica un precio distinto del que cobra el backend.

                La landing arma el precio al compilar. Si el backend esta frio en ese momento
                usa ese respaldo, y la web queda anunciando un numero que el sistema no cobra.

                Al cambiar un precio hay que tocar los TRES lugares:
                  - backend/src/main/resources/application.properties
                  - BillingProperties.java  (y PlanCatalog.java para el premium)
                  - landing/src/lib/plans.js  (el RESPALDO)

                Y despues redeployar la landing en Vercel, o el sitio sigue mostrando el viejo.
                """);
    }

    /** El default tal como lo escribe application.properties: `clave=${ENV_VAR:1234}`. */
    private String enProperties(String clave) throws IOException {
        return buscar(PROPS, Pattern.quote(clave) + "=\\$\\{[A-Z_]+:([0-9]+)}", clave);
    }

    /** El default tal como lo escribe un `@Value` de Java: `@Value("${clave:1234}")`. */
    private String enJava(String archivo, String clave) throws IOException {
        return buscar(archivo, "\\$\\{" + Pattern.quote(clave) + ":([0-9]+)}", clave);
    }

    private String buscar(String archivo, String regex, String clave) throws IOException {
        Matcher m = Pattern.compile(regex).matcher(Files.readString(ubicar(archivo)));
        assertTrue(m.find(), "No encontre el default de " + clave + " en " + archivo);
        return m.group(1);
    }

    /** Busca un archivo del repositorio subiendo desde donde se este corriendo. */
    private static Path ubicar(String relativo) {
        Path dir = Paths.get("").toAbsolutePath();
        while (dir != null) {
            Path candidato = dir.resolve(relativo);
            if (Files.exists(candidato)) {
                return candidato;
            }
            dir = dir.getParent();
        }
        throw new IllegalStateException("No pude encontrar " + relativo + " subiendo desde "
                + Paths.get("").toAbsolutePath() + ". Este test necesita el repositorio completo.");
    }
}
