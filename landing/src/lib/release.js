// El instalador vive en GitHub Releases, no acá.
//
// POR QUÉ: el .exe pesa ~86 MB. En un hosting compartido eso se come el ancho de banda
// del plan en unas pocas descargas, y muchos proveedores estrangulan archivos grandes.
// GitHub lo sirve gratis, sin límite y desde su propia CDN.
//
// EL PROBLEMA DEL NOMBRE: el asset se llama "Veltronik-Setup-2.6.30.exe" — con la
// versión adentro. Por eso el atajo clásico de GitHub
//     /releases/latest/download/<nombre-fijo>.exe
// NO sirve: el nombre cambia en cada release y el link quedaría muerto. Hay que
// preguntarle a la API cuál es el asset más nuevo.

/**
 * ⭐ DÓNDE SE BUSCA, EN ORDEN.
 *
 * Los instaladores se mudaron a un repo público aparte (`veltronik-releases`) para poder
 * hacer privado el del código. Se pregunta primero ahí; si todavía no tiene ninguna versión
 * —o GitHub contesta mal justo para ese— se prueba en el de antes, donde el flujo de
 * publicación sigue dejando una copia mientras dure la mudanza.
 *
 * El segundo es una red para la transición, no un adorno: este cambio puede salir a
 * producción ANTES de que exista la primera versión en el repo nuevo, y sin la red el botón
 * de descargar quedaría apuntando a una página vacía. Cuando el repo del código sea privado
 * va a contestar 404 y simplemente no aporta nada; ahí se puede sacar de la lista.
 */
const REPOS = [
  'gustavobenitez0800/veltronik-releases',
  'gustavobenitez0800/Gimnasios-Veltronik',
];

/** A dónde mandar a alguien si la API de GitHub no contesta: la página de releases. */
export const RELEASES_URL = `https://github.com/${REPOS[0]}/releases/latest`;

/** El instalador del último release publicado de UN repo. Lanza si no lo puede dar. */
async function instaladorDe(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'veltronik-landing',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const release = await res.json();
  const exe = (release.assets || []).find(
    (a) => a.name.endsWith('.exe') && !a.name.endsWith('.blockmap')
  );
  if (!exe) throw new Error('el release no tiene .exe');

  return {
    url: exe.browser_download_url,
    version: String(release.tag_name || '').replace(/^v/, ''),
    // 86038563 → "82 MB". Que el visitante sepa qué se está por bajar.
    peso: `${Math.round(exe.size / 1024 / 1024)} MB`,
    fecha: release.published_at,
  };
}

/**
 * El instalador de Windows del último release publicado.
 *
 * Ojo: `/releases/latest` de la API devuelve el último release PUBLICADO — los
 * borradores no aparecen. Eso es lo que queremos: mejor ofrecer una versión vieja que una
 * que nadie revisó.
 *
 * @returns el instalador, o null si ningún repo lo pudo dar (ahí se cae a RELEASES_URL).
 */
export async function getInstalador() {
  for (const repo of REPOS) {
    try {
      return await instaladorDe(repo);
    } catch (e) {
      console.warn(`[landing] No pude leer el release de ${repo} (${e.message}).`);
    }
  }
  return null;
}
