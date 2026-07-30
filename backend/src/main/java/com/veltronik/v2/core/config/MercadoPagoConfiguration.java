package com.veltronik.v2.core.config;

import com.mercadopago.MercadoPagoConfig;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;

/**
 * Le pasa el access token al SDK de Mercado Pago, que lo guarda en una variable estática.
 *
 * <p>Este es el ÚNICO lugar donde se llama a {@code setAccessToken}: hacerlo desde varios
 * {@code @PostConstruct} distintos era una carrera (gana el último en arrancar).</p>
 */
@Configuration
@RequiredArgsConstructor
public class MercadoPagoConfiguration {

    private final MercadoPagoProperties mercadoPago;

    @PostConstruct
    public void init() {
        if (mercadoPago.hasAccessToken()) {
            MercadoPagoConfig.setAccessToken(mercadoPago.getAccessToken());
        }
    }
}
