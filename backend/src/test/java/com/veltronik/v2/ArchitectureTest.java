package com.veltronik.v2;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noFields;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING;

/**
 * Reglas de arquitectura "a prueba de juniors" (Codex §5.1): se compilan como tests, así que
 * si alguien acopla dos verticales el build se pone en rojo automáticamente.
 *
 * <p><b>Mandamiento #2 — Escalabilidad a prueba de balas.</b> Un vertical (gym, kiosk,
 * y los que vengan) jamás debe importar clases de otro vertical: se comunican —si hace falta—
 * por el núcleo ({@code core}) y sus fachadas. Y {@code core} es la base: no puede depender de
 * ningún vertical (si lo hiciera, dejaría de ser reutilizable y todo el modelo se rompe).</p>
 */
class ArchitectureTest {

    private static final JavaClasses CLASSES = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.veltronik.v2");

    // Los paquetes "salon"/"restaurant" no existen todavía: las reglas ya los cubren
    // para que el día que nazcan arranquen con los límites puestos.
    private static final String[] OTHER_THAN_KIOSK = { "..gym..", "..salon..", "..restaurant.." };
    private static final String[] OTHER_THAN_GYM = { "..kiosk..", "..salon..", "..restaurant.." };

    @Test
    void kiosk_no_depende_de_otras_verticales() {
        noClasses().that().resideInAPackage("..kiosk..")
                .should().dependOnClassesThat().resideInAnyPackage(OTHER_THAN_KIOSK)
                .because("el vertical Kiosco debe ser autónomo: se apoya solo en core")
                .check(CLASSES);
    }

    @Test
    void gym_no_depende_de_otras_verticales() {
        noClasses().that().resideInAPackage("..gym..")
                .should().dependOnClassesThat().resideInAnyPackage(OTHER_THAN_GYM)
                .check(CLASSES);
    }

    @Test
    void core_no_depende_de_ningun_vertical() {
        noClasses().that().resideInAPackage("..core..")
                .should().dependOnClassesThat().resideInAnyPackage("..gym..", "..kiosk..", "..salon..", "..restaurant..", "..fiscal..")
                .because("core es la base reutilizable: nada del dominio de un vertical puede filtrarse a core")
                .check(CLASSES);
    }

    @Test
    void fiscal_no_depende_de_verticales() {
        noClasses().that().resideInAPackage("..fiscal..")
                .should().dependOnClassesThat().resideInAnyPackage("..gym..", "..kiosk..", "..salon..", "..restaurant..")
                .because("fiscal es un módulo COMPARTIDO (por debajo de las verticales): las verticales lo usan, no al revés")
                .check(CLASSES);
    }

    @Test
    void sync_no_depende_de_verticales() {
        noClasses().that().resideInAPackage("..sync..")
                .should().dependOnClassesThat().resideInAnyPackage("..gym..", "..kiosk..", "..salon..", "..restaurant..", "..fiscal..")
                .because("el sync engine es GENÉRICO a nivel fila: conoce nombres de tablas (SyncTableRegistry), jamás clases de dominio de un vertical")
                .check(CLASSES);
    }

    @Test
    void verticales_no_dependen_de_sync() {
        noClasses().that().resideInAnyPackage("..gym..", "..kiosk..", "..salon..", "..restaurant..", "..fiscal..")
                .should().dependOnClassesThat().resideInAPackage("..sync..")
                .because("los verticales no saben que existe la sincronización: escriben su dominio y los triggers capturan")
                .check(CLASSES);
    }

    // ------------------------------------------------------------------
    // Higiene (Fase 0, ARCHITECTURE.md §Reglas innegociables): "limpio no
    // es el proyecto que se limpia, es el que no se puede ensuciar".
    // ------------------------------------------------------------------

    /** Regla #7 del ARCHITECTURE.md: prohibido System.out/System.err y printStackTrace — logging solo por logger. */
    @Test
    void prohibido_system_out_y_printStackTrace() {
        NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS
                .because("logging solo por SLF4J (@Slf4j): System.out no llega a los logs de Railway ni a Mission Control")
                .check(CLASSES);
    }

    /** java.util.logging esquiva la configuración de Logback: todo por SLF4J. */
    @Test
    void prohibido_java_util_logging() {
        NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING
                .because("el stack de logging es SLF4J/Logback; java.util.logging no respeta esa configuración")
                .check(CLASSES);
    }

    /**
     * Inyección por constructor, nunca @Autowired en campos: dependencias explícitas,
     * finales y testeables sin reflection. (Idioma del proyecto: Lombok @RequiredArgsConstructor.)
     */
    @Test
    void prohibida_inyeccion_por_campo_con_autowired() {
        noFields().should().beAnnotatedWith("org.springframework.beans.factory.annotation.Autowired")
                .because("la inyección va por constructor (@RequiredArgsConstructor): explícita, final y testeable")
                .check(CLASSES);
    }

    /**
     * Lo mismo para la configuración: {@code @Value} va en el PARÁMETRO del constructor (o del
     * método {@code @Bean}), nunca en un campo.
     *
     * <p>No es cosmético. Con @Value en campo, el valor se inyecta DESPUÉS de construir el objeto:
     * el campo no puede ser final y está en null durante el constructor. Peor, invita a que cada
     * clase lea la misma propiedad por su cuenta con su propio valor por defecto — así llegamos a
     * tener el precio mensual escrito en tres clases distintas. Con la propiedad en el constructor,
     * el compilador obliga a pasar por un bean de configuración compartido
     * ({@link com.veltronik.v2.core.config.BillingProperties},
     * {@link com.veltronik.v2.core.config.MercadoPagoProperties}).</p>
     *
     * <p>Esta regla se pudo activar recién en la etapa 2.6, cuando se migraron los 10 campos que
     * quedaban. Si alguien vuelve a escribir uno, el build se pone en rojo.</p>
     */
    @Test
    void prohibida_configuracion_por_campo_con_value() {
        noFields().should().beAnnotatedWith("org.springframework.beans.factory.annotation.Value")
                .because("la configuración entra por el constructor: campos finales y un solo lugar por propiedad")
                .check(CLASSES);
    }
}
