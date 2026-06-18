package com.veltronik.v2.fiscal.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Cifra/descifra el material sensible de ARCA (certificado y clave privada de cada tenant) con
 * <b>AES-256-GCM</b>. La master key vive FUERA de la base ({@code veltronik.fiscal.master-key} /
 * env {@code VELTRONIK_FISCAL_MASTER_KEY}) → comprometer la DB no expone las claves privadas.
 *
 * <p>Formato del ciphertext: base64( IV(12 bytes) || ciphertext+tag ). El IV es aleatorio por
 * operación (GCM exige IV único), por eso cifrar dos veces lo mismo da resultados distintos.</p>
 */
@Component
public class CertificateCrypto {

    private static final int IV_LENGTH = 12;
    private static final int TAG_BITS = 128;
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    private final SecretKeySpec masterKey;
    private final boolean configured;
    private final SecureRandom random = new SecureRandom();

    public CertificateCrypto(@Value("${veltronik.fiscal.master-key:}") String master) {
        this.configured = master != null && !master.isBlank();
        // Deriva una clave AES-256 de cualquier passphrase (SHA-256 → 32 bytes). Si no hay master
        // key configurada, queda deshabilitado: encrypt/decrypt fallan en vez de cifrar débil.
        byte[] keyBytes = configured ? sha256(master) : new byte[32];
        this.masterKey = new SecretKeySpec(keyBytes, "AES");
    }

    public boolean isConfigured() {
        return configured;
    }

    public String encrypt(String plaintext) {
        requireConfigured();
        try {
            byte[] iv = new byte[IV_LENGTH];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, masterKey, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ciphertext, 0, out, iv.length, ciphertext.length);
            return Base64.getEncoder().encodeToString(out);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo cifrar el material fiscal", e);
        }
    }

    public String decrypt(String encoded) {
        requireConfigured();
        try {
            byte[] all = Base64.getDecoder().decode(encoded);
            byte[] iv = new byte[IV_LENGTH];
            System.arraycopy(all, 0, iv, 0, IV_LENGTH);
            byte[] ciphertext = new byte[all.length - IV_LENGTH];
            System.arraycopy(all, IV_LENGTH, ciphertext, 0, ciphertext.length);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, masterKey, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo descifrar el material fiscal", e);
        }
    }

    private void requireConfigured() {
        if (!configured) {
            throw new IllegalStateException(
                    "Falta la master key fiscal (veltronik.fiscal.master-key). Configurala para usar facturación ARCA.");
        }
    }

    private static byte[] sha256(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }
}
