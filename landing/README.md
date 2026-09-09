# Veltronik — sitio público

La página que capta clientes y los manda a registrarse al portal. Es un proyecto
**aparte** del `frontend/`, y se deploya solo.

```bash
cd landing
npm install
npm run dev      # http://localhost:4321
npm run build    # genera dist/ + .vercel/output/
```

---

## Por qué está separado del portal

El portal (`frontend/`) es una SPA de React con **HashRouter**. Para Google eso es dos
problemas encimados:

1. La primera respuesta del servidor es un `<div id="root">` vacío. El buscador tiene
   que ejecutar JavaScript para ver algo, lo hace con demora y lo prioriza menos.
2. Las rutas viven **después del `#`** (`/#/register`). Todo lo que va después del
   numeral **no se manda al servidor**: para Google, `veltronik.com.ar/#/register` y
   `veltronik.com.ar/` son la misma URL. No se pueden posicionar páginas distintas.

Encima, hoy la raíz del portal (`/`) muestra el **formulario de login** — lo peor que le
podés ofrecer a alguien que llegó buscando "software para gimnasios".

Esta landing es HTML estático de verdad: el contenido ya está escrito en la respuesta.
Por eso son dos proyectos y no uno.

> **Ojo con los links al portal.** Por el HashRouter, un link a `${APP_URL}/register`
> cae en el login, no en el registro. Siempre usar el helper `appRoute()` de
> `src/lib/site.js`, que arma el `#` correcto.

---

## De dónde sale cada dato

Casi nada está escrito a mano. Se lee en **build time** (no en el navegador):

| Dato | Fuente |
|---|---|
| Precio y features del plan | `GET /api/public/plans` del backend en Cloud Run |
| Versión y peso del instalador | API de GitHub Releases |
| Link de descarga | `/api/descargar` lo resuelve en cada click |

**Por qué no se hardcodea el precio:** ya pasó una vez en el portal — el precio estaba
escrito a mano en el frontend, se bajó en el servidor y la pantalla siguió mostrando el
viejo. El cliente leía un número y le cobraban otro. En una página indexada por Google
es peor todavía, porque el número viejo queda en la caché del buscador.

**Por qué en build time y no en el navegador:** el backend solo acepta el origen del
portal (`FRONTEND_URL`), así que un `fetch` desde `veltronik.com.ar` da **403 por CORS**.
Desde el build no hay navegador y no hay CORS. De paso, el precio queda escrito en el
HTML que recibe Google en vez de ponerlo un script.

⚠️ **Consecuencia:** si cambiás el precio en el backend, hay que **redeployar la landing**
(en Vercel, botón "Redeploy"). No se actualiza sola.

Si el backend o GitHub no contestan durante el build, cada módulo cae en su respaldo y
el build **no se rompe** (ver `src/lib/plans.js` y `src/lib/release.js`).

---

## El link de descarga

`veltronik.com.ar/api/descargar` es la **única** ruta que corre en el servidor.

Tiene que ser dinámica porque el instalador se llama `Veltronik-Setup-2.6.30.exe`, con
la versión adentro. El atajo clásico de GitHub (`/releases/latest/download/<nombre>`)
no sirve: el nombre cambia en cada release y el link quedaría muerto.

La gracia es que **este link nunca cambia**. Se puede poner en un mail, un cartel o un
WhatsApp y va a seguir bajando la última versión dentro de dos años.

> Devuelve el último release **publicado**. Los borradores no cuentan — y el workflow de
> release deja la release en borrador, así que si alguien se olvida de publicarla, acá
> sigue saliendo la anterior. Es lo correcto: mejor ofrecer una versión vieja que una que
> nadie revisó.

---

## Deploy en Vercel

Proyecto **nuevo**, distinto al del portal.

1. **Add New → Project** → el mismo repo.
2. **Root Directory: `landing`** ← el paso que más se olvida.
3. Framework: Astro (lo detecta solo). No toques los comandos de build.
4. Variables de entorno:

   | Variable | Valor |
   |---|---|
   | `PUBLIC_APP_URL` | `https://app.veltronik.com.ar` |
   | `PUBLIC_API_URL` | `https://v2-backend-7rpsadmoka-rj.a.run.app/api` |

   Las dos son opcionales: sin ellas usa los valores por defecto de `src/lib/site.js` y
   `src/lib/plans.js`, que apuntan al Vercel actual. Así los botones **funcionan desde el
   primer deploy**, antes de que el DNS esté listo.

5. **Domains**: `veltronik.com.ar` (principal) y `www.veltronik.com.ar` → redirect.
6. En **NIC.ar**, cargar los registros que Vercel te dicte.

### Los otros dos dominios

- `app.veltronik.com.ar` → apuntar al proyecto del **portal** (el que ya existe).
- `veltronik.online` → **redirect 301** a `veltronik.com.ar`. No poner el mismo contenido
  en los dos: Google lo lee como contenido duplicado y reparte la fuerza entre ambos.

---

## Después del primer deploy

- [ ] **Google Search Console**: verificar el dominio y mandar
      `https://veltronik.com.ar/sitemap-index.xml`.
- [ ] **Poner el portal en `noindex`** (`frontend/index.html`). Hoy tiene
      `<meta name="robots" content="index, follow">` y compite contra la landing por las
      mismas búsquedas — con una página que es un formulario de login.
- [ ] **Imagen para compartir** (`public/og.png`, 1200×630). Hoy el OG usa el logo, que
      en WhatsApp y Facebook se ve chico y descentrado.
- [ ] **WhatsApp comercial** en `src/lib/site.js` (`CONTACTO.whatsapp`, vacío hoy).
- [ ] **Perfil de Empresa en Google**.
