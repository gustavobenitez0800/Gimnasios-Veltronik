package com.veltronik.v2.sync;

import lombok.Getter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * La identidad del equipo para el sync headless (ladrillo 4): URL de la nube +
 * credencial del bautizo. Sin los tres valores, los jobs de sync duermen.
 *
 * <p>v1: por properties/env ({@code VELTRONIK_SYNC_*}) — el cableado automático
 * (la app le pasa la credencial recibida en el enroll al cerebro local) llega en
 * la próxima tajada, y este componente es el único lugar a tocar.</p>
 */
@Getter
@Component
@Profile("local")
public class SyncIdentity {

    private final String cloudUrl;
    private final String deviceId;
    private final String deviceKey;

    public SyncIdentity(@Value("${veltronik.sync.cloud-url:}") String cloudUrl,
                        @Value("${veltronik.sync.device-id:}") String deviceId,
                        @Value("${veltronik.sync.device-key:}") String deviceKey) {
        this.cloudUrl = cloudUrl == null ? "" : cloudUrl.trim();
        this.deviceId = deviceId == null ? "" : deviceId.trim();
        this.deviceKey = deviceKey == null ? "" : deviceKey.trim();
    }

    public boolean configured() {
        return !cloudUrl.isBlank() && !deviceId.isBlank() && !deviceKey.isBlank();
    }
}
