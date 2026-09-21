package com.veltronik.v2.gym.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * El contrato del importador de historial de caja, en los dos sentidos.
 *
 * <p>Igual que el de socios: la pantalla lee el Excel y manda cada celda <b>como texto, tal
 * cual estaba</b>. Qué es una fecha, un monto o un medio de pago lo decide el backend.</p>
 */
public final class ImportacionCaja {

    private ImportacionCaja() {
    }

    /**
     * Un movimiento del archivo. {@code fila} es el número de fila del Excel, para que el error
     * diga "fila 47". Un monto negativo es un gasto.
     */
    public record Fila(
            Integer fila,
            String fecha,
            String hora,
            String socio,
            String documento,
            String concepto,
            String medio,
            String monto,
            String nota,
            String detalle) {
    }

    public record Pedido(String archivo, List<Fila> filas) {
    }

    public enum Accion {
        /** Un cobro: suma en los ingresos. */
        COBRO,
        /** Un gasto: va a los egresos, no a los ingresos. */
        GASTO,
        /** Esta misma fila ya se importó antes. Reimportar el mismo archivo da todo esto. */
        YA_IMPORTADO,
        /** El mismo socio ya pagó ese monto ese día EN VELTRONIK: importarlo lo contaría dos veces. */
        YA_COBRADO,
        /** No se puede importar tal como está. Frena la importación entera. */
        ERROR
    }

    /** Qué pasa con una fila. Solo viajan las que tienen algo para mirar (errores o avisos). */
    public record FilaAnalizada(
            int fila,
            String fecha,
            String socio,
            String documento,
            String monto,
            Accion accion,
            List<String> errores,
            List<String> avisos) {
    }

    /** Lo que entra, mes por mes: lo que el tablero va a mostrar. {@code mes} = "2026-01". */
    public record Mes(String mes, int cobros, BigDecimal totalCobros, int gastos, BigDecimal totalGastos) {
    }

    public record Analisis(
            int total,
            int cobros,
            int gastos,
            int yaImportados,
            int yaCobrados,
            int conError,
            BigDecimal totalCobros,
            BigDecimal totalGastos,
            /* cobros que quedan atados a un socio del padrón, y los que no */
            int conSocio,
            int sinSocio,
            LocalDateTime desde,
            LocalDateTime hasta,
            List<Mes> porMes,
            List<String> avisosGenerales,
            List<FilaAnalizada> filas) {

        public boolean sePuedeImportar() {
            return conError == 0 && (cobros + gastos) > 0;
        }
    }

    /** Lo que quedó escrito. {@code importacionId} es null si no había nada nuevo. */
    public record Resultado(UUID importacionId, int cobros, int gastos,
                            BigDecimal totalCobros, BigDecimal totalGastos,
                            int yaImportados, int yaCobrados) {
    }

    /** La última importación del gimnasio, para ofrecer deshacerla. */
    public record Ultima(
            UUID id,
            LocalDateTime cuando,
            String archivo,
            int cobros,
            int gastos,
            BigDecimal totalCobros,
            BigDecimal totalGastos,
            LocalDateTime desde,
            LocalDateTime hasta,
            boolean deshecha,
            boolean sePuedeDeshacer,
            String porQueNo) {
    }
}
