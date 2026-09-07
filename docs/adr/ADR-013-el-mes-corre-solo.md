# ADR-013: La cuota corre un mes por defecto; el arancel dice qué entrenó, no cuánto dura

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-09-07

## Contexto

Lo dijo el dueño mirando la pantalla de cobro, y contradice lo que el sistema hacía:

> *"Los aranceles no definen el vencimiento del alumno. Lo que hace que el alumno venza y tenga que pagar de nuevo es el mes, simple: paga la cuota el 7 de marzo y su cuota vence el 7 de abril. Los aranceles son para saber qué tipo de entrenamiento eligió durante ese mes."*

El sistema hacía lo contrario, y de dos maneras.

**1 · La cobertura salía EXCLUSIVAMENTE del arancel.** Si el cobro no llevaba arancel —"Sin arancel (monto a mano)", que es lo que el mostrador usa todo el tiempo— el vencimiento **no se movía ni un día**. La plata entraba a la caja y el socio seguía igual de vencido. Y peor: `duration_days` arranca en **0**, y 0 significa *"no corre nada"*. O sea que **el valor por defecto era el que rompía**, en silencio.

**2 · "30 días" no es "un mes".** El sistema hacía `fecha + N días`:

| Paga | El sistema decía | La regla del dueño |
|---|---|---|
| 7 de marzo | **6 de abril** | 7 de abril |
| 7 de febrero | **9 de marzo** | 7 de marzo |

En un año son **360 días en vez de 365**: el socio paga doce veces y le faltan cinco días. Y el *"vence el 7"* deja de ser cierto, que es justo lo simple que el negocio necesita.

## Decisión

**El mes corre solo. El arancel es una etiqueta que puede, opcionalmente, decir otra cosa.**

1. **Sin configurar nada, cobrar corre un mes.** Sin arancel, con un arancel recién creado, con monto a mano: **un mes**. Un gimnasio nuevo puede cobrar el día uno sin pasar por Ajustes.
2. **Un mes es el mismo día del mes siguiente.** El 7 vence el 7. Si ese día no existe —pagó un 31— vence **el último día que exista** (28, 29 o 30).
3. **El arancel deja de hablar de días y habla en meses**, con las palabras que usa un dueño: **1 mes · 3 meses · 6 meses · 1 año · no cubre tiempo**. Por defecto, **1 mes**.
4. **"No cubre tiempo"** es la clase suelta o el pase diario. Escrito con todas las letras, no escondido en un cero.
5. ⚠️ **Y si un cobro NO va a mover la fecha, la pantalla lo dice EN EL MOMENTO DE COBRAR.** Nunca en silencio.

## Alternativas descartadas

### Todo cobro corre un mes, siempre (el arancel es solo una etiqueta, sin excepciones)

Es la lectura literal de lo que dijo el dueño y la más simple de explicar. Se descartó por un agujero que aparece en la primera venta seria: **no se puede vender un trimestral, un semestral ni un anual**. El descuento por pagar adelantado es de las herramientas más comunes de un gimnasio, y con esta regla habría que cobrar tres veces seguidas — quedan tres cobros donde hubo uno, y el arqueo del día miente.

La decisión tomada conserva la simpleza donde importa (el 95% de los cobros son la cuota del mes, y ahí no hay nada que configurar) y deja lugar para el otro 5%.

### Dejar el catálogo como estaba, en días

Es lo que ya había, y el problema no era el modelo sino **el vocabulario y el valor por defecto**. "Duración: 30" obliga a quien vende a traducir meses a días y a acordarse de febrero; "0" como default hace que lo más probable sea el silencio. Un desplegable en meses elimina la traducción y la posibilidad de escribir un número que no signifique nada.

## Consecuencias

- **Vende mejor y se demuestra en diez segundos.** El momento que gana una demo es *"cobrás y el vencimiento se corre solo"*. Con el default en un mes, eso pasa sin haber configurado nada.
- **La recepcionista nunca piensa en duración.** Elige el arancel por su nombre —"Musculación", "Funcional"—, que es exactamente lo que el dueño dice que el arancel es, y el mes lo corre el sistema.
- ⚠️ **Cambia cómo vence el padrón de acá en adelante.** No es retroactivo: las fechas ya aplicadas no se tocan. Pero un socio que hoy renovaba cada 30 días va a renovar cada mes calendario, y en un año eso son cinco días más de cobertura por socio. Es lo correcto según la regla del negocio, y hay que saberlo.
- ⚠️ **Los aranceles existentes hay que migrarlos** de días a meses. Los valores redondos (30/90/180/365) mapean solo; uno con un valor raro —45 días— hay que redondearlo, y eso cambia lo que ese arancel vendía. Son pocos clientes y pocos aranceles: se revisa a mano.
- **Se cierra un silencio que costaba clientes.** Un arancel mal configurado hacía que los cobros no corrieran la fecha y nadie se enteraba hasta que a un socio no lo dejaban entrar, jurando que pagó, con la recepcionista sin saber qué contestar.

## Cuándo reconsiderar

Si aparece un gimnasio que vende **por semanas o por días** de verdad —un pase de verano de 15 días, una promo de dos semanas— el desplegable en meses le queda corto. Ahí la respuesta no es volver a un campo de días libre, que es lo que se acaba de sacar: es agregar las opciones que ese negocio pide, con sus palabras, y que la lista siga siendo una lista.

Y si algún cliente pide facturar **por período fijo** (todos vencen el día 1, sin importar cuándo pagaron), eso es un modelo distinto de cobranza y merece su propio ADR: cambia el arqueo, la mora y el aviso de vencimiento, no solo la fecha.
