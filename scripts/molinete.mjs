/**
 * Herramienta de línea de comandos para el equipo de reconocimiento facial (Uniubi UFACE).
 * Habla el "LAN interface" del equipo: HTTP plano contra http://IP:8090/.
 *
 * No hay que instalar nada: sólo Node.
 *
 *   node scripts/molinete.mjs buscar [192.168.100]   busca el equipo en la red (puerto 8090)
 *   node scripts/molinete.mjs probar   <ip>          ¿contesta? devuelve el número de serie (no pide clave)
 *   node scripts/molinete.mjs clave    <ip> <clave>  fija la clave del equipo (la primera vez)
 *   node scripts/molinete.mjs info     <ip> <clave>  firmware, cuántas personas tiene cargadas, hora, IP
 *   node scripts/molinete.mjs avisos   <ip> <clave>  a qué direcciones avisa hoy
 *   node scripts/molinete.mjs avisar   <ip> <clave> <url>   dónde avisar cada reconocimiento
 *   node scripts/molinete.mjs personas <ip> <clave>  lista las personas cargadas en el equipo
 *   node scripts/molinete.mjs abrir    <ip> <clave>  manda un pulso de apertura (probar el relé)
 *   node scripts/molinete.mjs escuchar [puerto]      recibe y muestra los avisos del equipo
 *
 * Referencia: "Device HTTP API V5.1.15", carpeta API(http) del proveedor.
 */
import net from 'node:net';
import http from 'node:http';
import os from 'node:os';

const PUERTO = 8090;
const [cmd, ...args] = process.argv.slice(2);

// --- transporte -------------------------------------------------------------

const pedir = async (ip, ruta, { metodo = 'POST', cuerpo = null, timeout = 8000 } = {}) => {
  const url = `http://${ip}:${PUERTO}${ruta}`;
  const opciones = { method: metodo, signal: AbortSignal.timeout(timeout) };
  if (cuerpo) {
    opciones.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    opciones.body = new URLSearchParams(cuerpo).toString();
  }
  const r = await fetch(url, opciones);
  const texto = await r.text();
  try { return JSON.parse(texto); } catch { return { crudo: texto, http: r.status }; }
};

const mostrar = (x) => console.log(JSON.stringify(x, null, 2));

const morir = (msg) => { console.error(msg); process.exit(1); };

// --- comandos ---------------------------------------------------------------

/** Prueba TCP al 8090. El equipo puede no contestar el ping y sí el puerto. */
const tocaPuerto = (ip, ms = 400) => new Promise((listo) => {
  const s = new net.Socket();
  const cerrar = (abierto) => { s.destroy(); listo(abierto); };
  s.setTimeout(ms);
  s.once('connect', () => cerrar(true));
  s.once('timeout', () => cerrar(false));
  s.once('error', () => cerrar(false));
  s.connect(PUERTO, ip);
});

const redLocal = () => {
  for (const patas of Object.values(os.networkInterfaces())) {
    for (const p of patas || []) {
      if (p.family === 'IPv4' && !p.internal) return p.address.split('.').slice(0, 3).join('.');
    }
  }
  return null;
};

const buscar = async (prefijo) => {
  const red = prefijo || redLocal();
  if (!red) morir('No pude deducir la red. Pasala a mano: node scripts/molinete.mjs buscar 192.168.100');
  console.log(`Buscando el equipo en ${red}.1-254 (puerto ${PUERTO})...`);
  const encontrados = [];
  const ips = Array.from({ length: 254 }, (_, i) => `${red}.${i + 1}`);
  const tanda = 64;
  for (let i = 0; i < ips.length; i += tanda) {
    const lote = ips.slice(i, i + tanda);
    const abiertos = await Promise.all(lote.map((ip) => tocaPuerto(ip)));
    lote.forEach((ip, j) => { if (abiertos[j]) encontrados.push(ip); });
    process.stdout.write('.');
  }
  console.log('');
  if (!encontrados.length) {
    console.log('Nada. Ningún equipo escuchando en el 8090 en esa red.');
    console.log('Revisá: que esté enchufado, que el cable o el wifi vayan al MISMO router que esta PC,');
    console.log('y en la pantalla del equipo, Ajustes -> Red, qué IP tiene.');
    return;
  }
  for (const ip of encontrados) {
    let serie = '(no contestó /getDeviceKey)';
    try { serie = (await pedir(ip, '/getDeviceKey', { metodo: 'GET' })).data ?? serie; } catch { /* sigue */ }
    console.log(`ENCONTRADO  ${ip}  serie: ${serie}`);
  }
};

