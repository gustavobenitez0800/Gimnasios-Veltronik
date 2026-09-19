# 📋 Tareas manuales — Gustavo

> Lo que **solo vos** podés hacer: paneles, credenciales, pruebas con la app en la mano y
> decisiones. Actualizado: **2026-09-19**. Tachá con `[x]` a medida que avances.
>
> La versión anterior (15/08) se reemplazó entera: hablaba de Railway, del kiosco y de un
> flujo de releases que ya no existe. Está en la historia de git si hace falta.

---

## 🔴 1. Rotar la contraseña de la base — urgente

El repositorio es **público** y `scripts/.env.migration` (commit `c469ebb`, borrado en
`6652c1a`) dejó en la historia de git dos cadenas de conexión de Postgres **con contraseña**.
Borrarlo no las sacó: siguen legibles. Rotar es lo único que cierra el agujero.

Hacerlo **a primera hora** (el gimnasio está vacío): entre el paso 2 y el 4 el backend queda
sin base unos 3–5 minutos.

- [ ] 1. Supabase → *Project Settings* → *Database* → **Reset database password**. Copiala.
- [ ] 2. GitHub → el repo → *Settings* → *Secrets and variables* → *Actions*: actualizar
      **`DB_PASSWORD`** y **`DB_URL`** (la URL lleva la contraseña adentro).
- [ ] 3. *Actions* → **Deploy to Google Cloud Run** → *Run workflow* sobre `main`.
- [ ] 4. Cuando termine: abrir la app y cobrar algo de prueba (o mirar que el lobby cargue).
- [ ] 5. Supabase → *Logs* → conexiones a la base: mirar si hubo accesos que no reconozcas.

ℹ️ **El backup no se toca.** Usa su propio rol (`veltronik_backup`) con su propia clave
(`.clave-backup`), creado el 15/09, después de la filtración. Rotar la de `postgres` no lo
afecta.

⛔ La contraseña no se pega en ningún chat.

## 🔴 2. El 30/09 — la renovación de SEKUR

Es el primer cobro recurrente que pasa por Cloud Run (el webhook se verificó con el
simulador, pero el evento real `subscription_authorized_payment` entra por otro camino).

- [ ] El 30/09 (o el 1/10): en el panel, que el período de SEKUR se haya corrido a octubre.
- [ ] Si se renovó bien → **apagar Railway**, que seguís pagando sin usar.
- ℹ️ Si la tarjeta rebota, desde la V85 SEKUR tiene **12 días** de gracia, no 3: Mercado Pago
  reintenta durante 10.

## 🧪 3. Probar con la app en la mano

Todo esto tiene tests en verde, y ninguno lo usó nunca un humano. El 15/09 un bug del
cierre offline apareció solo al probarlo en una máquina real, con 462 tests pasando.

- [ ] **Alta de cuenta** — con el alias `gustavobenitezlink+prueba1@gmail.com` (la cuenta
      habitual daría el camino de la sucursal adicional). Faltan:
  - [ ] 2b. *Ajustes*: tiene que decir `30/09/2026 (14 días de prueba restantes)` — o la
        fecha que corresponda al día del alta + 14.
  - [ ] 3. Cargar un socio y cobrarle: tiene que quedar al día.
  - [ ] 4. **Segunda sucursal** con el mismo usuario: el lobby dice "Sumá otro local", NO
        regala prueba y al entrar pide el pago.
- [ ] **Importar socios** — en la cuenta de prueba: crear los aranceles "Pase libre",
      "Musculación 3 veces", "Funcional" y "Personalizado", y en *Socios → Importar* subir
      `OneDrive\Veltronik-Ventas\Gimnasio demo - socios.xlsx`. Esperado: 120 nuevos, 0
      errores. Después probar **Deshacer**, y volver a importarlo.
- [ ] **Offline de punta a punta** — los seis caminos con el wifi apagado (llegaste al paso 3).
- [ ] **Check-in por QR** desde un celular.
- [ ] **Restaurar el backup** ahora que la base tiene la V85.

## 🔍 4. Dos consultas para el SQL Editor de Supabase

Lo que los tests no pueden ver: el estado REAL de producción. Correrlas **después** del
próximo deploy.

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

- [ ] Rotar los tokens de los 5 carteles de `checkin_point` (pendiente desde que se cerró el
      RLS el 6/9: con la clave `anon` se podían leer). ⚠️ **Al rotar, el QR impreso deja de
      andar**: hay que reimprimir el cartel en el gimnasio. Coordinarlo con cada uno.

## 🤔 6. Decisiones que solo podés tomar vos

- [ ] **Pago adelantado: ¿se suma o arranca de cero?** Hoy se suma (31 días que quedaban + 31
      nuevos = 62). Abierto desde el 7/09.
- [ ] **Las 6 preguntas al proveedor de hardware.** La sexta —¿da plazo de pago?— decide el
      modelo entero (comisión o comprar a gremio).
- [ ] **El dominio a tu nombre.** `veltronik.com.ar` figura a nombre de DATTATEC.COM S.R.L.
      Se pide el cambio a tu CUIT: es un trámite.
- [ ] **¿Repo privado?** Hoy es público: se lee todo el código. Hacerlo privado tiene dos
      consecuencias que hay que resolver ANTES del clic:
      - **Rompe las actualizaciones automáticas** de todos los clientes: la app baja las
        versiones de las releases de este repo. Primero hay que mudar las releases a un repo
        público aparte (es trabajo mío, y necesita que crees ese repo y un token).
      - **GitHub Actions deja de ser gratis ilimitado**: un repo privado tiene 2.000
        minutos/mes, y el build de Windows cuenta doble.

## 🛠️ 7. Pendientes técnicos que quedaron afuera a propósito (no son tareas tuyas)

- **Firma sin conexión (ADR-012).** Hoy, sin internet y sin turno abierto, se cobra sin
  firma (la caja nunca para). Hacerlo bien exige guardar si la firma fue verificada o
  declarada y mostrarlo en el cierre: ~6 h. El agujero real es angosto (un lunes con
  internet caído desde el domingo).
- **Spring Boot 4.** El backend quedó en el último parche de la 3.2 con Tomcat y el driver al
  día; la 3.2 ya no recibe parches propios. Pasar a la 4 es un proyecto aparte.
- **electron-updater.** Quedan 5 avisos de seguridad, todos sin exposición real hoy. Se
  actualiza junto con la mudanza de releases, que obliga a probar una actualización real.
