package com.veltronik.v2.core.entities;

/**
 * Tipos de negocio (verticales) soportados por Veltronik.
 *
 * Para agregar un rubro nuevo en el futuro (ej: Peluquerías, Ferreterías),
 * simplemente se agrega un valor nuevo a este Enum y se crea su
 * módulo correspondiente en un paquete separado.
 */
public enum BusinessType {
    GYM,

    /**
     * Kiosco / Almacén (vertical de retail transaccional). Usa el módulo genérico {@code kiosk}:
     * sirve a Kiosco, Maxikiosco, Almacén, Despensa o Drugstore con solo cambiar la
     * configuración del tenant. La facturación ARCA vive en el módulo compartido {@code fiscal}.
     */
    KIOSCO
}
