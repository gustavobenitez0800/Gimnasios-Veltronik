// ============================================
// Las imágenes de la web, generadas a partir de public/logo.png
// ============================================
//   · public/og.png               la tarjeta de 1200x630 que muestran WhatsApp, Facebook
//                                 y LinkedIn al pegar el link
//   · public/logo-claro.png       el logo en el azul del sitio, para fondos oscuros
//   · public/apple-touch-icon.png 180x180 opaco, para la pantalla de inicio del iPhone
//
// POR QUÉ UN SCRIPT Y NO UNA IMAGEN HECHA A MANO: el logo original es azul marino sobre
// transparente y el sitio es casi negro, así que hacía falta una versión clara. Se
// recolorea la SILUETA del original —no se redibuja la marca—, y si mañana cambia el texto
// de la tarjeta, se vuelve a correr esto en vez de abrir un editor.
//
// Vive en tools/ y no en scripts/ porque el .gitignore de la raíz ignora TODA carpeta
// scripts/ (ahí van las herramientas con credenciales), y esa regla no se afloja.
//
// CÓMO SE CORRE (desde landing/):
//   npm install --no-save @resvg/resvg-js@2
//   node tools/generar-imagenes.mjs
//
// Baja las fuentes del sitio (Space Grotesk e Inter) de Google Fonts cada vez: no se
// guardan en el repo.
// ============================================

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const PUBLIC = new URL('../public/', import.meta.url);
const AZUL = '#3b82f6';

// Google Fonts entrega TTF cuando el pedido no dice ser un navegador moderno.
async function bajarFuentes() {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@500;700&family=Space+Grotesk:wght@700')).text();
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) => m[1]);
  if (urls.length < 3) throw new Error('No pude bajar las fuentes de Google Fonts');
  const dir = mkdtempSync(join(tmpdir(), 'veltronik-fuentes-'));
  return Promise.all(urls.map(async (u, i) => {
    const archivo = join(dir, `fuente${i}.ttf`);
    writeFileSync(archivo, Buffer.from(await (await fetch(u)).arrayBuffer()));
    return archivo;
  }));
}

const fuentes = await bajarFuentes();
const logo = readFileSync(new URL('logo.png', PUBLIC)).toString('base64');

const render = (svg, ancho) => new Resvg(svg, {
  fitTo: { mode: 'width', value: ancho },
  font: { fontFiles: fuentes, loadSystemFonts: false, defaultFontFamily: 'Inter' },
}).render().asPng();

// Pinta la silueta del logo de otro color, respetando su forma exacta.
const recolor = `<filter id="recolor" x="0" y="0" width="100%" height="100%">
  <feFlood flood-color="${AZUL}"/><feComposite in2="SourceAlpha" operator="in"/></filter>`;
const logoRecoloreado = (x, y, ancho, alto) =>
  `<image href="data:image/png;base64,${logo}" x="${x}" y="${y}" width="${ancho}" height="${alto}" filter="url(#recolor)"/>`;

// 1) Logo claro
writeFileSync(new URL('logo-claro.png', PUBLIC), render(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="776"><defs>${recolor}</defs>${logoRecoloreado(0, 0, 600, 776)}</svg>`, 600));

// 2) La tarjeta
const H = 250, W = Math.round(H * 600 / 776);
writeFileSync(new URL('og.png', PUBLIC), render(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>${recolor}
    <radialGradient id="brillo" cx="0.2" cy="0.45" r="0.6">
      <stop offset="0" stop-color="${AZUL}" stop-opacity="0.22"/><stop offset="1" stop-color="${AZUL}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0e14"/>
  <rect width="1200" height="630" fill="url(#brillo)"/>
  <rect x="0" y="622" width="1200" height="8" fill="${AZUL}"/>
  ${logoRecoloreado(92, (630 - H) / 2 - 10, W, H)}
  <g font-family="Space Grotesk" font-weight="700">
    <text x="370" y="200" font-size="40" fill="${AZUL}" letter-spacing="-0.5">Veltronik</text>
    <text x="370" y="276" font-size="52" fill="#f1f5f9" letter-spacing="-1">El software para gimnasios</text>
    <text x="370" y="338" font-size="52" fill="#f1f5f9" letter-spacing="-1">que también te abre la puerta.</text>
  </g>
  <text x="370" y="410" font-family="Inter" font-weight="500" font-size="25" fill="#94a3b8">Socios · Cuotas · Caja · Molinete facial · Sin internet</text>
  <text x="370" y="500" font-family="Inter" font-size="27"><tspan font-weight="700" fill="#f1f5f9">veltronik.com.ar</tspan><tspan font-weight="500" fill="#94a3b8">  ·  Hecho en Misiones, Argentina</tspan></text>
</svg>`, 1200));

// 3) Ícono del iPhone: opaco, porque iOS le pone fondo negro a uno transparente.
const L = 120, A = Math.round(L * 600 / 776);
writeFileSync(new URL('apple-touch-icon.png', PUBLIC), render(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
  <defs>${recolor}</defs><rect width="180" height="180" fill="#0b0e14"/>${logoRecoloreado((180 - A) / 2, (180 - L) / 2, A, L)}</svg>`, 180));

console.log('Listo: og.png, logo-claro.png y apple-touch-icon.png en public/');
