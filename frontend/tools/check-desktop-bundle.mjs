// ============================================
// VELTRONIK - GUARDIÁN DEL BUNDLE DE ESCRITORIO (Fase 4)
// ============================================
// Verifica que el instalador NO se lleve código de cobro. Es el criterio de aceptación
// de la fase, escrito como programa: si alguien agrega un import y el SDK de Mercado
// Pago vuelve a entrar, esto se pone rojo en CI en vez de descubrirse en la máquina de
// un cliente seis meses después.
//
// Por qué hace falta un guardián y no alcanza con "acordarse": el arrastre es indirecto.
// Ya pasó una vez mientras se armaba esta fase — SettingsPage importaba CardCheckout, y
// Ajustes sí va en el escritorio, así que el SDK entraba por la ventana de atrás aunque
// el formulario no se dibujara nunca.
//
// Uso:  node tools/check-desktop-bundle.mjs   (o `pnpm run check:desktop-bundle`)

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

// Carpeta a revisar. Acepta un argumento para poder probar el propio guardián:
//   node tools/check-desktop-bundle.mjs dist   → DEBE fallar (el bundle web sí cobra)
// Un chequeo que no se puede ver fallar no prueba nada.
const BUNDLE_DIR = process.argv[2] || 'dist-desktop';

// Marcas que delatan CÓDIGO DE COBRO dentro del bundle. Sensibles a mayúsculas, y a
// propósito.
//
// OJO CON EL FALSO POSITIVO OBVIO: buscar "mercadopago" a secas NO sirve. En minúscula
// es también el medio de pago de la cuota de un socio ('efectivo' | 'transferencia' |
// 'mercadopago', ver PaymentsPage y el mapa de etiquetas de lib/utils.js), que es
// operación pura y TIENE que viajar en el escritorio. La primera versión de este script
// se puso roja por eso.
//
// Estas tres, en cambio, solo existen si entró el SDK o el formulario de tarjeta:
const FORBIDDEN = [
  { marker: 'sdk.mercadopago.com', why: 'CDN del SDK de Mercado Pago (lo carga loadMercadoPago)' },
  { marker: 'MercadoPago', why: 'el global window.MercadoPago que expone el SDK' },
  { marker: 'cardPaymentBrick', why: 'contenedor del Card Payment Brick (CardCheckout)' },
];

// Extensiones que vale la pena revisar (los .map son ruido: repiten el fuente).
const SCANNED = new Set(['.js', '.mjs', '.cjs', '.html', '.css']);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCANNED.has(extname(entry))) out.push(full);
  }
  return out;
}

if (!existsSync(BUNDLE_DIR)) {
  console.error(`✗ No existe ${BUNDLE_DIR}/. Corré primero: pnpm run build:desktop`);
  process.exit(1);
}

const hits = [];
for (const file of walk(BUNDLE_DIR)) {
  const content = readFileSync(file, 'utf8');
  for (const { marker, why } of FORBIDDEN) {
    if (content.includes(marker)) hits.push({ file, marker, why });
  }
}

if (hits.length > 0) {
  console.error('✗ El bundle de escritorio contiene código de cobro:\n');
  for (const { file, marker, why } of hits) {
    console.error(`  ${file}`);
    console.error(`    → "${marker}"  (${why})`);
  }
  console.error('\nAlgún archivo del árbol de escritorio lo está importando. Buscá el import');
  console.error('estático que lo arrastra: no alcanza con esconder la pantalla detrás de un if,');
  console.error('hay que no importarla (ver routes/DesktopRoutes.jsx).');
  process.exit(1);
}

console.log(`✓ ${BUNDLE_DIR}/ limpio: sin SDK de Mercado Pago ni formulario de tarjeta.`);
