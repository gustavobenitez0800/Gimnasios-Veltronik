package com.veltronik.v2.support;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Las reglas del ESQUEMA, verificadas en el build.
 *
 * <p><b>Por qué existe.</b> Las migraciones V67→V72 ordenaron la base: sacaron las tablas
 * muertas, prendieron RLS, unificaron cómo se guarda la plata y taparon los agujeros de
 * nulabilidad. Nada de eso se sostiene solo. Una regla que vive en un comentario de una
 * migración de 2026 no la va a leer el que agregue una tabla en 2027 — y el día que se la
 * saltee, no se va a poner nada en rojo: la base simplemente va a volver a tener dos
 * opiniones sobre cada cosa, de a una columna por vez.</p>
 *
 * <p>Este test es esa regla, pero puesta donde se verifica. Corre sobre la MISMA base que
 * usa {@code ApplicationBootTest}: una PostgreSQL virgen con las migraciones aplicadas de
 * punta a punta. Lo que prueba no es el código: es la forma de la base que queda después
 * de correrlas.</p>
 *
 * <p><b>Cómo se lee una falla.</b> Cada test nombra la tabla y la columna exactas y dice
 * qué migración estableció la regla. Si estás acá porque agregaste algo y esto se puso
 * rojo, la respuesta casi siempre es corregir tu migración, no aflojar el test.</p>
 */
@DisplayName("Invariantes del esquema")
class EsquemaInvariantesTest extends EmbeddedPostgresTest {

    @Autowired
    private DataSource dataSource;