const probar = async (ip) => {
  if (!ip) morir('Falta la IP.  node scripts/molinete.mjs probar 192.168.100.54');
  console.log(`Puerto ${PUERTO} de ${ip}: ${(await tocaPuerto(ip, 1500)) ? 'ABIERTO' : 'CERRADO / no llega'}`);
  const r = await pedir(ip, '/getDeviceKey', { metodo: 'GET' });
  console.log('Número de serie (deviceKey) — es lo que identifica al equipo en Veltronik:');
  mostrar(r);
};

const clave = async (ip, nueva, vieja) => {
  if (!ip || !nueva) morir('Uso: node scripts/molinete.mjs clave <ip> <clave-nueva> [clave-vieja]');
  // Equipo nuevo o reseteado: vieja y nueva van iguales.
  mostrar(await pedir(ip, '/setPassWord', { cuerpo: { oldPass: vieja || nueva, newPass: nueva } }));
};

const info = async (ip, pass) => {
  if (!ip || !pass) morir('Uso: node scripts/molinete.mjs info <ip> <clave>');
  mostrar(await pedir(ip, `/device/information?pass=${encodeURIComponent(pass)}`, { metodo: 'GET' }));
};

const avisos = async (ip, pass) => {
  if (!ip || !pass) morir('Uso: node scripts/molinete.mjs avisos <ip> <clave>');
  mostrar(await pedir(ip, `/device/callback?pass=${encodeURIComponent(pass)}`, { metodo: 'GET' }));
};

const avisar = async (ip, pass, url) => {
  if (!ip || !pass || !url) morir('Uso: node scripts/molinete.mjs avisar <ip> <clave> <url>');
  mostrar(await pedir(ip, '/setIdentifyCallBack', { cuerpo: { pass, callbackUrl: url } }));
};

const personas = async (ip, pass) => {
  if (!ip || !pass) morir('Uso: node scripts/molinete.mjs personas <ip> <clave>');
  // personId = -1 significa "todas"; el equipo pagina de a 1000 como máximo.
  const q = new URLSearchParams({ pass, personId: '-1', length: '20', index: '0' });
  mostrar(await pedir(ip, `/person/findByPage?${q}`, { metodo: 'GET' }));
};

const alta = async (ip, pass, id, nombre) => {
  if (!ip || !pass || !id) morir('Uso: node scripts/molinete.mjs alta <ip> <clave> <id> [nombre]');
  // En equipos de exportación el id es obligatorio: ahí va el id del socio (números y letras).
  const person = JSON.stringify({ id, name: nombre || id, facePermission: 2 });
  mostrar(await pedir(ip, '/person/create', { cuerpo: { pass, person } }));
};

const baja = async (ip, pass, id) => {
  if (!ip || !pass || !id) morir('Uso: node scripts/molinete.mjs baja <ip> <clave> <id>');
  // El equipo entiende "-1" como "borrá a todos, con fotos y todo". Acá no se acepta por accidente.
  if (id === '-1') morir('"-1" le borra TODAS las personas al equipo. Si es lo que querés, hacelo a mano.');
  // El campo es `id`, no `personId` (el documento lo etiqueta "Person ID" pero engaña).
  mostrar(await pedir(ip, '/person/delete', { cuerpo: { pass, id } }));
};

/** El equipo saca la foto él mismo: la cara nunca pasa por Veltronik. */
const foto = async (ip, pass, id) => {
  if (!ip || !pass || !id) morir('Uso: node scripts/molinete.mjs foto <ip> <clave> <id>');
  mostrar(await pedir(ip, '/face/takeImg', { cuerpo: { pass, personId: id } }));
  console.log('El equipo entró en modo captura: parate enfrente y seguí lo que dice la pantalla.');
};

