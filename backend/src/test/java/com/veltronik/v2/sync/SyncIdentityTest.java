package com.veltronik.v2.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;

/** Resolución de la identidad del sync (cableado): props ganan, archivo como fallback. */
class SyncIdentityTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @TempDir
    Path tempDir;

    private SyncIdentity identity(String cloud, String id, String key, Path file) {
        // tenantId por props vacío: estos tests validan la resolución de cloud/device/key.
        return new SyncIdentity(cloud, id, key, "", file.toString(), mapper);
    }

    @Test
    @DisplayName("sin props y sin archivo, el sync duerme")
    void sin_nada_duerme() {
        assertThat(identity("", "", "", tempDir.resolve("no-existe.json")).resolve()).isEmpty();
    }

    @Test
    @DisplayName("las props/env ganan siempre (override manual)")
    void props_ganan() throws Exception {
        Path file = tempDir.resolve("sync-identity.json");
        Files.writeString(file, "{\"cloudUrl\":\"https://archivo\",\"deviceId\":\"d\",\"deviceKey\":\"k\"}");

        var resolved = identity("https://props/api/", "id-props", "key-props", file).resolve();

        assertThat(resolved).isPresent();
        assertThat(resolved.get().cloudUrl()).isEqualTo("https://props"); // normalizada: sin /api ni barra
        assertThat(resolved.get().deviceId()).isEqualTo("id-props");
    }

    @Test
    @DisplayName("el archivo del enrolamiento activa el sync (el cableado automático)")
    void archivo_resuelve() throws Exception {
        Path file = tempDir.resolve("sync-identity.json");
        Files.writeString(file, "{\"cloudUrl\":\"https://nube.example/api\",\"deviceId\":\"dev-1\","
                + "\"deviceKey\":\"vk_abc\",\"role\":\"CAJA\",\"otroCampo\":\"ignorado\"}");

        var resolved = identity("", "", "", file).resolve();

        assertThat(resolved).isPresent();
        assertThat(resolved.get().cloudUrl()).isEqualTo("https://nube.example");
        assertThat(resolved.get().deviceId()).isEqualTo("dev-1");
        assertThat(resolved.get().deviceKey()).isEqualTo("vk_abc");
    }

    @Test
    @DisplayName("archivo corrupto o incompleto no rompe nada: el sync duerme")
    void archivo_corrupto_duerme() throws Exception {
        Path corrupt = tempDir.resolve("corrupto.json");
        Files.writeString(corrupt, "esto no es json {{{");
        assertThat(identity("", "", "", corrupt).resolve()).isEmpty();

        Path incomplete = tempDir.resolve("incompleto.json");
        Files.writeString(incomplete, "{\"cloudUrl\":\"https://x\",\"deviceId\":\"\",\"deviceKey\":\"k\"}");
        assertThat(identity("", "", "", incomplete).resolve()).isEmpty();
    }
}
