package com.veltronik.v2.fiscal.entities;

/**
 * Entorno de ARCA contra el que opera el tenant. Cada uno tiene endpoints distintos de WSAA/WSFEv1.
 */
public enum FiscalEnvironment {
    /** Testing de ARCA (wswhomo.arca.gob.ar). Para probar sin emitir comprobantes reales. */
    HOMOLOGACION,
    /** Producción (servicios1.arca.gob.ar). Comprobantes con validez fiscal. */
    PRODUCCION
}
