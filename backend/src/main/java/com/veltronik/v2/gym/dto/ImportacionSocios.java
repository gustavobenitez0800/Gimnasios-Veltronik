package com.veltronik.v2.gym.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * El contrato del importador de socios, en los dos sentidos.
 *
 * <p>La pantalla lee el Excel en el navegador y manda las filas ya separadas por columna,
 * con los valores <b>como texto, tal cual estaban en la celda</b>. Interpretarlos —qué es una
 * fecha, qué es un documento, qué significa "Baja"— es trabajo del backend, que es el único
 * que decide qué entra a la base. La pantalla nunca "arregla" un dato antes de mandarlo.</p>
 */
public final class ImportacionSocios {

    private ImportacionSocios() {
    }

    /**
     * Una fila del archivo. {@code fila} es el número de fila del Excel, para que el error diga
     * "fila 47" y la persona vaya derecho a esa fila. Una celda vacía no borra nada.
     */
    public record Fila(
            Integer fila,
            String nombre,
            String apellido,
            String documento,
            String telefono,
            String email,
            String nacimiento,
            String alta,
            String vencimiento,
            String arancel,
            String estado,
            String notas,
            String direccion,
            String contactoEmergencia,
            String telefonoEmergencia,
            String genero) {
    }

    public record Pedido(String archivo, List<Fila> filas) {
    }

    public enum Accion {
        /** No existe en Veltronik: se da de alta. */
        CREAR,
        /** Ya existe (mismo documento) y el archivo trae algo distinto. */
        ACTUALIZAR,
        /** Ya existe y el archivo no cambia nada. Reimportar el mismo archivo da todo esto. */
        SIN_CAMBIOS,
        /** No se puede importar tal como está. Frena la importación entera. */
        ERROR
    }

    /**
     * Qué va a pasar con una fila. {@code errores} frena todo; {@code avisos} se importa igual
     * pero conviene mirarlo; {@code cambios} dice qué se le va a modificar a un socio existente.
     */
    public record FilaAnalizada(
            int fila,
            String nombre,
            String documento,
            Accion accion,
            List<String> errores,
            List<String> avisos,
            List<String> cambios) {
    }

    public record Analisis(
            int total,
            int crear,
            int actualizar,
            int sinCambios,
            int conError,
            int conAviso,
            List<String> avisosGenerales,
            List<FilaAnalizada> filas) {

        public boolean sePuedeImportar() {
            return conError == 0 && (crear + actualizar) > 0;
        }
    }

    /** Lo que quedó escrito. {@code importacionId} es null si no había nada para cambiar. */
    public record Resultado(UUID importacionId, int creados, int actualizados, int sinCambios) {
    }

    /** La última importación del gimnasio, para ofrecer deshacerla. */
    public record Ultima(
            UUID id,
            LocalDateTime cuando,
            String archivo,
            int creados,
            int actualizados,
            boolean deshecha,
            boolean sePuedeDeshacer,
            String porQueNo) {
    }
}
