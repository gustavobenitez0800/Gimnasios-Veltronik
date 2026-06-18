package com.veltronik.v2.fiscal.integration;

import com.veltronik.v2.fiscal.entities.FiscalEnvironment;

/**
 * Credenciales de un tenant para hablar con ARCA. Value object inmutable: desacopla el cliente
 * ARCA de la entidad {@code FiscalConfig} (el cliente no sabe de JPA ni de cifrado).
 *
 * <p>El {@code certificatePem}/{@code privateKeyPem} llegan ya DESCIFRADOS y solo viven en memoria
 * durante la llamada.</p>
 */
public record FiscalCredentials(
        long cuit,
        String certificatePem,
        String privateKeyPem,
        FiscalEnvironment environment
) {}