    /** Corre una consulta que devuelve una sola columna de texto y junta las filas. */
    private List<String> consultar(String sql) {
        List<String> filas = new ArrayList<>();
        try (Connection c = dataSource.getConnection();
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                filas.add(rs.getString(1));
            }
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo inspeccionar el esquema", e);
        }
        return filas;
    }

    @Nested
    @DisplayName("seguridad")
    class Seguridad {

        /**
         * ⭐ EL QUE MÁS IMPORTA. La clave {@code anon} de Supabase viaja horneada en el
         * bundle del instalable: cualquiera que lo abra la tiene. Lo único que separa esa
         * clave de los datos de todos los gimnasios es que las tablas tengan RLS.
         *
         * <p>Se cerró a mano en el panel el 2026-09-06 y la V68 lo pasó a las migraciones.
         * Este test es lo que hace que no se vuelva a abrir: una tabla nueva SIN RLS no
         * llega a producción, se cae acá.</p>
         */
        @Test
        @DisplayName("ninguna tabla de public queda sin RLS")
        void todasLasTablasTienenRls() {
            List<String> sinRls = consultar("""
                SELECT c.relname
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relkind = 'r'
                  AND c.relname <> 'flyway_schema_history'
                  AND NOT c.relrowsecurity
                ORDER BY c.relname
                """);

            assertTrue(sinRls.isEmpty(),
                    "Estas tablas de `public` no tienen Row Level Security: " + sinRls
                    + ". La clave anon de Supabase está en el bundle del instalable y sin RLS "
                    + "llega a leerlas. Agregá `ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;` "
                    + "a tu migración, como hace la V68 con las otras.");
        }
    }

    @Nested
    @DisplayName("las tablas muertas no vuelven")
    class TablasMuertas {

        /**
         * Las del modelo original (V1/V2), las de los verticales dados de baja, y los
         * nombres en PLURAL que la V75 dejó atrás. Si alguno reaparece es que una migración
         * vieja se volvió a aplicar sobre una base que ya no la esperaba.
         *
         * <p>⚠️ <b>CUIDADO CON {@code gym_member}: el mismo nombre significa dos cosas
         * distintas según la fecha.</b></p>
         *
         * <ul>
         *   <li><b>Hasta la V74</b> era la tabla del modelo original, sin uso en el código.
         *       La V67 no pudo borrarla porque su guarda encontró 114 socios que solo vivían
         *       ahí; se puso el caso sobre la mesa y se decidió borrarlos. La V74 la sacó.</li>
         *   <li><b>Desde la V75</b> {@code gym_member} es EL PADRÓN VIVO: es
         *       {@code gym_members} renombrado en singular, que recién pudo tomar el nombre
         *       cuando la V74 lo liberó.</li>
         * </ul>
         *
         * <p>Por eso lo que va en esta lista es {@code gym_members} (plural, el nombre
         * viejo) y NO {@code gym_member}. Agregar {@code gym_member} acá haría fallar el
         * build contra la tabla más importante del sistema.</p>
         */
        @Test
        @DisplayName("ninguna tabla dada de baja ni ningún nombre viejo sigue en la base")
        void lasTablasDadasDeBajaNoEstan() {
            List<String> revividas = consultar("""
                SELECT tablename FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename IN (
                      -- Modelo original (V67, V74)
                      'gym_member_legacy', 'member_payment', 'member_subscription', 'membership_plan',
                      -- El modelo unificado intermedio (V10)
                      'members', 'payments',
                      -- Nombres en plural que reemplazó la V75
                      'gym_members', 'gym_payments', 'gym_plans', 'subscriptions',
                      -- Verticales dados de baja (V40-V43)
                      'court', 'court_booking', 'court_settings',
                      'kiosk_sale', 'kiosk_product', 'kiosk_settings',
                      'fiscal_config', 'fiscal_voucher',
                      'sync_outbox', 'sync_state'
                  )
                ORDER BY tablename
                """);

            assertTrue(revividas.isEmpty(),
                    "Estas tablas se dieron de baja o se renombraron y volvieron a aparecer: "
                    + revividas + ". Ver V67 y V74 (modelo original), V75 (plural → singular), "
                    + "V40-V43 (verticales dados de baja).");
        }
    }

    @Nested
    @DisplayName("convención de nombres")
    class Nombres {

        /**
         * La regla de la V75: una tabla define qué ES UNA FILA, así que va en singular.
         * Hasta esa migración convivían dieciocho en singular y cuatro en plural, y el
         * reparto era puro accidente histórico — lo que obligaba a ACORDARSE de cuál forma
         * le tocó a cada tabla al escribir una query.
         *
         * <p>El criterio es "termina en -s pero no en -ss", que deja pasar
         * {@code gym_class} (y cualquier otra palabra que termine naturalmente en doble
         * ese) y agarra {@code gym_members}, {@code subscriptions} y compañía.</p>
         */
        @Test
        @DisplayName("ninguna tabla en plural")
        void lasTablasVanEnSingular() {
            List<String> enPlural = consultar("""
                SELECT tablename FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename <> 'flyway_schema_history'
                  AND tablename LIKE '%s'
                  AND tablename NOT LIKE '%ss'
                ORDER BY tablename
                """);

            assertTrue(enPlural.isEmpty(),
                    "Estas tablas están en plural: " + enPlural
                    + ". En esta base una tabla dice qué es UNA fila, así que va en singular "
                    + "— ver V75. Si la palabra termina en -s de verdad y no es plural, "
                    + "ajustá el criterio de este test explicando por qué.");
        }
    }

    @Nested
    @DisplayName("la plata")
    class Plata {

        /**
         * La regla de la V69: todo importe es {@code NUMERIC(14,2)}. Antes convivían tres
         * precisiones distintas —(10,2), (12,2) y (14,2)— y dos de ellas en la MISMA fila de
         * {@code caja_cierre}. Cada columna nueva era una decisión a tomar de cero.
         *
         * <p>La búsqueda es por nombre de columna a propósito: agarra la que alguien agregue
         * mañana llamándola {@code precio_final} o {@code monto_extra} sin leer la V69.</p>
         */
        @Test
        @DisplayName("todo importe es NUMERIC(14,2)")
        void laPlataSeGuardaIgualEnTodosLados() {
            List<String> fueraDeRegla = consultar("""
                SELECT c.relname || '.' || a.attname || ' es ' || format_type(a.atttypid, a.atttypmod)
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                WHERE n.nspname = 'public'
                  AND c.relkind = 'r'
                  AND (a.attname IN ('amount', 'price', 'monto', 'precio', 'importe',
                                     'fondo_inicial', 'retiro_efectivo', 'queda_en_caja',
                                     'diferencia', 'diferencia_digital')
                       OR a.attname LIKE 'esperado\\_%'
                       OR a.attname LIKE 'declarado\\_%'
                       OR a.attname LIKE 'egresos\\_%'
                       OR a.attname LIKE 'ingresos\\_%')
                  AND format_type(a.atttypid, a.atttypmod) <> 'numeric(14,2)'
                ORDER BY 1
                """);

            assertTrue(fueraDeRegla.isEmpty(),
                    "Estas columnas guardan plata con otra precisión: " + fueraDeRegla
                    + ". En esta base todo importe es NUMERIC(14,2) — ver V69. Si de verdad no "
                    + "es plata, renombrala; si lo es, corregí el tipo en tu migración.");
        }
    }

    @Nested
    @DisplayName("las marcas de tiempo")
    class MarcasDeTiempo {

        /**
         * {@code BaseEntity} declara las dos columnas {@code nullable = false}, y hasta la
         * V70 ocho tablas las tenían nullable igual. El build no lo delataba porque
         * {@code ddl-auto=validate} compara tipos, no nulabilidad — así que esta mentira
         * podía quedarse para siempre sin ponerse roja. Este test es lo que faltaba.
         */
        @Test
        @DisplayName("created_at y updated_at nunca pueden venir vacías")
        void lasMarcasDeTiempoSonObligatorias() {
            List<String> nullables = consultar("""
                SELECT c.relname || '.' || a.attname
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
                WHERE n.nspname = 'public'
                  AND c.relkind = 'r'
                  AND c.relname <> 'flyway_schema_history'
                  AND a.attname IN ('created_at', 'updated_at')
                  AND NOT a.attnotnull
                ORDER BY 1
                """);

            assertTrue(nullables.isEmpty(),
                    "Estas columnas admiten NULL y BaseEntity las declara nullable=false: "
                    + nullables + ". `created_at` es la línea de tiempo con la que se ordena "
                    + "(hay índices montados sobre ella): una fila con NULL cae en un lugar "
                    + "indefinido del orden. Ver V70.");
        }
    }

    @Nested
    @DisplayName("integridad referencial")
    class Integridad {

        /**
         * Una FK sin índice del lado hijo obliga a Postgres a recorrer la tabla entera cada
         * vez que se borra el padre. Con la purga de cuenta (V50) borrando tabla por tabla,
         * eso se paga en el peor momento.
         *
         * <p>No se exige que el índice sea exactamente el de la FK: alcanza con que la
         * columna sea la PRIMERA de algún índice, que es lo que Postgres puede usar.</p>
         */
        @Test
        @DisplayName("toda FK de una sola columna tiene índice del lado hijo")
        void lasFksTienenIndice() {
            List<String> sinIndice = consultar("""
                SELECT rel.relname || '.' || att.attname || ' (' || con.conname || ')'
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_namespace n ON n.oid = rel.relnamespace
                JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
                WHERE con.contype = 'f'
                  AND n.nspname = 'public'
                  AND array_length(con.conkey, 1) = 1
                  AND NOT EXISTS (
                      SELECT 1 FROM pg_index i
                      WHERE i.indrelid = con.conrelid
                        AND i.indkey[0] = con.conkey[1]
                  )
                ORDER BY 1
                """);

            assertTrue(sinIndice.isEmpty(),
                    "Estas claves foráneas no tienen índice del lado hijo: " + sinIndice
                    + ". Sin él, borrar el padre recorre la tabla hija entera. Agregá "
                    + "`CREATE INDEX ... ON <tabla>(<columna>);` a tu migración.");
        }
    }
}
