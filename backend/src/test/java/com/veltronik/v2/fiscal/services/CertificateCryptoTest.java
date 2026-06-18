package com.veltronik.v2.fiscal.services;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** Tests del cifrado AES-GCM del material fiscal. */
class CertificateCryptoTest {

    private final CertificateCrypto crypto = new CertificateCrypto("master-de-prueba-veltronik");

    @Test
    @DisplayName("encrypt/decrypt devuelve el texto original (round-trip)")
    void roundTrip() {
        String secret = "-----BEGIN PRIVATE KEY-----\nMIIBVAIBADAN...\n-----END PRIVATE KEY-----";
        String enc = crypto.encrypt(secret);
        assertNotEquals(secret, enc);
        assertEquals(secret, crypto.decrypt(enc));
    }

    @Test
    @DisplayName("cifrar dos veces lo mismo da resultados distintos (IV aleatorio por GCM)")
    void nonDeterministic() {
        String enc1 = crypto.encrypt("mismo-texto");
        String enc2 = crypto.encrypt("mismo-texto");
        assertNotEquals(enc1, enc2);
        assertEquals("mismo-texto", crypto.decrypt(enc1));
        assertEquals("mismo-texto", crypto.decrypt(enc2));
    }

    @Test
    @DisplayName("sin master key configurada, cifrar falla (no cifra débil)")
    void failsWhenNotConfigured() {
        CertificateCrypto disabled = new CertificateCrypto("");
        assertFalse(disabled.isConfigured());
        assertThrows(IllegalStateException.class, () -> disabled.encrypt("x"));
    }
}
