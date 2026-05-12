package com.veltronik.v2.core.exceptions;

/**
 * Excepción lanzada cuando no se encuentra una entidad en la base de datos.
 * Es atrapada automáticamente por {@link GlobalExceptionHandler} y devuelta
 * al frontend como un JSON estandarizado con HTTP 404.
 */
public class EntityNotFoundException extends RuntimeException {

    public EntityNotFoundException(String entityName, Object id) {
        super(String.format("No se encontró %s con ID: %s", entityName, id));
    }
}
