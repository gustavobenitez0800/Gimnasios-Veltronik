package com.veltronik.v2.fiscal.integration;

/**
 * Falla de comunicación o protocolo con ARCA (red, HTTP no-2xx, fault de WSAA, firma, parseo).
 *
 * <p>La distingue de un RECHAZO de negocio (Resultado=R de WSFE, con observaciones): esa no es
 * una excepción, es un resultado. Esta excepción representa "no pudimos hablar con ARCA" → el
 * orquestador la traduce a CONTINGENCY y el cron reintenta.</p>
 */
public class ArcaException extends RuntimeException {
    public ArcaException(String message) {
        super(message);
    }

    public ArcaException(String message, Throwable cause) {
        super(message, cause);
    }
}
