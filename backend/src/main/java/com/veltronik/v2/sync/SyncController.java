package com.veltronik.v2.sync;

import com.veltronik.v2.core.security.DeviceContextHolder;
import com.veltronik.v2.core.security.TenantContextHolder;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * El endpoint del sync headless (ladrillo 4, ADR-010).
 *
 * <p>Sin JWT: la puerta es {@code DeviceCredentialFilter} (X-Device-Id + X-Device-Key),
 * que valida la credencial del bautizo y deja tenant y DNI en los ThreadLocals — llegar
 * acá implica equipo autenticado, activo y enrolado.</p>
 */
@RestController
@RequestMapping("/api/sync")
@RequiredArgsConstructor
public class SyncController {

    private final SyncApplyService syncApplyService;
    private final SyncPullService syncPullService;

    @Data
    public static class PushRequest {
        @Valid
        private List<SyncChange> changes = List.of();
    }

    /** Recibe un lote del outbox local y lo aplica con idempotencia. */
    @PostMapping("/push")
    public ResponseEntity<?> push(@Valid @RequestBody PushRequest request) {
        SyncApplyService.ApplyResult result = syncApplyService.apply(
                TenantContextHolder.getTenantId(),
                DeviceContextHolder.getDeviceId(),
                request.getChanges());
        return ResponseEntity.ok(Map.of(
                "applied", result.applied(),
                "skipped", result.skipped()));
    }

    /**
     * La bajada de config: filas de las tablas CONFIG del tenant del equipo modificadas
     * después del watermark ({@code since}, ISO local; ausente = desde el principio).
     */
    @GetMapping("/pull")
    public ResponseEntity<?> pull(@RequestParam(name = "since", required = false) String since) {
        LocalDateTime sinceAt = (since == null || since.isBlank())
                ? SyncPullService.EPOCH
                : LocalDateTime.parse(since.trim());
        SyncPullService.PullResult result = syncPullService.pull(TenantContextHolder.getTenantId(), sinceAt);
        return ResponseEntity.ok(Map.of(
                "changes", result.changes(),
                "watermark", result.watermark().toString()));
    }
}
