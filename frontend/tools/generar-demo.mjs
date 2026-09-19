// ============================================
// El padrón del GIMNASIO DE DEMO, como Excel para el importador
// ============================================
// Para mostrar Veltronik sin inventar pantallas ni usar los datos de un cliente.
//
// Las personas son FICTICIAS: nombres y apellidos comunes combinados al azar, DNI y teléfonos
// que no son de nadie. Pero la mezcla es la de un gimnasio de verdad, porque una demo con todo
// en verde no le muestra al dueño lo que el sistema hace por él:
//
//   · ~60% al día · ~15% vence esta semana · ~25% vencidos (algunos hace meses)
//   · algunos sin arancel, algunos dados de baja, algunos sin teléfono
//
// Las fechas salen de HOY. Correrlo de nuevo antes de cada demo, o los "vence esta semana"
// de hoy son los vencidos de la semana que viene.
//
// CÓMO SE USA (desde frontend/):
//   node tools/generar-demo.mjs ["ruta/salida.xlsx"]
//
// Y en Veltronik, con la cuenta del gimnasio de demo:
//   1. Aranceles: crear "Pase libre", "Musculación 3 veces", "Funcional" y "Personalizado".
//   2. Socios → Importar → elegir el archivo → revisar → importar.
//   Es la misma pantalla que se le muestra al cliente: la demo arranca migrando.
//
// Es determinístico (misma semilla, mismos socios): dos corridas el mismo día dan el mismo
// archivo, y reimportarlo da todo "sin cambios".
// ============================================

import * as fs from 'node:fs';
import * as XLSX from 'xlsx';

// La versión ESM de SheetJS no escribe archivos en Node si no se le pasa fs.
XLSX.set_fs(fs);

const salida = process.argv[2] || 'Gimnasio demo - socios.xlsx';
const CANTIDAD = 120;

// Un generador con semilla: el mismo padrón cada vez.
let semilla = 20260919;
const azar = () => {
  semilla = (semilla * 1103515245 + 12345) % 2147483648;
  return semilla / 2147483648;
};
const uno = (lista) => lista[Math.floor(azar() * lista.length)];

const NOMBRES = ['Juan', 'María', 'Lucas', 'Sofía', 'Mateo', 'Valentina', 'Santiago', 'Camila', 'Benjamín',
  'Martina', 'Tomás', 'Lucía', 'Joaquín', 'Florencia', 'Nicolás', 'Agustina', 'Facundo', 'Micaela',
  'Gonzalo', 'Carolina', 'Franco', 'Julieta', 'Ezequiel', 'Rocío', 'Matías', 'Antonella', 'Diego',
  'Paula', 'Federico', 'Milagros', 'Leandro', 'Brenda', 'Cristian', 'Daiana', 'Gastón', 'Natalia'];
const APELLIDOS = ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez',
  'Romero', 'Sosa', 'Benítez', 'Ramírez', 'Torres', 'Acosta', 'Flores', 'Ruiz', 'Álvarez', 'Giménez',
  'Medina', 'Aguirre', 'Ríos', 'Cabrera', 'Ortiz', 'Duarte', 'Ledesma', 'Villalba', 'Ayala', 'Núñez'];
const ARANCELES = ['Pase libre', 'Pase libre', 'Pase libre', 'Musculación 3 veces', 'Musculación 3 veces',
  'Funcional', 'Personalizado'];

const hoy = new Date();
const enDias = (n) => {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const filas = [['Nombre', 'Apellido', 'DNI', 'Teléfono', 'Email', 'Fecha de nacimiento', 'Alta', 'Vencimiento', 'Arancel', 'Estado']];
const usados = new Set();

for (let i = 0; i < CANTIDAD; i++) {
  const nombre = uno(NOMBRES);
  const apellido = uno(APELLIDOS);

  let dni;
  do { dni = String(Math.floor(22_000_000 + azar() * 26_000_000)); } while (usados.has(dni));
  usados.add(dni);

  // Posadas: 3764 + seis cifras. Uno de cada seis no dejó teléfono.
  const telefono = azar() < 0.83 ? `3764${String(Math.floor(azar() * 1_000_000)).padStart(6, '0')}` : '';
  const email = azar() < 0.4
    ? `${nombre}.${apellido}${i}@ejemplo.com`.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    : '';

  const edad = 16 + Math.floor(azar() * 45);
  const nacimiento = enDias(-(edad * 365 + Math.floor(azar() * 365)));
  // La mezcla de un gimnasio real.
  const r = azar();
  const vence = r < 0.6 ? 8 + Math.floor(azar() * 22)      // al día
    : r < 0.75 ? Math.floor(azar() * 7)                      // vence esta semana
      : -(1 + Math.floor(azar() * 120));                     // vencido
  const arancel = azar() < 0.08 ? '' : uno(ARANCELES);
  const estado = vence < -60 && azar() < 0.5 ? 'Baja' : 'Activo';
  // El alta siempre ANTES del vencimiento: al revés, el importador rechaza la fila (y hace bien).
  const antiguedad = Math.max(20 + Math.floor(azar() * 700), -vence + 30);

  filas.push([nombre, apellido, dni, telefono, email, nacimiento, enDias(-antiguedad), enDias(vence), arancel, estado]);
}

const hoja = XLSX.utils.aoa_to_sheet(filas);
hoja['!cols'] = filas[0].map((t) => ({ wch: Math.max(12, t.length + 4) }));
const libro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(libro, hoja, 'Socios');
XLSX.writeFile(libro, salida);

const cuenta = (pred) => filas.slice(1).filter(pred).length;
const dias = (f) => { const [d, m, a] = f[7].split('/').map(Number); return Math.round((new Date(a, m - 1, d) - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000); };
console.log(`Listo: ${salida}`);
console.log(`  ${CANTIDAD} socios · al día ${cuenta((f) => dias(f) >= 7)} · vencen esta semana ${cuenta((f) => dias(f) >= 0 && dias(f) < 7)} · vencidos ${cuenta((f) => dias(f) < 0)} · de baja ${cuenta((f) => f[9] === 'Baja')} · sin arancel ${cuenta((f) => !f[8])}`);
