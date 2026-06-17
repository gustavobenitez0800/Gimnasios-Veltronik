package com.veltronik.v2;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

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
                .should().dependOnClassesThat().resideInAnyPackage("..gym..", "..courts..", "..kiosk..", "..salon..", "..restaurant..")
                .because("core es la base reutilizable: nada del dominio de un vertical puede filtrarse a core")
                .check(CLASSES);
    }
}
