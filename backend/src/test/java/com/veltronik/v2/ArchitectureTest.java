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
 * <p><b>Mandamiento #2 — Escalabilidad a prueba de balas.</b> Un vertical (gym, courts, kiosk,
 * y los que vengan) jamás debe importar clases de otro vertical: se comunican —si hace falta—
 * por el núcleo ({@code core}) y sus fachadas. Y {@code core} es la base: no puede depender de
 * ningún vertical (si lo hiciera, dejaría de ser reutilizable y todo el modelo se rompe).</p>
 */
class ArchitectureTest {

    private static final JavaClasses CLASSES = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.veltronik.v2");

    private static final String[] OTHER_THAN_KIOSK = { "..gym..", "..courts..", "..salon..", "..restaurant.." };
    private static final String[] OTHER_THAN_COURTS = { "..gym..", "..kiosk..", "..salon..", "..restaurant.." };
    private static final String[] OTHER_THAN_GYM = { "..courts..", "..kiosk..", "..salon..", "..restaurant.." };

    @Test
    void kiosk_no_depende_de_otras_verticales() {
        noClasses().that().resideInAPackage("..kiosk..")
                .should().dependOnClassesThat().resideInAnyPackage(OTHER_THAN_KIOSK)
                .because("el vertical Kiosco debe ser autónomo: se apoya solo en core")
                .check(CLASSES);
    }

    @Test
    void courts_no_depende_de_otras_verticales() {
        noClasses().that().resideInAPackage("..courts..")
                .should().dependOnClassesThat().resideInAnyPackage(OTHER_THAN_COURTS)
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
                .should().dependOnClassesThat().resideInAnyPackage("..gym..", "..courts..", "..kiosk..", "..salon..", "..restaurant..", "..fiscal..")
                .because("core es la base reutilizable: nada del dominio de un vertical puede filtrarse a core")
                .check(CLASSES);
    }

    @Test
    void fiscal_no_depende_de_verticales() {
        noClasses().that().resideInAPackage("..fiscal..")
                .should().dependOnClassesThat().resideInAnyPackage("..gym..", "..courts..", "..kiosk..", "..salon..", "..restaurant..")
                .because("fiscal es un módulo COMPARTIDO (por debajo de las verticales): las verticales lo usan, no al revés")
                .check(CLASSES);
    }

    @Test
    void sync_no_depende_de_verticales() {
        noClasses().that().resideInAPackage("..sync..")
                .should().dependOnClassesThat().resideInAnyPackage("..gym..", "..courts..", "..kiosk..", "..salon..", "..restaurant..", "..fiscal..")
                .because("el sync engine es GENÉRICO a nivel fila: conoce nombres de tablas (SyncTableRegistry), jamás clases de dominio de un vertical")
                .check(CLASSES);
    }

    @Test
    void verticales_no_dependen_de_sync() {
        noClasses().that().resideInAnyPackage("..gym..", "..courts..", "..kiosk..", "..salon..", "..restaurant..", "..fiscal..")
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
     * Nota: @Value en campo queda permitido por ahora — hay ~17 usos legados; migrarlos es limpieza aparte.
     */
    @Test
    void prohibida_inyeccion_por_campo_con_autowired() {
        noFields().should().beAnnotatedWith("org.springframework.beans.factory.annotation.Autowired")
                .because("la inyección va por constructor (@RequiredArgsConstructor): explícita, final y testeable")
                .check(CLASSES);
    }
}
