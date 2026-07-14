package com.veltronik.v2.fiscal.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.fiscal.entities.FiscalCondicionIva;
import com.veltronik.v2.fiscal.entities.FiscalConfig;
import com.veltronik.v2.fiscal.entities.FiscalEnvironment;
import com.veltronik.v2.fiscal.integration.CmsSigner;
import com.veltronik.v2.fiscal.integration.CsrGenerator;
import com.veltronik.v2.fiscal.integration.FiscalCredentials;
import com.veltronik.v2.fiscal.repositories.FiscalConfigRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.UUID;

/**
 * Configuración fiscal del tenant: identidad ARCA + credenciales cifradas. Único lugar que descifra
 * el certificado (vía {@link CertificateCrypto}) y arma las {@link FiscalCredentials} para el cliente
 * ARCA. Alta cohesión: todo lo de "cómo está parado el tenant ante ARCA" vive acá.
 */
@Service
public class FiscalConfigService {

    private final FiscalConfigRepository configRepository;
    private final CertificateCrypto crypto;
    private final CmsSigner cmsSigner;
    private final CsrGenerator csrGenerator;

    public FiscalConfigService(FiscalConfigRepository configRepository, CertificateCrypto crypto,
                               CmsSigner cmsSigner, CsrGenerator csrGenerator) {
        this.configRepository = configRepository;
        this.crypto = crypto;
        this.cmsSigner = cmsSigner;
        this.csrGenerator = csrGenerator;
    }

    // SIN @Transactional a propósito (idempotente y a prueba de carrera): el get-or-create lazy
    // puede coincidir con otra request; con una sola tx el choque del unique tenant_id la envenena
    // y no se puede releer. Cada op de repo en su propia tx → el catch+reread funciona, sin 409.
    public FiscalConfig getOrCreateForCurrentTenant() {
        UUID tenantId = TenantContextHolder.getTenantId();
        return configRepository.findByTenantId(tenantId).orElseGet(() -> createDefault(tenantId));
    }

    private FiscalConfig createDefault(UUID tenantId) {
        try {
            FiscalConfig c = new FiscalConfig();
            Tenant tenant = new Tenant();
            tenant.setId(tenantId);
            c.setTenant(tenant);
            return configRepository.saveAndFlush(c);
        } catch (DataIntegrityViolationException race) {
            return configRepository.findByTenantId(tenantId).orElseThrow(() -> race);
        }
    }

    public Optional<FiscalConfig> findByTenantId(UUID tenantId) {
        return configRepository.findByTenantId(tenantId);
    }

    /** La config del tenant lista para emitir, o 409 con el motivo si falta algo. */
    public FiscalConfig requireEnabledForCurrentTenant() {
        FiscalConfig c = configRepository.findByTenantId(TenantContextHolder.getTenantId())
                .orElseThrow(() -> notReady("No hay configuración fiscal. Cargá tu CUIT y certificado de ARCA."));
        return requireComplete(c);
    }

    /** Descifra cert+key y arma las credenciales (solo viven en memoria durante la llamada). */
    public FiscalCredentials buildCredentials(FiscalConfig config) {
        requireComplete(config);
        return new FiscalCredentials(
                config.getCuit(),
                crypto.decrypt(config.getCertificateEnc()),
                crypto.decrypt(config.getPrivateKeyEnc()),
                config.getEnvironment());
    }

    public FiscalConfig updateForCurrentTenant(Long cuit, String razonSocial, FiscalCondicionIva condicionIva,
                                               FiscalEnvironment environment, Integer defaultPosNumber, Boolean enabled) {
        if (cuit != null) validateCuit(cuit);
        FiscalConfig c = getOrCreateForCurrentTenant();
        if (cuit != null) c.setCuit(cuit);
        if (razonSocial != null) c.setRazonSocial(razonSocial);
        if (condicionIva != null) c.setCondicionIva(condicionIva);
        if (environment != null) c.setEnvironment(environment);
        if (defaultPosNumber != null) c.setDefaultPosNumber(defaultPosNumber);
        if (enabled != null) c.setEnabled(enabled);
        return configRepository.save(c);
    }

