package com.veltronik.v2.gym.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * El resumen que ve el DUEÑO de todas sus sucursales juntas.
 *
 * <p>Es lo único en el sistema que mira más de una sucursal a la vez. Todo lo demás está
 * construido para que eso sea imposible —un empleado de Centro no puede ver Norte— así que
 * acá la seguridad no viene del aislamiento sino de tres límites, y conviene tenerlos a la
 * vista: <b>solo el dueño</b>, <b>solo sus propias sucursales</b> (resueltas en el
 * servidor, jamás una lista que mande el cliente) y <b>solo números agregados</b>. Nunca
 * socios, nunca fichas, nunca nombres de personas: lo peor que puede escapar de acá es un
 * total mensual.</p>
 */
@Data
public class OwnerInsightsDTO {

    /** Los meses del período, del más viejo al más nuevo, como "YYYY-MM". */
    private List<String> months;

    /** Una fila por sucursal. */
    private List<Branch> branches;

    /** La suma de todas las sucursales, mes a mes. Se calcula acá para que el front no la arme mal. */
    private List<Month> totals;

    /** Días de gracia antes de dar a alguien por ido (ver {@link #provisionalFrom}). */
    private int graceDays;

    /**
     * Desde qué mes (inclusive) el número de BAJAS todavía se puede mover.
     *
     * <p>Una baja se cuenta recién cuando pasaron {@link #graceDays} días del vencimiento
     * sin que la persona pague — si no, todo el que se atrasa una semana figuraría como
     * que se fue. La consecuencia es que los meses más recientes están incompletos, y eso
     * hay que decirlo en pantalla: un número que sube solo después, sin aviso, parece un
     * error del sistema.</p>
     */
    private String provisionalFrom;

    @Data
    public static class Branch {
        private UUID tenantId;
        private String name;
        private List<Month> months;
    }

    @Data
    public static class Month {
        /** "YYYY-MM". */
        private String month;
        /** Cuotas cobradas por el gimnasio ese mes (no la suscripción a Veltronik). */
        private BigDecimal revenue;
        /** Socios dados de alta ese mes. */
        private long newMembers;
        /** Socios cuya cobertura terminó ese mes y no volvieron a pagar. */
        private long churned;
    }
}
