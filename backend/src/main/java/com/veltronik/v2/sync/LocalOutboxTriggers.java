package com.veltronik.v2.sync;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.api.callback.Callback;
import org.flywaydb.core.api.callback.Context;
import org.flywaydb.core.api.callback.Event;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.sql.SQLException;
import java.sql.Statement;

/**
 * La CAPTURA del outbox local (ladrillo 4, ADR-010): triggers de Postgres que anotan
 * cada INSERT de las tablas sincronizables en {@code sync_outbox}, con la fila exacta
 * ({@code to_jsonb(NEW)}).
 *
 * <p><b>Solo en modo local:</b> la tabla outbox viaja en la cadena única de migraciones
 * (V34), pero los triggers se crean acá, como callback {@code afterMigrate} de Flyway
 * bajo el perfil {@code local} — la nube es la receptora del sync, no una emisora.
 * Idempotente: DROP IF EXISTS + CREATE en cada arranque (y así un update del instalable
 * que agregue tablas al registro re-cablea solo).</p>
 *
 * <p><b>Por qué triggers y no listeners de JPA:</b> la base anota TODO lo que se escribe
 * (cualquier camino de código, presente o futuro) y el payload es la fila física — que
 * la nube puede aplicar tal cual porque ambos lados corren el mismo motor y esquema.</p>
 */
@Slf4j
@Configuration
@Profile("local")
@RequiredArgsConstructor
public class LocalOutboxTriggers {

    private static final String TRIGGER_FUNCTION = """
            CREATE OR REPLACE FUNCTION veltronik_outbox_capture() RETURNS trigger AS $$
            BEGIN
              INSERT INTO sync_outbox (table_name, row_id, op, payload)
              VALUES (TG_TABLE_NAME, NEW.id, TG_OP, to_jsonb(NEW));
              RETURN NEW;
            END;
            $$ LANGUAGE plpgsql
            """;

    private final SyncTableRegistry registry;

    @Bean
    public FlywayConfigurationCustomizer outboxTriggersCustomizer() {
        return configuration -> configuration.callbacks(new OutboxTriggerCallback());
    }

    private class OutboxTriggerCallback implements Callback {

        @Override
        public boolean supports(Event event, Context context) {
            return event == Event.AFTER_MIGRATE;
        }

        @Override
        public boolean canHandleInTransaction(Event event, Context context) {
            return true;
        }

        @Override
        public void handle(Event event, Context context) {
            try (Statement statement = context.getConnection().createStatement()) {
                statement.execute(TRIGGER_FUNCTION);
                for (SyncTableRegistry.SyncTable table : registry.tables()) {
                    String trigger = "trg_sync_outbox_" + table.name();
                    statement.execute("DROP TRIGGER IF EXISTS " + trigger + " ON " + table.name());
                    statement.execute("CREATE TRIGGER " + trigger
                            + " AFTER INSERT ON " + table.name()
                            + " FOR EACH ROW EXECUTE FUNCTION veltronik_outbox_capture()");
                }
                log.info("Outbox local cableado: {} tablas con trigger de captura", registry.tables().size());
            } catch (SQLException e) {
                // Sin captura no hay sync — mejor frenar el arranque que operar "en silencio roto".
                throw new IllegalStateException("No se pudieron crear los triggers del outbox", e);
            }
        }

        @Override
        public String getCallbackName() {
            return "veltronik-outbox-triggers";
        }
    }
}
