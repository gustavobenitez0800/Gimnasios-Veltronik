# 📋 Tareas manuales — Gustavo

> Lo que **solo vos** podés hacer (paneles, credenciales, decisiones de deploy).
> Actualizado: 2026-08-15. Tachá con `[x]` a medida que completes.

---

## 🆕 Tanda del plan (2026-08-15) — qué hay que mirar al deployar

**Buena noticia: no hay ninguna variable de entorno nueva ni ningún panel que tocar.**
El logo del gimnasio se guarda en la propia base (el navegador lo recorta y comprime
antes de mandarlo), justamente para no depender de un bucket de Supabase Storage que
haya que crear y configurar a mano.

- [ ] Al mergear, verificar en los logs de Railway que aplicó la **V44 — Gym Identity
      And Logo**. Es aditiva y reversible: ensancha `logo_url` a TEXT, agrega
      `logo_emoji` y le pone DEFAULT `'GYM'` a `business_type`. **No dropea nada.**
- [ ] Smoke del alta: "Registrá tu Gimnasio" tiene que ser **un solo paso** (ya no
      pregunta "¿qué tipo de negocio tenés?" ni ofrece "← Cambiar tipo").
- [ ] Smoke del logo: subir una imagen en el alta → tiene que aparecer en la tarjeta
      del lobby. Sin imagen, tiene que salir el emoji (nunca el logo viejo de Veltronik).
- [ ] Smoke en el CELULAR (esto es lo importante de esta tanda): entrar a una sucursal
      y confirmar que **el menú de hamburguesa abre** y que las acciones rápidas
      responden al tacto. Antes no respondía nada.
- [ ] Smoke del borrado en el celular: tocar el tacho de una sucursal de prueba → el
      diálogo tiene que quedar **centrado y arriba del teclado**, con el campo y el
      botón alcanzables.

> Nota sobre `business_type`: la columna sigue en la base a propósito (con default del
> lado del servidor). El dueño ya no la ve ni la contesta en ningún lado, y la API ya
> no la acepta. El motivo de no dropearla está escrito en la propia migración V44.

---

## 🔴 0. LO MÁS URGENTE — el fix de pagos todavía no está en producción

La rama **ya está pusheada** (2026-07-27). Lo que falta es abrir el PR, esperar el verde
y mergear. Hasta que eso pase, en producción siguen vivos estos tres bugs de plata:

- El muro de pago **deja entrar sin pagar** al tocar "Reactivar Suscripción".
- El cobro **sale contra la sucursal equivocada** (o contra ninguna).
- Mercado Pago devuelve al cliente a una URL que la app no resuelve → no ve
  "pago confirmado" y **vuelve a intentar el pago** (más intentos = más rechazos de MP).

**Pasos (en este orden):**

- [ ] Abrir el PR: https://github.com/gustavobenitez0800/Gimnasios-Veltronik/pull/new/feat/etapa1-limpieza-baja-futbol5
      ⚠️ El PR es **obligatorio para que corra el CI**: `ci.yml` solo se dispara en PRs,
      en `main`, o a mano. Pushear una rama sola NO lo dispara.
- [ ] Esperar **CI verde** (backend `mvn verify` + frontend lint/build). Local ya está:
      179 tests verdes, lint en 0, build OK.
- [ ] Merge a `main` → Railway deploya solo y corre la **V40**.
      ⚠️ **V40 es IRREVERSIBLE**: dropea las tablas `court_*` y borra los negocios
      FUTBOL_5 (tus pruebas). Ya lo aprobaste; esto es el recordatorio.
- [ ] Verificar en los logs de Railway: `Flyway ... V40` aplicada y app UP.
- [ ] **Revisar en Mercado Pago** si en estas semanas se crearon suscripciones contra la
      sucursal equivocada. El código ya no las genera, pero las que se hayan creado mal
      siguen ahí.
- [ ] Confirmarme **cuál variable de URL tenés seteada en Railway** (`CORS_FRONTEND_URL`
      o `FRONTEND_URL`) y con qué valor. El código ahora funciona con cualquiera de las dos;
      si ninguna está puesta usa la URL de Vercel por defecto. De ahí sale la dirección a la
      que MP devuelve al cliente después de pagar.

