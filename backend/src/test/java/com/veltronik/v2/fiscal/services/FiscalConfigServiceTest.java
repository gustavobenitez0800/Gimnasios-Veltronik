package com.veltronik.v2.fiscal.services;

import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.fiscal.entities.FiscalConfig;
import com.veltronik.v2.fiscal.integration.CmsSigner;
import com.veltronik.v2.fiscal.repositories.FiscalConfigRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Tests del onboarding fiscal: las validaciones que le avisan al dueño EN EL MOMENTO de cargar
 * los datos (CUIT con dígito verificador, certificado/clave coherentes) en vez de dejar que
 * ARCA rechace después con un error indescifrable.
 */
@ExtendWith(MockitoExtension.class)
class FiscalConfigServiceTest {

    @Mock
    private FiscalConfigRepository configRepository;
    @Mock
    private CertificateCrypto crypto;
    @Mock
    private CmsSigner cmsSigner;

    private FiscalConfigService service;

    private final UUID tenantId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new FiscalConfigService(configRepository, crypto, cmsSigner);
        TenantContextHolder.setTenantId(tenantId);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private FiscalConfig givenExistingConfig() {
        FiscalConfig config = new FiscalConfig();
        when(configRepository.findByTenantId(tenantId)).thenReturn(Optional.of(config));
        return config;
    }

    // ─────────────────────────── CUIT ───────────────────────────

    @Test
    @DisplayName("CUIT válido (dígito verificador correcto) → se guarda")
    void validCuitIsAccepted() {
        FiscalConfig config = givenExistingConfig();
        when(configRepository.save(any(FiscalConfig.class))).thenAnswer(inv -> inv.getArgument(0));

        // 20-12345678-6: dígito verificador real del algoritmo módulo 11.
        service.updateForCurrentTenant(20123456786L, null, null, null, null, null);

        assertEquals(20123456786L, config.getCuit());
        verify(configRepository).save(config);
    }

    @Test
    @DisplayName("CUIT con dígito verificador incorrecto → 400 con mensaje claro (typo atrapado al cargar)")
    void invalidCheckDigitIsRejected() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.updateForCurrentTenant(20123456780L, null, null, null, null, null));

        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("dígito verificador"));
        verify(configRepository, never()).save(any());
    }

    @Test
    @DisplayName("CUIT con menos de 11 dígitos → 400")
    void shortCuitIsRejected() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.updateForCurrentTenant(123456789L, null, null, null, null, null));

        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("11 dígitos"));
    }

    @Test
    @DisplayName("update sin CUIT (patch parcial de otros campos) no valida ni toca el CUIT")
    void partialUpdateWithoutCuitSkipsValidation() {
        FiscalConfig config = givenExistingConfig();
        when(configRepository.save(any(FiscalConfig.class))).thenAnswer(inv -> inv.getArgument(0));

        service.updateForCurrentTenant(null, "Kiosco Don Pepe", null, null, 3, null);

        assertNull(config.getCuit());
        assertEquals("Kiosco Don Pepe", config.getRazonSocial());
        assertEquals(3, config.getDefaultPosNumber());
    }

    // ─────────────────────────── certificado + clave ───────────────────────────

    @Test
    @DisplayName("certificado/clave que no pasan la validación criptográfica → 400 con el motivo (no se guarda nada)")
    void invalidCertificatePairIsRejectedBeforeSaving() {
        doThrow(new IllegalArgumentException("La clave privada NO corresponde a este certificado."))
                .when(cmsSigner).validatePair(anyString(), anyString());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class,
                () -> service.uploadCredentialsForCurrentTenant("CERT-PEM", "KEY-PEM"));

        assertEquals(400, ex.getStatusCode().value());
        assertTrue(ex.getReason().contains("corresponde"));
        verify(crypto, never()).encrypt(anyString());
        verify(configRepository, never()).save(any());
    }

    @Test
    @DisplayName("certificado/clave válidos → se cifran y se guardan")
    void validCertificatePairIsEncryptedAndStored() {
        FiscalConfig config = givenExistingConfig();
        when(configRepository.save(any(FiscalConfig.class))).thenAnswer(inv -> inv.getArgument(0));
        when(crypto.encrypt("CERT-PEM")).thenReturn("enc-cert");
        when(crypto.encrypt("KEY-PEM")).thenReturn("enc-key");

        service.uploadCredentialsForCurrentTenant("CERT-PEM", "KEY-PEM");

        verify(cmsSigner).validatePair("CERT-PEM", "KEY-PEM");
        assertEquals("enc-cert", config.getCertificateEnc());
        assertEquals("enc-key", config.getPrivateKeyEnc());
    }

    @Test
    @DisplayName("upload sin certificado o sin clave → 400")
    void missingPemIsRejected() {
        assertThrows(ResponseStatusException.class,
                () -> service.uploadCredentialsForCurrentTenant("", "KEY-PEM"));
        assertThrows(ResponseStatusException.class,
                () -> service.uploadCredentialsForCurrentTenant("CERT-PEM", null));
    }
}
