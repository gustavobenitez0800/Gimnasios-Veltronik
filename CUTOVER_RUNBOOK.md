# 🚀 Runbook de Cutover V1 → V2

> **Principio rector:** publicar la app Electron es el **PUNTO DE NO RETORNO**
> (el autoupdate es agresivo y `allowDowngrade=false`). **TODO se valida ANTES de ese paso.**
> Hasta entonces, V1 sigue en producción y todo es reversible.

---

## Pre-flight (antes de empezar)

- [ ] Env vars productivas cargadas en **Railway** (MP_ACCESS_TOKEN, MP_PUBLIC_KEY,
      MP_WEBHOOK_SECRET, MP_ENFORCE_SIGNATURE=true, DB_URL/USERNAME/PASSWORD de V2,
      SUPABASE_URL de V2, FRONTEND_URL).
- [ ] Credenciales productivas de MP de V2 activadas.
- [ ] App Electron compilada (`pnpm build` + `electron-builder`) y **lista para publicar, pero AÚN NO publicada**.

---

## Pasos del corte (en orden)

### A. Desplegar el backend a Railway
- [ ] Deploy de la rama `v2-cloud`. Flyway aplica solo la migración **V16** (reconciliación de `gym_payments`).
- [ ] Verificar salud: `GET https://gimnasios-veltronik-production.up.railway.app/actuator/health` → **200** (ya no 401).
- [ ] Revisar logs de arranque: sin errores de Flyway ni de conexión a la BD.

### B. ETL final (captura cualquier cambio de último momento + corrige roles)
```bash
cd scripts
node etl_cutover.mjs           # DRY-RUN: revisá el reporte (debe correr sin errores)
node etl_cutover.mjs --commit  # APLICA de verdad
```
- [ ] El reporte debe mostrar `nuevos_en_V2 = 0` salvo algún rezagado, y `tenant_membership = 5` (corrige roles a OWNER).
- [ ] **Esperado (medido en pre-flight 2026-05-31, dry-run REAL exit 0):** `nuevos_en_V2 = 0` en TODAS las tablas de negocio (tenant=26, auth.users=4, auth.identities=5, gym_members=512, gym_payments=924, subscriptions=2 → todas 0 nuevos). Lo único distinto de 0 es `tenant_membership = 5` (corrección de rol owner→OWNER, idempotente). Si ves `nuevos_en_V2 > 0` en gym_members/gym_payments → hubo movimiento en V1 desde el pre-flight; revisá antes del `--commit`.

### C. Smoke-test del backend (OBLIGATORIO — es la red de seguridad)
Probar en la **app web** (Vercel) o local apuntando a Railway, logueando como un dueño real:
- [ ] **Login** de POPEYE y SEKUR → entran y ven SU gimnasio.
- [ ] **Socios**: la lista carga con nombres y DNI (no "Socio eliminado").
- [ ] **Pagos**: la lista muestra el socio en cada pago.
- [ ] **Historial de pagos de un socio** (modal en MembersPage) → carga (endpoint nuevo).
- [ ] **Crear** un socio de prueba → se guarda y aparece.
- [ ] **Registrar un pago** de prueba → se guarda, vincula al socio, extiende vencimiento.
- [ ] **Registrar un acceso** (check-in) → funciona.
- [ ] Verificar que un usuario **NO** pueda ver otro gimnasio (cambiar `current_org_id` en localStorage → 403 y vuelve al Lobby).

### D. Configurar el webhook de MP (producción)
- [ ] En el panel de MP de V2: URL de notificaciones →
      `https://gimnasios-veltronik-production.up.railway.app/api/webhooks/mercadopago`
- [ ] El secret debe coincidir con `MP_WEBHOOK_SECRET` de Railway.

### E. ⛔ PUNTO DE NO RETORNO — Publicar la app Electron
- [ ] Solo si A–D están ✅. Publicar release **v2.0.0** a GitHub Releases
      (`gustavobenitez0800/Gimnasios-Veltronik`).
- [ ] A partir de acá, en ~30 min + próximo cierre de app, los clientes se actualizan a V2.

### F. Monitoreo post-publicación
- [ ] Mirar logs de Railway: logins entrando, sin errores 500.
- [ ] **SEKUR y POPEYE se re-suscriben** (una vez) desde el sistema, bajo la cuenta de MP de V2.
- [ ] **El primer cobro es nuestra ÚNICA observación de cómo MP notifica en esta cuenta.
      Anotá cuál de estos 4 casos ocurre en el log del webhook** (define el fix de renovaciones):
      - `Cobro {id} aplicado al Tenant ...` → 🎉 cobro aplicado, acceso extendido 30 días.
      - `Webhook RECHAZADO: firma inválida` → setear `MP_ENFORCE_SIGNATURE=false` en Railway
        (destraba al instante) y avisame para ajustar el formato de la firma.
      - `Pago {id} sin external_reference de tenant válido` → MP manda `payment` pero SIN
        external_reference → no se aplica solo. Plan B manual + requiere fix.
      - `Evento subscription_authorized_payment ... recibido` SIN un `Cobro ... aplicado` después
        → MP notifica la suscripción por ese evento (hoy IGNORADO): la RENOVACIÓN no se aplica sola.
        ⚠️ El SDK MP 2.9.2 NO tiene cliente de authorized_payment → el fix va por HTTP directo a
        `GET /authorized_payments/{id}`, escrito contra el evento REAL observado acá, en ventana
        tranquila ANTES de la 1ª renovación (~30 días). NO bloquea el corte: colchón GRACE_DAYS(3)
        + acceso por `trial_ends_at` + Plan B manual.
- [ ] Plan B si una suscripción no se activa sola: habilitar el tenant a mano (como ya hiciste con POPEYE).

### G. Apagar V1
- [ ] Solo cuando V2 esté confirmado estable (dejar correr unas horas/un día).

---

## Contingencia / Rollback
- **Antes del paso E:** todo reversible. V1 sigue vivo; si algo falla en el smoke-test, se corrige sin impacto en clientes.
- **Después del paso E:** el camino es **forward-fix** (no hay downgrade fácil). Por eso A–D deben quedar impecables antes de publicar.
- **Acceso a clientes**: el acceso se otorga por `trial_ends_at`; el Kill Switch protege a quien tiene suscripción `active`. Ante cualquier duda de cobro, el cliente NO queda bloqueado de inmediato.

---

## Pendiente post-launch (no bloquea el corte)
- Validar la firma del webhook contra un evento real y volver `MP_ENFORCE_SIGNATURE=true`.
- Tests automatizados del aislamiento multitenant.
- Limpieza: ~20 tenants de prueba, tablas staging (`gym_member`/`member_payment`), código muerto.
- Rotar credenciales (DB y, si corresponde, el access token de MP que pasó por chat).
