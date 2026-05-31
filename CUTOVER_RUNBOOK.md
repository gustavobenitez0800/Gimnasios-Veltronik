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
- [ ] Al primer cobro, mirar el log del webhook:
      - Si dice `Webhook RECHAZADO: firma inválida` → setear `MP_ENFORCE_SIGNATURE=false`
        en Railway (lo destraba al instante) y avisame para ajustar el formato de la firma.
      - Si activa el acceso solo → 🎉.
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
