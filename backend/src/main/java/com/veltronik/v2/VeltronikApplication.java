package com.veltronik.v2;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableScheduling
@Slf4j
public class VeltronikApplication {

    /**
     * Zona horaria del negocio (Argentina). Se fija como zona por defecto de la JVM ANTES
     * de arrancar Spring, para que TODO cálculo de fecha/hora del backend
     * ({@code LocalDate/LocalDateTime.now()}, {@code @CreationTimestamp}, los crons, etc.)
     * use la hora de pared de Argentina y no la del servidor (Railway corre en UTC).
     *
     * <p><b>Por qué acá:</b> las fechas del dominio se guardan SIN zona
     * ({@code timestamp without time zone}) representando hora AR. Si la JVM corre en UTC,
     * el límite de día/mes se corre hasta 3 h: p. ej. "Ingresos del Mes" daba $0 entre las
     * 21:00 y 23:59 del último día del mes, y los accesos de la noche quedaban con la fecha
     * del día siguiente. Fijar la zona acá alinea el runtime con el dominio de una sola vez
     * (defensa de raíz); el Dockerfile además pasa {@code -Duser.timezone} como respaldo.
     * Se usa el id IANA (no un offset fijo {@code -03:00}) para respetar reglas de DST.</p>
     */
    private static final String BUSINESS_TZ = "America/Argentina/Buenos_Aires";

    public static void main(String[] args) {
        // DEBE ejecutarse antes de SpringApplication.run y antes de cachear cualquier hora.
        TimeZone.setDefault(TimeZone.getTimeZone(BUSINESS_TZ));

        // Esta línea enciende el servidor interno (Tomcat) y carga toda la arquitectura
        SpringApplication.run(VeltronikApplication.class, args);
        log.info("=================================================");
        log.info("VELTRONIK V2 BACKEND — INICIADO CORRECTAMENTE");
        log.info("Zona horaria por defecto: {}", TimeZone.getDefault().getID());
        log.info("=================================================");
    }

}
