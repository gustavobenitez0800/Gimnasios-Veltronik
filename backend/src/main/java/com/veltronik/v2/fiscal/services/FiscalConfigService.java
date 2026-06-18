package com.veltronik.v2.fiscal.services;

import com.veltronik.v2.core.entities.Tenant;
import com.veltronik.v2.core.security.TenantContextHolder;
import com.veltronik.v2.fiscal.entities.FiscalCondicionIva;
import com.veltronik.v2.fiscal.entities.FiscalConfig;
import com.veltronik.v2.fiscal.entities.FiscalEnvironment;
import com.veltronik.v2.fiscal.integration.FiscalCredentials;
import com.veltronik.v2.fiscal.repositories.FiscalConfigRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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

    public FiscalConfigService(FiscalConfigRepository configRepository, CertificateCrypto crypto) {
        this.configRepository = configRepository;
        this.crypto = crypto;
    }

    @Transactional
    public FiscalConfig getOrCreateForCurrentTenant() {
        UUID tenantId = TenantContextHolder.getTenantId();
        return configRepository.findByTenantId(tenantId).orElseGet(() -> {
            FiscalConfig c = new FiscalConfig();
            Tenant tenant = new Tenant();
            tenant.setId(tenantId);
            c.setTenant(tenant);
            return configRepository.save(c);
        });
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

    @Transactional
    public FiscalConfig updateForCurrentTenant(Long cuit, String razonSocial, FiscalCondicionIva condicionIva,
                                               FiscalEnvironment environment, Integer defaultPosNumber, Boolean enabled) {
        FiscalConfig c = getOrCreateForCurrentTenant();
        if (cuit != null) c.setCuit(cuit);
        if (razonSocial != null) c.setRazonSocial(razonSocial);
        if (condicionIva != null) c.setCondicionIva(condicionIva);
        if (environment != null) c.setEnvironment(environment);
        if (defaultPosNumber != null) c.setDefaultPosNumber(defaultPosNumber);
        if (enabled != null) c.setEnabled(enabled);
        return configRepository.save(c);
    }

    /** Guarda el certificado + clave CIFRADOS. Reciben el PEM en claro; nunca se persiste en claro. */
    @Transactional
    public FiscalConfig uploadCredentialsForCurrentTenant(String certificatePem, String privateKeyPem) {
        if (certificatePem == null || certificatePem.isBlank() || privateKeyPem == null || privateKeyPem.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Falta el certificado o la clave privada");
        }
        FiscalConfig c = getOrCreateForCurrentTenant();
        c.setCertificateEnc(crypto.encrypt(certificatePem.trim()));
        c.setPrivateKeyEnc(crypto.encrypt(privateKeyPem.trim()));
        return configRepository.save(c);
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
