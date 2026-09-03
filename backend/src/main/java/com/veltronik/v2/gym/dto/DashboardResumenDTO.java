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
 * insights siguen calculándose en el frontend, con las mismas fórmulas de siempre, pero
 * alimentadas con estas series en vez de con los pagos crudos. Reescribir una regresión
 * lineal en Java para que dé exactamente el mismo número no tiene ninguna ventaja y sí un
 * riesgo: que empiece a decir algo distinto de lo que decía ayer.</p>
 */
public record DashboardResumenDTO(
        Socios socios,
        Ingresos ingresos,
        Vencimientos vencimientos,
        List<String> cumplenHoy,
        List<GymMemberDTO> ultimosSocios
) {

    /**
     * El padrón contado por estado, con el MISMO criterio que usaba la pantalla:
     * quien está dado de baja es inactivo; quien está activo pero con la fecha pasada es
     * vencido; el resto, activo.
     *
     * <p>{@code suspendidos} viaja siempre en 0 y se deja a propósito: el gráfico tiene esa
     * porción desde antes y el backend no distingue "suspendido" de "dado de baja" (solo
     * guarda un booleano). Mandar el cero es más honesto que sacar la categoría y que la
     * pantalla muestre una leyenda distinta según de dónde vengan los datos.</p>
     */
    public record Socios(long total, long activos, long inactivos, long vencidos, long suspendidos) {}

    /**
     * @param serieMensual todos los meses con cobros, del más viejo al más nuevo. El gráfico
     *                     toma los últimos seis y la predicción usa la serie completa: son
     *                     los mismos datos que antes se derivaban de la lista de pagos.
     */
    public record Ingresos(BigDecimal delMes, BigDecimal delMesAnterior, List<MesConTotal> serieMensual) {}

    /** @param mes el primer día del mes, para que el cliente lo formatee como quiera. */
    public record MesConTotal(LocalDateTime mes, BigDecimal total) {}

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
