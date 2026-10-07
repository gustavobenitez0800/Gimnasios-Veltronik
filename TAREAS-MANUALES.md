# 📋 Tareas manuales — Gustavo

> Lo que **solo vos** podés hacer: paneles, credenciales, pruebas con la app en la mano y
> decisiones. Actualizado: **2026-10-06**. Tachá con `[x]` a medida que avances.
>
> La versión anterior (19/09) se reemplazó entera: daba por pendiente la renovación de SEKUR
> y por posible apagar Railway. Está en la historia de git si hace falta.

---

## ▶️ 0. Esta semana, en este orden

- [ ] **SEKUR actualiza su PC** (ver §2). Cinco minutos de ellos; destraba Railway y la
      rotación de la contraseña.
- [ ] **Dos cuentas de prueba en Mercado Pago** (vendedor y comprador, Argentina) y sus
      datos en `scripts/.env.mp-prueba`. Sin eso no se puede probar la suscripción programada.
- [ ] **Confirmar las tres promesas de la landing nueva** (ver §7).
- [x] **El PR #49** (el pulido de septiembre) entró a `main` el 6/10 y va en la versión
      2.6.42 del escritorio.
- [ ] **Domingo 11/10, gimnasio cerrado:** Supabase de NANO a MICRO (gratis, reinicia el
      proyecto) y probar restaurar el backup.

## 📅 Fechas que no se mueven

| Cuándo | Qué |
|---|---|
| mié 28/10 | Railway cobra, si para entonces no se apagó |
| vie 30/10 | Cambio del Data API de Supabase: **no hacer nada** y no pegar los `GRANT` del mail |
| sáb 31/10 | Renovación de SEKUR. El primer intento le rebota siempre: mirar el 2/11 |
| dom 1/11 | Supabase Pro. Esos días cobra también Google Cloud |
| 🔴 jue 5/11 | Santo Sport se corta a las 00:00 si no se suscribió desde la web. Avisarle unos días antes |
| 6/9/2027 | Vence el dominio |

---

## 🔴 1. Rotar la contraseña de la base — después de apagar Railway

El repositorio es **público** y su historia de git tiene dos cadenas de conexión de Postgres
**con contraseña**. Borrar el archivo no las sacó. Rotar es lo único que cierra el agujero.

⚠️ **No antes de §2:** mientras un cliente siga entrando por Railway, rotar lo deja sin
sistema.

Hacerlo **a primera hora** (el gimnasio está vacío): entre el paso 2 y el 4 el backend queda
sin base unos 3–5 minutos.

- [ ] 1. Supabase → *Project Settings* → *Database* → **Reset database password**. Copiala.
- [ ] 2. GitHub → el repo → *Settings* → *Secrets and variables* → *Actions*: actualizar
      **`DB_PASSWORD`** y **`DB_URL`** (la URL lleva la contraseña adentro).
- [ ] 3. *Actions* → **Deploy to Google Cloud Run** → *Run workflow* sobre `main`.
- [ ] 4. Cuando termine: abrir la app y cobrar algo de prueba (o mirar que el lobby cargue).
- [ ] 5. Supabase → *Logs* → conexiones a la base: mirar si hubo accesos que no reconozcas.

ℹ️ **El backup no se toca.** Usa su propio rol con su propia clave. Rotar la de `postgres`
no lo afecta.

⛔ La contraseña no se pega en ningún chat.

## 🔌 2. Apagar Railway

- [x] La renovación de SEKUR del 1/10 entró por Cloud Run, el mismo minuto.
- [ ] **SEKUR sale de la versión vieja del escritorio.** Su PC tiene una versión de agosto
      que todavía le habla a Railway y que solo se actualiza al cerrarse de verdad:
      clic derecho en el ícono de Veltronik al lado del reloj → **"Salir de Veltronik"**,
      esperar un minuto y abrirlo. Si sigue igual, instalar encima el `.exe` de la última
      versión (Releases del repo). Si tienen más de una PC, en todas.
- [ ] Railway → *Metrics* → *Requests* en cero durante 2 o 3 días.
- [ ] Recién ahí: desconectar GitHub de Railway y frenar el servicio.
- [ ] Una semana después: borrar el proyecto y cancelar el plan.

⚠️ **No desconectar GitHub antes:** Cloud Run va cambiando la base con cada versión, y un
Railway congelado quedaría con código viejo contra una base nueva.

## 🧪 3. Probar con la app en la mano

Todo esto tiene tests en verde, y ninguno lo usó nunca un humano.

- [ ] **Offline al clic** — con la última versión instalada, apagar el Wi-Fi y abrir
      Veltronik: tiene que entrar directo a Accesos y cada pantalla abrir al toque. Prender
      el Wi-Fi sin tocar nada: en unos 3 segundos los datos se ponen al día solos.
- [ ] **Un cobro con tarjeta de verdad en la página de planes** — el arreglo del 5/10 (un
      formulario por vez) se probó contra Mercado Pago, pero sin pasar una tarjeta.
- [ ] **Alta de cuenta** — con el alias `+prueba1` de tu mail (la cuenta habitual daría el
      camino de la sucursal adicional). Faltan:
  - [ ] 2b. *Ajustes*: tiene que decir la fecha del alta + 14 y "14 días de prueba restantes".
  - [ ] 3. Cargar un socio y cobrarle: tiene que quedar al día.
  - [ ] 4. **Segunda sucursal** con el mismo usuario: el lobby dice "Sumá otro local", NO
        regala prueba y al entrar pide el pago.
