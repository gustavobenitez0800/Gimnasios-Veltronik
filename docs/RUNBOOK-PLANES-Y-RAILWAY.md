# Runbook — división de planes y baja de Railway

Dos trabajos que se pueden hacer en paralelo: **apagar Railway** (casi todo del lado de las
cuentas, no del código) y **vender dos planes** (casi todo código, ya escrito).

---

# Parte 1 — Apagar Railway

## Lo que YA apunta a Cloud Run

| | Verificado |
|---|---|
| Portal web (Vercel) | `VITE_API_BASE_URL` cambiado el 2026-09-02 |
| App de escritorio | Leído del `app.asar` de la 2.6.30 instalada: `https://v2-backend-7rpsadmoka-rj.a.run.app/api` |

Los clientes ya están todos en Cloud Run. Railway sigue prendido pero **nadie lo usa para
operar**.

## Lo único que todavía lo necesita

**El webhook de Mercado Pago.** El backend **no manda `notification_url` en cada pedido** — la
URL está configurada una sola vez en el panel de MP, y apunta a Railway.

> ⚠️ Si se apaga Railway sin cambiarla, **los cobros se siguen haciendo y Veltronik no se
> entera**. Los clientes pagan y el sistema los da por impagos. No hay error visible: las
> suscripciones simplemente dejan de renovarse.

## Pasos

1. **Cambiar la URL en el panel de Mercado Pago** a:
   ```
   https://v2-backend-7rpsadmoka-rj.a.run.app/api/webhooks/mercadopago
   ```

2. **Verificar que llegue un aviso de verdad.** Este es el paso que no se puede saltear.

   Ese endpoint devuelve `401` tanto para un pedido sin firma **como para uno con la firma
   equivocada**. Cloud Run toma `MP_WEBHOOK_SECRET` de los secrets de GitHub; si no es la misma
   que tiene MP, los avisos se rechazan y no se nota.

   Forzá una notificación de prueba desde el panel de MP y mirá los logs de Cloud Run:
   - `Webhook MP: type=..., resourceId=...` → entró bien.
   - `Webhook RECHAZADO: firma ausente o inválida` → el secret no coincide.

   Válvula si urge destrabar: `MP_ENFORCE_SIGNATURE=false` en Cloud Run. **Volver a `true`**
   apenas se corrija el secret.

3. **Esperar un cobro real** con la URL nueva. Es la única prueba que vale.

4. **Apagar Railway.**

5. Limpiar los documentos y comentarios que todavía nombran a Railway (cosmético, sin apuro).

---

# Parte 2 — Los dos planes

## Precios

| Plan | Precio | Variable | Incluye |
|---|---|---|---|
| Básico | 45.000 | `BILLING_MONTHLY_PRICE` | Todo el sistema |
| Premium | 80.000 | `BILLING_PREMIUM_PRICE` | + control de acceso (molinete / facial) |

El básico **ya está en 45.000 en producción** — no hay nada que bajar. Los dos precios salen de
variables de entorno: cambiarlos **no requiere deploy**.

## Lo que ya está construido

- El catálogo, con los dos planes, sus precios y qué desbloquea cada uno (`PlanCatalog`).
- El candado: `PlanPolicy` + `PlanFeature.CONTROL_DE_ACCESO`, que es lo que hoy decide si el
  molinete sincroniza o no.
- **El checkout ahora sabe de planes**: el cliente elige, y el precio lo pone el catálogo.
- **La suscripción guarda qué plan se compró.** Antes `plan_code` nunca se escribía y quedaba
  siempre en `BASICO`: alguien podía pagar el premium y quedarse sin molinete igual.
- La pantalla de planes ya dibuja una tarjeta por plan; con el premium encendido aparecen dos.

### El precio nunca viaja desde el navegador

Viaja el **código** del plan (`BASICO` / `PREMIUM`) y el backend le pone el precio. Si el monto
viniera en el pedido, cualquiera contrataría el premium por mil pesos editando la request.

Y **falla hacia menos acceso**: un código que no se entiende, o un plan que todavía no está a la
venta, caen en básico. Equivocarse hacia abajo se arregla con una llamada del cliente; hacia
arriba, se regala lo que se está vendiendo.

## Pasos

6. **Deployar** backend (Cloud Run) y portal (Vercel).
   **No hace falta release del escritorio**: la pantalla de planes no va en el instalador — el
   escritorio manda al portal para cobrar.

7. **Encender el premium**: `BILLING_PREMIUM_AVAILABLE=true` en Cloud Run.
   Hasta ese momento el premium no existe para nadie, así que el paso 6 se puede hacer tranquilo
   días antes.

8. **Probar la compra** con un gimnasio de prueba: elegir premium, pagar, y verificar que
   `subscriptions.plan_code` quedó en `PREMIUM` y que el molinete sincroniza.

---

## ⚠️ Lo que hay que saber antes de mover un precio

**El monto va grabado en el preapproval de Mercado Pago.** Cambiar el catálogo **no le cambia el
precio a nadie que ya esté suscripto**: le sigue llegando el débito viejo hasta que se cree una
suscripción nueva.

Consecuencias prácticas:

- **Pasar a un cliente al premium no es cambiarle un campo.** Hay que crear un preapproval nuevo
  de 80.000, o sea que el cliente vuelve a pasar la tarjeta. La mecánica ya existe: cuando el
  nuevo queda autorizado, el webhook cancela el anterior.
- **Si algún cliente quedó con un preapproval viejo de 80.000**, sigue pagando 80.000 aunque el
  catálogo diga 45.000. Hay que revisarlo cliente por cliente.

**Cambiar la tarjeta NO cambia el plan.** El endpoint de "actualizar método de pago" conserva el
plan contratado. Sin eso, alguien en premium que actualiza su tarjeta se generaría un preapproval
de básico y quedaría cobrado de menos y sin molinete, sin haber pedido nada.
