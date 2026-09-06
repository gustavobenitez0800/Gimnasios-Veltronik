// ============================================
// VELTRONIK - EL BINARIO NATIVO, PARA ELECTRON Y NO PARA NODE
// ============================================
// Baja el binario de `better-sqlite3` compilado contra el ABI de ELECTRON.
//
// POR QUÉ HACE FALTA
// `better-sqlite3` es un módulo nativo, y su script de instalación baja el binario del
// runtime que lo está instalando: Node. Pero acá quien lo va a cargar es Electron, que trae
// SU PROPIO Node con OTRO ABI (Electron 28 → módulos v119; el Node de la máquina, otro
// número). Con el binario equivocado, `require('better-sqlite3')` tira "was compiled against
// a different Node.js version" y el núcleo local queda apagado.
//
// EL SÍNTOMA SI ESTO FALTA ES ENGAÑOSO: la app arranca perfecta y anda bien mientras haya
// internet. Lo que no funciona es lo único que este módulo vino a hacer —guardar la copia
// para cuando NO haya— y eso no se descubre hasta el corte, en el gimnasio, sin nadie mirando.
// Por eso corre en cada `pnpm install` y no "cuando haga falta".
//
// (En el empaquetado, electron-builder rebuildea los módulos nativos por su cuenta. Esto es
// para la máquina de quien desarrolla y para poder correr `pnpm run humo:nucleo`.)
//
// NUNCA ROMPE LA INSTALACIÓN. Sale con 0 pase lo que pase: en el build del portal web no
// hay Electron y no hay nada que bajar, y ahí esto no tiene por qué ser un error.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

/** Avisa y se va, sin romper nada. */
function salir(motivo) {
  console.log(`[veltronik] núcleo local: ${motivo}`);
  process.exit(0);
}

// ── ¿Qué Electron hay? ──
let electronVersion = null;
try {
  const pkg = require.resolve('electron/package.json');
  electronVersion = JSON.parse(readFileSync(pkg, 'utf8')).version;
} catch {
  salir('sin Electron instalado, no hay binario que preparar (build web).');
}

// ── ¿Dónde está better-sqlite3? ──
// Con pnpm el paquete vive en el store y `node_modules` son enlaces, así que se pregunta por
// el `package.json` en vez de armar la ruta a mano.
let paquete = null;
try {
  paquete = dirname(require.resolve('better-sqlite3/package.json'));
} catch {
  salir('better-sqlite3 no está instalado todavía.');
}

const prebuildInstall = join(paquete, '..', 'prebuild-install', 'bin.js');
if (!existsSync(prebuildInstall)) {
  salir('no se encontró prebuild-install; lo va a resolver electron-builder al empaquetar.');
}

console.log(`[veltronik] núcleo local: binario de SQLite para Electron ${electronVersion}…`);

const r = spawnSync(
  process.execPath,
  [prebuildInstall, '--runtime=electron', `--target=${electronVersion}`, '--tag-prefix=v'],
  { cwd: paquete, stdio: 'inherit' },
);

if (r.status !== 0) {
  // Que no haya prebuild para esta combinación de sistema y ABI es posible (una arquitectura
  // rara, una versión de Electron recién salida). No se compila desde el fuente acá —eso
  // pediría Python y MSVC en la máquina de cualquiera que clone el repo— y el empaquetado
  // tiene su propio camino. Se avisa fuerte y se sigue.
  console.warn(
    '[veltronik] núcleo local: NO se pudo bajar el binario para Electron. La app va a andar,\n'
    + '            pero SIN copia local: en el escritorio no va a funcionar sin internet.',
  );
}

process.exit(0);
