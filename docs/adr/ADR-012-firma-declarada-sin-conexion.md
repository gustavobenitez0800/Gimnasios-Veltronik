# ADR-012: Sin conexión la firma es declarada, y el registro dice de qué tipo es

- **Estado:** ✅ Aceptada
- **Fecha:** 2026-09-07

## Contexto

Cada cobro y cada acceso quedan firmados por quien atendió, con un PIN de 4 dígitos por persona (mostrador). Esa firma **da responsabilidad, no seguridad**, y está asumido: un PIN de 4 dígitos lo ve cualquiera que mire por encima del hombro, y son 10.000 combinaciones.

Hoy `CashierService.startShift` valida el PIN **contra el backend**. Con el núcleo local (espejo de 30 días + cola de escrituras) llega la fase de **cobrar y dar de alta sin internet**, y ahí aparece el problema: sin servidor no hay contra qué validar, así que **un cobro encolado no tiene autor** — se pierde exactamente lo que el PIN vino a dar.

Hoy no rompe nada porque sin conexión solo se registran accesos, y una entrada no necesita autor. Con plata en la cola, sí.

La restricción que manda sobre todo lo demás la fijó el dueño: **la caja nunca para.** Ninguna solución puede bloquear el cobro por no poder identificar a nadie.

## Decisión

**La firma tiene tres niveles, y cada movimiento guarda cuál le tocó.** No se guarda solo *quién* firmó: se guarda *cómo*.

| Nivel | Cuándo | Qué afirma el sistema |
|---|---|---|
| **Verificada** | Con internet: PIN validado contra el servidor | Es quien dice ser |
| **Declarada** | Sin internet: eligió su nombre de la lista del equipo | Dijo ser esa persona |
| **Sin identificar** | Sin internet y sin lista espejada | Se cobró igual, sin autor |

**El terminal espeja del equipo solo los NOMBRES. Nunca credenciales, ni en claro ni con hash.**

El cierre de caja y la lista de movimientos muestran la distinción: es donde el dueño mira, así que es donde tiene que verse.

### La regla que esto protege

**El sistema nunca afirma que verificó algo que no verificó.** Es la misma regla que ya rige en el mostrador —*"Guardado sin conexión"* en vez de *"Entrada registrada"*, porque la dirección la decide el servidor— y en el control de acceso: *nadie anuncia una dirección que no controla*.

## Alternativas descartadas

### Espejar el equipo con el HASH de cada PIN, y validar local

Era la opción obvia y la que da la experiencia más uniforme: la persona teclea su PIN siempre, haya o no internet. Se descartó por tres motivos, en orden de peso.

**1. Una credencial espejada no se puede revocar sin conexión, así que no verifica de verdad.** El espejo vale **30 días** por decisión del dueño. Un empleado dado de baja un lunes sigue teniendo PIN válido en el mostrador el martes, y el terminal no tiene forma de enterarse. El sistema prometería verificación y entregaría *"verificación contra datos posiblemente viejos"*, que es una promesa que se degrada **en silencio** — el mismo modo de falla que ya se documentó en el molinete: un espejo desfasado hace que el socio pague y la puerta no abra, sin que nadie vea por qué. Verificar contra un hash viejo no es verificar: tiene **forma** de verificación.

**2. Convierte el terminal en un depósito de credenciales, y eso cambia qué es esa máquina.** Hoy el terminal guarda dos cosas y solo dos: un **espejo** (descartable, se vuelve a bajar) y una **cola** (irreemplazable). Agregar hashes de PIN suma una tercera categoría y cambia qué significa que roben esa PC. Se estaría asumiendo la responsabilidad de guardar credenciales de los empleados **en la máquina del cliente** para reforzar un control que, por decisión explícita, *no es un control de seguridad*. El costo/beneficio está al revés.

**3. Escala mal por donde escala el negocio.** La variable que crece no es la cantidad de gimnasios: es la **rotación de personal**. Más clientes × más empleados = más credenciales viejas en más discos ajenos. Y produce un ticket de soporte confuso de diagnosticar e imposible de explicar: *"cambié el PIN y en el mostrador sigue andando el viejo"*.

### Pedir el PIN igual sin conexión, sin chequearlo

Da la experiencia uniforme sin guardar nada. Se descartó porque es lo peor de los dos mundos: **le enseña a la gente que el PIN es teatro**, y el día que se sepa que sin conexión no se valida, el control pierde credibilidad entera — también donde sí funciona. Un cartel que dice *"Sin conexión — elegí quién está atendiendo"* se entiende sin que nadie lo explique y no miente.

### Que sin conexión no se pueda cobrar si no hay turno abierto

Cero exposición nueva, cero trabajo. Se descartó porque **contradice la restricción que manda**: un corte de luz sumado a un corte de internet dejaría al gimnasio sin poder cobrar. Sobrevive, sí, como el nivel degradado *sin identificar*: no bloquea, avisa.

## Consecuencias

- **La caja nunca se frena**, que era la restricción dura.
- **Ninguna credencial sale de la nube.** El terminal sigue guardando espejo + cola, nada más, y un terminal robado no compromete al equipo.
- El registro del día **distingue lo verificado de lo declarado**, así que el dueño sabe cuánto vale cada firma cuando mira una diferencia de caja tres meses después.
- ⚠️ **Sin conexión, cualquiera puede declararse cualquiera.** Está asumido, y no es un cambio real respecto de hoy: cualquiera que vea a un compañero teclear cuatro dígitos ya puede usarlos. Lo que cambia es que el sistema **lo dice** en vez de simularlo.
- Es también la opción de **menos trabajo y menos mantenimiento** de las tres, lo que importa con un equipo de una persona (criterio rector de la V3).
- Para vender no se pierde nada: ningún dueño pregunta *"¿verificás el PIN sin internet?"*. Preguntan *"¿quién cobró esto?"* y *"¿cómo sé que no me robaron?"* — y a las dos las contesta igual de bien la firma declarada. ⚠️ Y hay antecedente: el catálogo ya prometió *"sigue funcionando sin internet"* cuando no era cierto, y esa frase se le mostraba al cliente **en el muro de pago**. No conviene crear una segunda promesa que se degrada sola.

## Cuándo reconsiderar

**La señal principal: que el PIN deje de ser responsabilidad y pase a ser permiso** — que autorice descuentos, anulaciones o devoluciones. Ahí sí hace falta autenticación real sin conexión, y la respuesta correcta **no serían hashes espejados** (siguen sin poder revocarse): sería una **credencial por persona atada al equipo**, con vencimiento corto y renovación en línea. Es un diseño más grande y hoy no hace falta.

**Señal secundaria:** un cliente con conflictos reales de manejo de efectivo que **exija** atribución verificada sin conexión. Eso es una conversación de precio y de segmento, no un cambio de arquitectura por defecto.
