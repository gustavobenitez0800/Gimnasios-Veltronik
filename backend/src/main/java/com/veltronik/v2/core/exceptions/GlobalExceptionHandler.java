package com.veltronik.v2.core.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.stream.Collectors;

/**
 * Manejador central de excepciones → respuesta JSON estandarizada ({@link ErrorResponse}).
 *
 * <p><b>Jerarquía (de específico a genérico):</b></p>
 * <ul>
 *   <li>{@link ResponseStatusException} → el status que trae (403, 404, 401…).</li>
 *   <li>{@link EntityNotFoundException} → 404.</li>
 *   <li>{@link BusinessException} → 400 con el mensaje (regla de negocio, se muestra al usuario).</li>
 *   <li>{@link MethodArgumentNotValidException} → 400 con los errores de validación de los DTOs.</li>
 *   <li>{@link Exception} (incluye cualquier {@link RuntimeException} no clasificado) → 500
 *       con mensaje genérico (un bug NO debe filtrar internals ni disfrazarse de 400).</li>
 * </ul>
 */
@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatusException(ResponseStatusException ex, HttpServletRequest request) {
        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                ex.getStatusCode().value(),
                ex.getStatusCode().toString(),
                ex.getReason() != null ? ex.getReason() : ex.getMessage(),
                request.getRequestURI()
        );
        return new ResponseEntity<>(errorResponse, ex.getStatusCode());
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleEntityNotFound(EntityNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), request);
    }

    /** Regla de negocio inválida → 400 con el mensaje (lo muestra el frontend). */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ErrorResponse> handleBusiness(BusinessException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, ex.getMessage(), request);
    }

    /** Validación de los DTOs de entrada (@Valid) → 400 con el detalle de los campos. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(this::fieldMessage)
                .collect(Collectors.joining(". "));
        return build(HttpStatus.BAD_REQUEST, detail.isBlank() ? "Datos inválidos." : detail, request);
    }

    /** Cuerpo del request ilegible / JSON mal formado → 400 (error de cliente, no de servidor). */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ErrorResponse> handleNotReadable(HttpMessageNotReadableException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, "El cuerpo de la solicitud es inválido o está mal formado.", request);
    }

    /** Parámetro de tipo incorrecto (ej. un id que no es UUID) → 400. */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex, HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, "Parámetro inválido: " + ex.getName(), request);
    }

    /** Cualquier otra excepción (incluye RuntimeException no clasificado) → 500 genérico + log. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGlobalException(Exception ex, HttpServletRequest request) {
        logger.error("Excepción no controlada en {}: ", request.getRequestURI(), ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "Ha ocurrido un error inesperado en el servidor.", request);
    }

    private String fieldMessage(FieldError fe) {
        return (fe.getDefaultMessage() != null && !fe.getDefaultMessage().isBlank())
                ? fe.getDefaultMessage()
                : (fe.getField() + " inválido");
    }

    private ResponseEntity<ErrorResponse> build(HttpStatus status, String message, HttpServletRequest request) {
        ErrorResponse body = new ErrorResponse(
                LocalDateTime.now(),
                status.value(),
                status.getReasonPhrase(),
                message,
                request.getRequestURI()
        );
        return new ResponseEntity<>(body, status);
    }
}
