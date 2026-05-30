package com.veltronik.v2;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@Slf4j
public class VeltronikApplication {

    public static void main(String[] args) {
        // Esta línea enciende el servidor interno (Tomcat) y carga toda la arquitectura
        SpringApplication.run(VeltronikApplication.class, args);
        log.info("=================================================");
        log.info("  ✅ VELTRONIK V2 BACKEND — INICIADO CORRECTAMENTE");
        log.info("=================================================");
    }

}