---

## 1. Supabase (para que funcionen "olvidé mi contraseña" y Google)

Panel: https://supabase.com/dashboard → tu proyecto → **Authentication**

- [ ] **URL Configuration → Site URL**: poner el dominio web de producción
      (`https://gimnasio-veltronik-veltroniks-projects.vercel.app` o tu dominio custom si tenés).
- [ ] **URL Configuration → Redirect URLs**: agregar `https://<tu-dominio-vercel>/**`
      (con los `/**` al final — cubre `#/reset-password` y el retorno del OAuth).
- [ ] **Providers → Google → Enable**: pegar el Client ID y Client Secret que salen del paso 2.

## 2. Google Cloud Console (credenciales para "Continuar con Google")

Panel: https://console.cloud.google.com → APIs & Services

- [ ] **OAuth consent screen**: completarla si no está (nombre "Veltronik", logo, dominios).
- [ ] **Credentials → Create Credentials → OAuth client ID** (tipo **Web application**):
      en "Authorized redirect URIs" poner **exactamente**
      `https://<project-ref>.supabase.co/auth/v1/callback`
      (el `<project-ref>` es el subdominio de tu URL de Supabase).
- [ ] Copiar Client ID + Secret → pegarlos en Supabase (paso 1, último ítem).

## 3. Railway (limpieza de variables sin uso)

Panel: https://railway.app → servicio del backend → Variables

- [ ] Borrar `GEMINI_API_KEY` (era del bot de canchas — eliminado).
- [ ] Borrar `GEMINI_MODEL`.
- [ ] Borrar `WHATSAPP_VERIFY_TOKEN`.
- [ ] Borrar `WHATSAPP_GRAPH_VERSION`.

**Pendientes de ANTES (verificá si ya los hiciste):**
- [ ] `VELTRONIK_FISCAL_MASTER_KEY` — necesaria para el onboarding fiscal ARCA (del pulido del 06/07).
- [ ] `FOUNDER_EMAILS` — solo si entrás a Mission Control con otro email que no sea el default.

## 4. Smoke en producción (después del merge del punto 0)

- [x] ~~Pushear la rama~~ — hecho el 2026-07-27.
- [ ] Smoke en la web: login, lobby con logos correctos, crear negocio dice
      "Registrá tu negocio", NO aparece "Cancha de Fútbol" en el onboarding.
- [ ] Probar **borrar un negocio de prueba** → ya no debe dar el error 409.
- [ ] **Probar el flujo de pago completo** con una sucursal bloqueada: tocar "Reactivar
      Suscripción" → tiene que llevarte a la pantalla de pago (NO adentro del sistema) →
      pagar → volver y ver "¡Pago Exitoso!".
- [ ] Verificar que un kiosco ve "kiosco" y no "negocio" en Ajustes y en Planes.

## 5. Después de configurar Supabase/Google (pruebas en vivo, en la web)

- [ ] **Reset password**: pedir el mail → click en el link → debe abrir la página
      "Restablecer Contraseña" y dejarte poner la clave nueva → login con la nueva.
- [ ] **Google**: "Continuar con Google" → elegir cuenta → debe volver al Lobby logueado.

## 6. Release de Electron (cuando decidas — lleva el logo nuevo al escritorio)

- [ ] Subir versión en `frontend/package.json` (ej. 2.6.6 → 2.7.0).
- [ ] Tag `v2.7.0` + push del tag → GitHub Actions arma el instalador (queda en **borrador**).
- [ ] Probar el .exe del borrador en una máquina real (icono nuevo en barra de tareas,
      login SIN botón de Google en escritorio, "olvidé contraseña" abre el navegador).
- [ ] Publicar el borrador → la flota se actualiza sola por anillos.

---

### Notas
- El botón de Google en **Electron** quedó oculto a propósito (el OAuth de escritorio
  necesita un protocolo custom — pendiente para una entrega futura). En la web funciona.
- El logo azul marino tiene poco contraste sobre el tema oscuro de la app. Si querés
  una variante clara para fondos oscuros, pedila en la Etapa 2.
