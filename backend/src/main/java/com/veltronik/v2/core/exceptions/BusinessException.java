package com.veltronik.v2.core.exceptions;

/**
 * Error de REGLA DE NEGOCIO / validación de dominio: la operación es inválida por las reglas
 * del sistema, NO por un fallo del servidor. Lo atrapa {@link GlobalExceptionHandler} y lo
 * devuelve como HTTP 400 con el mensaje, para que el frontend lo muestre tal cual.
 *
 * <p>Distinto de:</p>
 * <ul>
 *   <li>un {@link RuntimeException} cualquiera → bug inesperado → 500 (mensaje genérico);</li>
 *   <li>{@link EntityNotFoundException} → 404;</li>
 *   <li>{@code ResponseStatusException(FORBIDDEN)} → 403.</li>
 * </ul>
 *
 * <p>Antes estos errores se tiraban como {@code RuntimeException} y el handler los mapeaba a
 * 400 — lo que TAMBIÉN convertía cualquier bug (NPE, etc.) en un falso 400. Separar la regla de
 * negocio del fallo inesperado permite que el 500 vuelva a significar "error del servidor".</p>
 */
public class BusinessException extends RuntimeException {
    public BusinessException(String message) {
        super(message);
    }
}
