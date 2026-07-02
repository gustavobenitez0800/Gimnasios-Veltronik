package com.veltronik.v2.sync;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

/** Un cambio del outbox local viajando a la nube (protocolo genérico a nivel fila, ADR-010). */
@Data
public class SyncChange {

    /** Nombre físico de la tabla — validado contra el SyncTableRegistry (whitelist). */
    @NotBlank
    private String table;

    /** v1: solo INSERT (eventos append-only). */
    @NotBlank
    private String op;

    /** El id de la fila (UUID generado en el dispositivo — la clave de la idempotencia). */
    @NotNull
    private UUID rowId;

    /** La fila exacta, tal como la capturó el trigger (to_jsonb(NEW)). */
    @NotNull
    private JsonNode row;
}
