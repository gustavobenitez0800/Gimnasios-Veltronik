package com.veltronik.v2.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.veltronik.v2.core.exceptions.BusinessException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.CleanupMode;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * El MOTOR de sync de punta a punta contra Postgres real (ladrillo 4, ADR-010):
 * trigger de captura → outbox → apply genérico → idempotencia → guardia de tenant.
 *
 * <p>Una sola base hace de local (los triggers capturan) y de nube (el apply inserta) —
 * en producción los triggers existen solo en el local y el apply corre solo en la nube,
 * pero la mecánica que se prueba es idéntica.</p>
 */
@SpringBootTest
@ActiveProfiles("local")
class SyncEngineIntegrationTest {

    // CleanupMode.NEVER: mismo motivo que LocalRuntimeBootTest (el contexto Spring, y con
    // él la Postgres embebida que traba el pgdata, cierra después del cleanup de JUnit).
    @TempDir(cleanup = CleanupMode.NEVER)
    static Path tempDir;

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("veltronik.local.data-dir", () -> tempDir.resolve("pgdata").toString());
        registry.add("veltronik.local.pg-port", () -> "0");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired SyncApplyService applyService;
    @Autowired ObjectMapper mapper;

    @Test
    void captura_aplica_idempotencia_y_guardia_de_tenant() throws Exception {
        // ── Semilla: un tenant y una sesión de caja (tabla piloto del registro) ──
        UUID tenantId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        UUID sessionId = UUID.randomUUID();
        jdbc.update("INSERT INTO tenant (id, created_at, updated_at, name, business_type, is_active) "
                + "VALUES (?, now(), now(), 'Kiosco Test Sync', 'KIOSK', true)", tenantId);
        jdbc.update("INSERT INTO kiosk_cash_session (id, created_at, updated_at, tenant_id, status, opening_amount, opened_at) "
                + "VALUES (?, now(), now(), ?, 'OPEN', 0, now())", sessionId, tenantId);

        // ── 1. El trigger capturó la fila exacta en el outbox ──
        Map<String, Object> captured = jdbc.queryForMap(
                "SELECT table_name, op, payload::text AS payload FROM sync_outbox WHERE row_id = ?", sessionId);
        assertThat(captured.get("table_name")).isEqualTo("kiosk_cash_session");
        assertThat(captured.get("op")).isEqualTo("INSERT");

        // ── 2. Simular la base receptora: la fila original no existe ──
        jdbc.update("DELETE FROM kiosk_cash_session WHERE id = ?", sessionId);

        // ── 3. Aplicar el payload — con un tenant FALSO adentro, que la guardia debe pisar ──
        ObjectNode row = (ObjectNode) mapper.readTree((String) captured.get("payload"));
        row.put("tenant_id", UUID.randomUUID().toString()); // payload malicioso/errado
        SyncChange change = new SyncChange();
        change.setTable("kiosk_cash_session");
        change.setOp("INSERT");
        change.setRowId(sessionId);
        change.setRow(row);

        SyncApplyService.ApplyResult first = applyService.apply(tenantId, deviceId, List.of(change));
        assertThat(first.applied()).isEqualTo(1);
        assertThat(first.skipped()).isZero();

        // La fila renació y el tenant es el del EQUIPO AUTENTICADO, no el del payload.
        UUID landedTenant = jdbc.queryForObject(
                "SELECT tenant_id FROM kiosk_cash_session WHERE id = ?", UUID.class, sessionId);
        assertThat(landedTenant).isEqualTo(tenantId);

        // ── 4. Idempotencia: el mismo lote otra vez = cero duplicados ──
        SyncApplyService.ApplyResult second = applyService.apply(tenantId, deviceId, List.of(change));
        assertThat(second.applied()).isZero();
        assertThat(second.skipped()).isEqualTo(1);
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM kiosk_cash_session WHERE id = ?", Integer.class, sessionId);
        assertThat(count).isEqualTo(1);

        // ── 5. La whitelist manda: una tabla fuera del registro se rechaza ──
        SyncChange forbidden = new SyncChange();
        forbidden.setTable("app_user");
        forbidden.setOp("INSERT");
        forbidden.setRowId(UUID.randomUUID());
        forbidden.setRow(mapper.createObjectNode());
        assertThatThrownBy(() -> applyService.apply(tenantId, deviceId, List.of(forbidden)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("app_user");

        // ── 6. Solo INSERT en v1 ──
        change.setOp("UPDATE");
        assertThatThrownBy(() -> applyService.apply(tenantId, deviceId, List.of(change)))
                .isInstanceOf(BusinessException.class);
    }
}
