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
// Baja Inter (la tipografía del sitio y de la app) de Google Fonts cada vez, en TTF: resvg
// no lee WOFF2, que es lo que hay en public/fonts.
// ============================================

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const PUBLIC = new URL('../public/', import.meta.url);
const AZUL = '#3b82f6';

// Google Fonts entrega TTF cuando el pedido no dice ser un navegador moderno.
async function bajarFuentes() {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800;900')).text();
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) => m[1]);
  if (urls.length < 5) throw new Error('No pude bajar las fuentes de Google Fonts');
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

// 2) La tarjeta (2026-09-23): el mismo mensaje y los mismos carteles que el hero de la página.
//    A la izquierda lo que se dice; a la derecha lo que se ve en el mostrador: un socio al día
//    (verde, con sus días) y uno vencido (rojo, con la X). Se entiende sin leer.
const MARCA = 'M17 115 L367 2 L45 776 L72 347 L0 368 Z M345 170 L598 88 L98 735 Z';
const VERDE = '#22c55e', ROJO = '#ef4444';
const cartel = (y, color, cuadro, nombre, estado) => `
  <rect x="770" y="${y}" width="370" height="150" rx="24" fill="${color}" fill-opacity="0.09" stroke="${color}" stroke-opacity="0.35" stroke-width="2"/>
  <rect x="792" y="${y + 20}" width="110" height="110" rx="18" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-opacity="0.45" stroke-width="2"/>
  ${cuadro}
  <text x="926" y="${y + 68}" font-family="Inter" font-weight="800" font-size="30" fill="#f1f5f9" letter-spacing="-0.8">${nombre}</text>
  <text x="926" y="${y + 104}" font-family="Inter" font-weight="600" font-size="20" fill="${color}">${estado}</text>`;
writeFileSync(new URL('og.png', PUBLIC), render(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="brillo" cx="0.85" cy="0.1" r="0.7">
      <stop offset="0" stop-color="${AZUL}" stop-opacity="0.22"/><stop offset="1" stop-color="${AZUL}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="marca" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#93bbfd"/><stop offset="1" stop-color="${AZUL}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#0b0e14"/>
  <rect width="1200" height="630" fill="url(#brillo)"/>
  <g transform="translate(72 70) scale(0.06)"><path d="${MARCA}" fill="url(#marca)"/></g>
  <text x="120" y="105" font-family="Inter" font-weight="800" font-size="34" fill="#f1f5f9" letter-spacing="-1">Veltronik</text>

  <text x="72" y="258" font-family="Inter" font-weight="900" font-size="74" fill="#f1f5f9" letter-spacing="-3">La cuota se cobra</text>
  <text x="72" y="342" font-family="Inter" font-weight="900" font-size="74" fill="#609afa" letter-spacing="-3">en la puerta.</text>
  <text x="72" y="412" font-family="Inter" font-weight="500" font-size="26" fill="#94a3b8">El sistema del mostrador para gimnasios.</text>
  <text x="72" y="450" font-family="Inter" font-weight="500" font-size="26" fill="#94a3b8">Funciona sin internet. 14 días gratis.</text>
  <text x="72" y="560" font-family="Inter" font-size="26"><tspan font-weight="700" fill="#f1f5f9">veltronik.com.ar</tspan><tspan font-weight="500" fill="#64748b">  ·  Hecho en Posadas, Misiones</tspan></text>

  ${cartel(150, VERDE,
    `<text x="847" y="${150 + 88}" text-anchor="middle" font-family="Inter" font-weight="900" font-size="58" fill="#4ade80" letter-spacing="-2">18</text>
     <text x="847" y="${150 + 114}" text-anchor="middle" font-family="Inter" font-weight="700" font-size="14" fill="#4ade80" letter-spacing="2">DÍAS</text>`,
    'Martina López', 'Al día · pasá')}
  ${cartel(330, ROJO,
    `<path d="M822 ${330 + 50} l50 50 M872 ${330 + 50} l-50 50" stroke="#f87171" stroke-width="9" stroke-linecap="round"/>`,
    'Tomás Rivero', 'Vencida hace 4 días')}
</svg>`, 1200));

// 3) Ícono del iPhone: opaco, porque iOS le pone fondo negro a uno transparente.
const L = 120, A = Math.round(L * 600 / 776);
writeFileSync(new URL('apple-touch-icon.png', PUBLIC), render(`<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
  <defs>${recolor}</defs><rect width="180" height="180" fill="#0b0e14"/>${logoRecoloreado((180 - A) / 2, (180 - L) / 2, A, L)}</svg>`, 180));

console.log('Listo: og.png, logo-claro.png y apple-touch-icon.png en public/');