    /**
     * Genera el par de claves + el CSR para tramitar el certificado en ARCA (onboarding self-service:
     * el cliente no toca openssl ni maneja la clave privada). Guarda la clave CIFRADA y borra el
     * certificado anterior (la clave cambió → el cert viejo ya no corresponde). Devuelve el CSR (PEM)
     * para que el cliente lo descargue y lo suba a ARCA. Requiere CUIT + razón social ya guardados.
     */
    public String generateCsrForCurrentTenant(String commonName) {
        FiscalConfig c = getOrCreateForCurrentTenant();
        if (c.getCuit() == null) throw notReady("Cargá y guardá tu CUIT antes de generar el certificado.");
        if (c.getRazonSocial() == null || c.getRazonSocial().isBlank()) {
            throw notReady("Cargá y guardá tu razón social antes de generar el certificado.");
        }
        String cn = (commonName == null || commonName.isBlank()) ? "veltronik" : commonName.trim();
        CsrGenerator.GeneratedCsr generated = csrGenerator.generate(c.getCuit(), c.getRazonSocial(), cn);
        c.setPrivateKeyEnc(crypto.encrypt(generated.privateKeyPem()));
        c.setCertificateEnc(null); // clave nueva → el certificado anterior deja de ser válido
        configRepository.save(c);
        return generated.csrPem();
    }

    /**
     * Guarda el certificado (CIFRADO). La clave privada es OPCIONAL:
     * - flujo del generador de CSR → llega null y se usa la clave ya guardada;
     * - flujo avanzado → llega el PEM de la clave (se pegan cert + clave).
     * En ambos casos se valida que el cert sea vigente y PAREJA de la clave antes de guardar.
     */
    public FiscalConfig uploadCredentialsForCurrentTenant(String certificatePem, String privateKeyPem) {
        if (certificatePem == null || certificatePem.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Falta el certificado");
        }
        FiscalConfig c = getOrCreateForCurrentTenant();
        String cert = certificatePem.trim();
        boolean keyProvided = privateKeyPem != null && !privateKeyPem.isBlank();
        String key;
        if (keyProvided) {
            key = privateKeyPem.trim();                     // avanzado: cert + clave pegados
        } else if (c.getPrivateKeyEnc() != null) {
            key = crypto.decrypt(c.getPrivateKeyEnc());     // generador de CSR: la clave ya está guardada
        } else {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Primero generá el certificado (CSR) o pegá también la clave privada.");
        }
        // Validación al cargar (onboarding sin sorpresas): PEM parseable, cert vigente y PAREJA de la
        // clave. El error sale acá con mensaje claro, no días después como un SOAP fault de ARCA.
        try {
            cmsSigner.validatePair(cert, key);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        c.setCertificateEnc(crypto.encrypt(cert));
        if (keyProvided) c.setPrivateKeyEnc(crypto.encrypt(key));
        return configRepository.save(c);
    }

    /**
     * Valida el CUIT con su dígito verificador (módulo 11, pesos 5-4-3-2-7-6-5-4-3-2).
     * Atrapa los typos al CARGAR el dato; sin esto, un CUIT mal tipeado recién explotaba
     * al emitir, con un rechazo de ARCA imposible de interpretar para el dueño.
     * Mapeo permisivo (11→0, 10→9): jamás rechaza un CUIT real.
     */
    private void validateCuit(long cuit) {
        String digits = String.valueOf(cuit);
        if (digits.length() != 11) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El CUIT debe tener 11 dígitos (sin guiones). Revisalo y volvé a intentar.");
        }
        int[] weights = {5, 4, 3, 2, 7, 6, 5, 4, 3, 2};
        int sum = 0;
        for (int i = 0; i < 10; i++) {
            sum += (digits.charAt(i) - '0') * weights[i];
        }
        int dv = 11 - (sum % 11);
        if (dv == 11) dv = 0;
        if (dv == 10) dv = 9;
        if (dv != digits.charAt(10) - '0') {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El CUIT no es válido (el dígito verificador no coincide). Revisalo y volvé a intentar.");
        }
    }

    private FiscalConfig requireComplete(FiscalConfig c) {
        if (!c.isEnabled()) throw notReady("La facturación ARCA está desactivada para este negocio.");
        if (c.getCuit() == null) throw notReady("Falta el CUIT.");
        if (c.getCondicionIva() == null) throw notReady("Falta la condición frente al IVA.");
        if (c.getDefaultPosNumber() == null) throw notReady("Falta el punto de venta.");
        if (c.getCertificateEnc() == null || c.getPrivateKeyEnc() == null) throw notReady("Falta el certificado de ARCA.");
        return c;
    }

    private ResponseStatusException notReady(String msg) {
        return new ResponseStatusException(HttpStatus.CONFLICT, msg);
    }
}
