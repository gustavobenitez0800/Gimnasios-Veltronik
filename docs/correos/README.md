# Los correos que manda Veltronik (vía Supabase Auth)

La app dispara solo dos correos de Supabase: **confirmar la cuenta** (al registrarse con email
y contraseña) y **recuperar la contraseña**. Los empleados se dan de alta desde el backend con
el correo ya confirmado y sin mail (`SupabaseAdminService`), y el resto de las plantillas de
Supabase (magic link, invitación, cambio de correo, reautenticación) la app no las usa.

Las plantillas viven en el panel de Supabase, no en el código. Estas copias son la fuente: si
se cambia algo, se cambia acá y se pega allá.

| Plantilla en Supabase | Asunto | Archivo |
|---|---|---|
| Confirm signup | `Confirmá tu cuenta de Veltronik` | `confirmar-cuenta.html` |
| Reset password | `Recuperar tu contraseña de Veltronik` | `recuperar-contrasena.html` |

## ⚠️ Por qué decía "Supabase Auth" (y por qué es más grave que el nombre)

Sin un servidor de correo propio, Supabase manda desde `noreply@mail.app.supabase.io` con el
nombre "Supabase Auth", y **eso no se puede cambiar**. Además, según su documentación
(<https://supabase.com/docs/guides/auth/auth-smtp>), ese servicio de fábrica:

- **solo entrega a los miembros del equipo del proyecto**: a cualquier otra dirección la
  rechaza con "Email address not authorized". O sea que un gimnasio que se registra con
  email y contraseña no recibe el correo de confirmación, y un cliente que olvidó la
  contraseña no recibe el de recuperarla;
- manda **2 correos por hora** en total, para todo el proyecto.

El nombre "Veltronik", el remitente `no-reply@veltronik.com.ar` y la entrega a cualquier
dirección se arreglan con lo mismo: el SMTP propio de abajo.

## 1. El servidor de correo (Resend)

Resend porque Supabase lo trae integrado y el plan gratis alcanza de sobra (3.000 correos
por mes, 100 por día). Lo tiene que hacer Gustavo: es crear una cuenta y tocar el DNS.

1. Crear la cuenta en <https://resend.com> y agregar el dominio `veltronik.com.ar`
   (Domains → Add Domain, región São Paulo si la ofrece).
2. Resend muestra 3 o 4 registros DNS (un TXT `resend._domainkey`, y un MX y un TXT para el
   subdominio `send`). Cargarlos en **Donweb** → Mis Dominios → Nameservers y Zona DNS →
   Configurar manualmente. ⛔ No en NIC.ar, y no con el "Asistente de configuración" de
   Donweb. Son registros de subdominios: no tocan el sitio ni el MX del dominio pelado.
3. Esperar a que Resend marque el dominio como **Verified** (de minutos a unas horas).
4. Resend → API Keys → crear una con permiso **Sending access**, solo para `veltronik.com.ar`.

## 2. Supabase: el remitente

Authentication → Emails → **SMTP Settings** → Enable Custom SMTP:

| Campo | Valor |
|---|---|
| Sender email | `no-reply@veltronik.com.ar` |
| Sender name | `Veltronik` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la API key del paso 1.4 |

Después, en Authentication → **Rate Limits**, el límite de correos sube solo a 30 por hora;
alcanza para empezar.

## 3. Supabase: las plantillas

Authentication → Emails → **Templates**. En cada una de las dos de la tabla: poner el asunto
y reemplazar todo el cuerpo (pestaña "Source") por el contenido del archivo.

El logo sale de `https://veltronik.com.ar/logo-claro.png` (la landing), con dirección completa
y en PNG: Gmail no muestra SVG. Antes se rompía porque la plantilla lo buscaba en
`gimnasio-veltronik-veltroniks-projects.vercel.app/assets/LogoPrincipalVeltronik.png`, una
dirección vieja de Vercel que da 404.

🪤 En la vista previa del panel de Supabase el logo sale roto igual: la página de Supabase solo
deja mostrar imágenes de sus dominios (y de GitHub, Google, Vercel). En el correo de verdad se ve.

## 4. El link de "Confirm signup" usa `token_hash` (aplicado el 29/10/2026)

El botón de `confirmar-cuenta.html` apunta a:

```
{{ .SiteURL }}/?alta=1&token_hash={{ .TokenHash }}&type=email
```

y no a `{{ .ConfirmationURL }}`. Con eso el link abre la sesión en cualquier navegador y sin el
límite de 5 minutos que tiene el `?code=` de PKCE (ver `frontend/src/lib/vueltaDelCorreo.js`).
Se cambió recién después de publicar el frontend que sabe canjearlo (PR #51).

🔴 Si algún día se vuelve a una versión del portal anterior al PR #51, hay que volver también
este link a `{{ .ConfirmationURL }}`: la versión vieja no canjea el `token_hash` y los links no
confirmarían a nadie.

## Cómo probarlo

Con el SMTP puesto, pedir "¿Olvidaste tu contraseña?" desde el login con un correo que **no**
sea del equipo de Supabase. Tiene que llegar de "Veltronik", con el logo y el asunto en
castellano.
