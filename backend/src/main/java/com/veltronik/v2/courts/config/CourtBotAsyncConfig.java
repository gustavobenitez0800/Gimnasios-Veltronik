package com.veltronik.v2.courts.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Pool dedicado para procesar mensajes del bot fuera del hilo del webhook: así el
 * webhook le responde 200 a Meta al instante (Meta reintenta si tarda) y el trabajo
 * pesado (Gemini + WhatsApp) corre acá. Cola acotada para no acumular trabajo sin límite.
 */
@Configuration
@EnableAsync
public class CourtBotAsyncConfig {

    @Bean(name = "botExecutor")
    public Executor botExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("court-bot-");
        executor.initialize();
        return executor;
    }
}
