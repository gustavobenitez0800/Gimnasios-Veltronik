package com.veltronik.v2.support;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.Statement;
import java.util.concurrent.CountDownLatch;

/**
 * SOLO PARA EL ENTORNO DE PRUEBA LOCAL — no se commitea.
 *
 * <p>Levanta el PostgreSQL 16 embebido de zonky en un puerto fijo y lo deja abierto, para que
 * el backend real (otro proceso) se conecte por TCP. La máquina de desarrollo tiene un Postgres
 * 9.5 que Flyway Community ya no soporta; esto da uno moderno sin instalar nada.</p>
 *
 * <p>Se corre con {@code mvnw test -Dtest=LocalStackDb} en segundo plano. Mientras el proceso
 * viva, los datos persisten; al cortarlo, se van (es un entorno de prueba).</p>
 */
class LocalStackDb {

    @Test
    void arrancarYSostener() throws Exception {
        EmbeddedPostgres pg = EmbeddedPostgres.builder().setPort(5544).start();
        try (Connection c = pg.getPostgresDatabase().getConnection();
             Statement st = c.createStatement()) {
            // El esquema auth de Supabase que referencian V11/V17: acá va un stub.
            st.execute("CREATE SCHEMA IF NOT EXISTS auth");
            st.execute("CREATE TABLE IF NOT EXISTS auth.users ("
                    + "id uuid PRIMARY KEY, email varchar(255), raw_user_meta_data jsonb)");
        }
        System.out.println(">>> EMBEDDED PG LISTO en jdbc:postgresql://localhost:5544/postgres (user postgres)");
        // Se queda abierto hasta que se mate el proceso.
        new CountDownLatch(1).await();
    }
}