/** Socio al día -> prendido. Socio vencido -> apagado. Es un campo, no un alta ni una baja. */
const permiso = async (ip, pass, id, estado) => {
  if (!ip || !pass || !id || !['on', 'off'].includes(estado)) {
    morir('Uso: node scripts/molinete.mjs permiso <ip> <clave> <id> on|off');
  }
  const person = JSON.stringify({ id, facePermission: estado === 'on' ? 2 : 1 });
  mostrar(await pedir(ip, '/person/update', { cuerpo: { pass, person } }));
};

const abrir = async (ip, pass) => {
  if (!ip || !pass) morir('Uso: node scripts/molinete.mjs abrir <ip> <clave>');
  mostrar(await pedir(ip, '/device/openDoorControl', { cuerpo: { pass, type: 1 } }));
};

/** Receptor de prueba: muestra lo que el equipo manda cuando reconoce a alguien. */
const escuchar = (puerto = 8888) => {
  http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (t) => { cuerpo += t; });
    req.on('end', () => {
      const hora = new Date().toLocaleTimeString('es-AR');
      let visto = cuerpo;
      try { visto = JSON.stringify(JSON.parse(cuerpo), null, 2); } catch { /* queda crudo */ }
      console.log(`\n[${hora}] ${req.method} ${req.url}\n${visto}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"result":1,"success":true}');
    });
  }).listen(puerto, () => {
    const red = redLocal();
    console.log(`Escuchando en el puerto ${puerto}.`);
    console.log('Decile al equipo que avise acá:');
    console.log(`  node scripts/molinete.mjs avisar <ip> <clave> http://${red ? red + '.X' : 'IP-DE-ESTA-PC'}:${puerto}/uface`);
    console.log('(Ctrl+C para cortar.)\n');
  });
};

const ayuda = () => console.log(`
Equipo facial UFACE — herramienta de prueba

  buscar   [red]                 busca el equipo en la red (ej: buscar 192.168.100)
  probar   <ip>                  ¿contesta? devuelve el número de serie
  clave    <ip> <nueva> [vieja]  fija la clave del equipo (nueva = vieja la primera vez)
  info     <ip> <clave>          firmware, personas cargadas, hora, IP
  avisos   <ip> <clave>          a qué direcciones avisa hoy
  avisar   <ip> <clave> <url>    dónde avisar cada reconocimiento
  personas <ip> <clave>          lista las personas cargadas
  alta     <ip> <clave> <id> [nombre]   carga una persona
  foto     <ip> <clave> <id>     el equipo le saca la foto (no pasa por Veltronik)
  permiso  <ip> <clave> <id> on|off     al día / vencido
  baja     <ip> <clave> <id>     borra a la persona del equipo
  abrir    <ip> <clave>          pulso de apertura (probar el relé)
  escuchar [puerto]              recibe los avisos del equipo y los muestra
`);

const comandos = {
  buscar: () => buscar(args[0]),
  probar: () => probar(args[0]),
  clave: () => clave(args[0], args[1], args[2]),
  info: () => info(args[0], args[1]),
  avisos: () => avisos(args[0], args[1]),
  avisar: () => avisar(args[0], args[1], args[2]),
  personas: () => personas(args[0], args[1]),
  alta: () => alta(args[0], args[1], args[2], args[3]),
  foto: () => foto(args[0], args[1], args[2]),
  permiso: () => permiso(args[0], args[1], args[2], args[3]),
  baja: () => baja(args[0], args[1], args[2]),
  abrir: () => abrir(args[0], args[1]),
  escuchar: () => escuchar(Number(args[0]) || 8888),
};

const correr = comandos[cmd] || ayuda;
try {
  await correr();
} catch (e) {
  morir(`Falló: ${e.message}\n(si dice timeout o fetch failed, el equipo no está llegando por red)`);
}
