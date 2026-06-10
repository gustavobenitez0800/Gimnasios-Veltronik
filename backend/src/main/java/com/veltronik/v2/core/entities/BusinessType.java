package com.veltronik.v2.core.entities;

/**
 * Tipos de negocio (verticales) soportados por Veltronik.
 *
 * Para agregar un rubro nuevo en el futuro (ej: Canchas, Ferreterías),
 * simplemente se agrega un valor nuevo a este Enum y se crea su
 * módulo correspondiente en un paquete separado.
 */
public enum BusinessType {
    GYM,

    /**
     * Canchas de Fútbol 5 (vertical de reservas). Usa el módulo genérico {@code courts}:
     * cuando se sume Pádel se agrega PADEL acá y se reutiliza el mismo módulo con otra
     * configuración (duración de slot, jerga del bot), sin duplicar código.
     */
    FUTBOL_5
}
