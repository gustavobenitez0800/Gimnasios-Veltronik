package com.veltronik.v2.gym.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Todo lo que el Dashboard pinta, ya resumido.
 *
 * <p>⭐ <b>POR QUÉ EXISTE.</b> El Dashboard se traía TODOS los socios y TODOS los pagos del
 * gimnasio en cada apertura, y hacía las cuentas en el navegador. Con el gimnasio que migró
 * 385 socios y un año de cobros, eso son miles de filas viajando por la conexión del
 * gimnasio —cada una con su ficha completa— para pintar cuatro números, dos gráficos y una
 * lista de cinco. Se sentía como "el sistema va lento" y en realidad era el sistema mandando
 * un padrón entero para mostrar un promedio.</p>
 *
 * <p>Acá viaja el resultado: conteos, series por mes y listas cortas. Las cuentas las hace
 * Postgres, que para eso está.</p>
 *
 * <p><b>Lo que NO se movió al servidor</b>: la predicción de ingresos y los textos de los
 * insights se calculan en el frontend (lib/resumenDashboard.js), alimentados con estas series.
 * El servidor manda lo que el navegador no puede saber bien solo: qué día es para el gimnasio
 * ({@code hoy}), lo cobrado el mes pasado hasta este mismo día y cuándo fue el primer cobro.
 * Con eso la pantalla trata al mes en curso como lo que es: un mes que todavía no terminó.</p>
 */
public record DashboardResumenDTO(
        Socios socios,
        Ingresos ingresos,
        Vencimientos vencimientos,
        List<String> cumplenHoy,
        List<GymMemberDTO> ultimosSocios,
        /*
         * Qué día es HOY para el gimnasio (hora de Argentina). La pantalla lo usa para saber
         * cuál es el mes en curso y en qué día va, en vez de preguntarle al reloj de la PC:
         * una computadora con la zona mal puesta, a las 22:00 del 30, ya estaba en el mes
         * siguiente y corría el gráfico un lugar.
         */
        java.time.LocalDate hoy
) {

    /**
     * El padrón contado por situación, con el criterio de {@code MemberAccessPolicy}:
     * {@code activos} = al día (cuota vigente), {@code vencidos} = la fecha pasó (en gracia
     * incluidos), {@code sinFecha} = sigue siendo socio pero no tiene vencimiento cargado,
     * {@code inactivos} = dados de baja. Los cuatro suman {@code total}.
     *
     * <p>{@code suspendidos} viaja siempre en 0: el backend no distingue "suspendido" de
     * "dado de baja". Se deja por los escritorios instalados que todavía lo leen.</p>
     */
    public record Socios(long total, long activos, long inactivos, long vencidos, long suspendidos,
                         long sinFecha) {}

    /**
     * @param serieMensual             todos los meses con cobros hasta el mes en curso, del más
     *                                 viejo al más nuevo. El último puede ser el mes en curso,
     *                                 que todavía no terminó.
     * @param delMismoPeriodoAnterior  lo cobrado el mes pasado HASTA el mismo día y hora de hoy.
     *                                 Es contra lo que se compara el mes en curso: el 21 de
     *                                 septiembre contra el 1 al 21 de agosto, no contra agosto
     *                                 entero (que el día 1 daba siempre "bajaron 95%").
     * @param primerCobro              cuándo cobró el gimnasio por primera vez. Si fue avanzado
     *                                 el mes, ese primer mes está incompleto.
     * @param otrosIngresosDelMes      las ventas y otros ingresos de la caja del mes en curso. Ya
     *                                 están dentro de {@code delMes}: viajan aparte para decirlo.
     * @param historialDelMes          lo importado del sistema anterior en el mes en curso (idem).
     */
    public record Ingresos(BigDecimal delMes, BigDecimal delMesAnterior, List<MesConTotal> serieMensual,
                           BigDecimal delMismoPeriodoAnterior, java.time.LocalDateTime primerCobro,
                           BigDecimal otrosIngresosDelMes, BigDecimal historialDelMes) {}

    /**
     * @param mes   el primer día del mes, para que el cliente lo formatee como quiera.
     * @param total todo lo que entró ese mes (LibroDeIngresos): cuotas + historial + otros ingresos.
     */
    public record MesConTotal(LocalDateTime mes, BigDecimal total, BigDecimal cuotas, BigDecimal historial,
                              BigDecimal otrosIngresos) {}

    /**
     * @param estaSemana cuántos vencen en los próximos 7 días (no incluye a los ya vencidos)
     * @param total      cuántos necesitan atención en total, incluidos los vencidos
     * @param primeros   los más urgentes, acotados: con cientos de vencidos, la lista
     *                   completa no la lee nadie y cuesta traerla
     */
    public record Vencimientos(long estaSemana, long total, List<Alerta> primeros) {}

    /**
     * @param diasRestantes negativo = ya venció (y cuántos días hace). Es el mismo número que
     *                      la pantalla usa para decidir el color y el texto.
     */
    public record Alerta(UUID socioId, String nombre, long diasRestantes, LocalDateTime vence) {}
}
