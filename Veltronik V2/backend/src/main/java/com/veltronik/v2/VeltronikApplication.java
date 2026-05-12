package com.veltronik.v2;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class VeltronikApplication {

    public static void main(String[] args) {
        // Esta línea enciende el servidor interno (Tomcat) y carga toda la arquitectura
        SpringApplication.run(VeltronikApplication.class, args);
        System.out.println(" ¡Veltronik V2 Backend ha iniciado correctamente! ");
    }

}
