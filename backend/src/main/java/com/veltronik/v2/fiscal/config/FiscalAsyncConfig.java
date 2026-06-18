package com.veltronik.v2.fiscal.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Pool dedicado para emitir comprobantes a ARCA fuera del hilo de la venta: el POS responde al
 * instante y la facturación (round-trip a ARCA) corre acá. Cola acotada para no acumular sin límite.
 * ({@code @EnableAsync} ya está habilitado a nivel app.)
 */
@Configuration
public class FiscalAsyncConfig {

    @Bean(name = "fiscalEmissionExecutor")
    public Executor fiscalEmissionExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(5);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("fiscal-emit-");
        executor.initialize();
        return executor;
    }
}