- [ ] **Importar socios** — en la cuenta de prueba: crear los aranceles "Pase libre",
      "Musculación 3 veces", "Funcional" y "Personalizado", y en *Socios → Importar* subir el
      Excel del gimnasio de demo. Esperado: 120 nuevos, 0 errores. Después probar
      **Deshacer**, y volver a importarlo.
- [ ] **Offline de punta a punta** — los seis caminos con el wifi apagado (llegaste al paso 3).
- [ ] **Check-in por QR** desde un celular.
- [ ] **La cuenta de demo** — entrar y mirar las pantallas con los datos sembrados: se
      verificaron en la base, nunca en pantalla. Resembrar justo antes de grabar.
- [ ] **Restaurar el backup** (va con el domingo 11/10).

## 🔍 4. Dos consultas para el SQL Editor de Supabase

Lo que los tests no pueden ver: el estado REAL de producción.

- [ ] Los dos triggers de `auth.users` existen (la V48 avisaba que el de borrado podía no
      instalarse por permisos):

  ```sql
  SELECT t.tgname, t.tgenabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal;
  ```
  Esperado: `on_auth_user_created` y `on_auth_user_deleted`, los dos con `O`.

- [ ] La V83 quedó aplicada (quien entra con Google tiene nombre):

  ```sql
  SELECT prosrc LIKE '%full_name%' AS lee_full_name FROM pg_proc WHERE proname = 'handle_new_user';
  ```
  Esperado: `true`.

## 🪧 5. Los carteles de check-in

- [ ] Rotar los tokens de los carteles de `checkin_point` (pendiente desde el 6/9).
      ⚠️ **Al rotar, el QR impreso deja de andar**: hay que reimprimir el cartel en el
      gimnasio. Coordinarlo con cada uno.

## 🧾 6. Cuentas y trámites

- [ ] **Una forma de pago de respaldo en Google Cloud.** Hoy hay una sola tarjeta: si
      rebota, se apaga el backend.
- [ ] **El dominio a tu nombre.** `veltronik.com.ar` figura a nombre del revendedor. Se pide
      el cambio a tu CUIT: es un trámite.
- [ ] **Verificar el Perfil de Empresa de Google.** Pide un video; sin verificar no aparece
      en la Búsqueda ni en Maps.
- [ ] **Search Console → Páginas:** que las tres páginas figuren indexadas y el sitemap pase
      a "Correcto".
- [ ] **El canal de YouTube:** entrar con la cuenta que lo creó y cargarle el link del sitio.
- [ ] **El cobro por transferencia de octubre:** pasar el monto si querés que figure en la
      contabilidad de Veltronik.
- [ ] **Hablar con un contador** por la facturación a los gimnasios.

## 🤔 7. Decisiones que solo podés tomar vos

- [ ] **Las tres promesas de la landing nueva.** Antes de publicarla tienen que ser ciertas:
      "seguís en el plan Veltronik hasta que el molinete esté funcionando", "te acompañamos
      por WhatsApp los primeros días y te lo dejamos andando con tu Excel adentro" y "te
      contesta una persona que conoce el sistema por dentro, no un bot".
- [ ] **Pago adelantado: ¿se suma o arranca de cero?** Hoy se suma (31 días que quedaban + 31
      nuevos = 62). Abierto desde el 7/09.
- [ ] **Las 6 preguntas al proveedor de hardware.** La sexta —¿da plazo de pago?— decide el
      modelo entero (comisión o comprar a gremio).
- [ ] **¿Repo privado?** Hoy es público: se lee todo el código. Hacerlo privado tiene dos
      consecuencias que hay que resolver ANTES del clic:
      - **Rompe las actualizaciones automáticas** de todos los clientes: la app baja las
        versiones de las releases de este repo. Primero hay que mudar las releases a un repo
        público aparte (es trabajo mío, y necesita que crees ese repo y un token).
      - **GitHub Actions deja de ser gratis ilimitado**: un repo privado tiene 2.000
        minutos/mes, y el build de Windows cuenta doble.

## 🛠️ 8. Pendientes técnicos (no son tareas tuyas)

**En curso:**

- **La landing nueva** (rama `landing/de-punta-a-punta`). Espera las tres promesas de §7.
- **Suscripción programada.** Cargar la tarjeta durante la prueba y que el primer cobro
  salga el día en que termina; hoy no hay ningún botón para pagar antes del bloqueo. Mercado
  Pago acepta agendar el cobro en una suscripción por link; falta probarlo con tarjeta, y
  para eso hacen falta las cuentas de prueba de §0. Tiene que estar antes del 5/11.
- **La sesión que no se cierra sola.** Faltan tres fases: que un corte de red no se tome
  por sesión muerta (~5 h), que el guardado de la sesión aguante al antivirus (~2 h) y
  registrar en el servidor por qué se cerró cada sesión (~2 h).

**Para después:**

- **Cantina, conteo rápido y conciliación con Mercado Pago.** Diseño decidido, sin código.
  La conciliación necesita una aplicación de Mercado Pago nueva, creada por vos.
- **Firma sin conexión (ADR-012).** Hoy, sin internet y sin turno abierto, se cobra sin
  firma (la caja nunca para). Hacerlo bien exige guardar si la firma fue verificada o
  declarada y mostrarlo en el cierre: ~6 h.
- **Spring Boot 4.** El backend quedó en el último parche de la 3.2; la 3.2 ya no recibe
  parches propios. Pasar a la 4 es un proyecto aparte.
- **electron-updater.** Quedan 5 avisos de seguridad, todos sin exposición real hoy. Se
  actualiza junto con la mudanza de releases, que obliga a probar una actualización real.
