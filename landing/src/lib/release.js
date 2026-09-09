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

const API = 'https://api.github.com/repos/gustavobenitez0800/Gimnasios-Veltronik/releases/latest';

/** A dónde mandar a alguien si la API de GitHub no contesta: la página de releases. */
export const RELEASES_URL = 'https://github.com/gustavobenitez0800/Gimnasios-Veltronik/releases/latest';

/**
 * El instalador de Windows del último release publicado.
 *
 * Ojo: `/releases/latest` de la API devuelve el último release PUBLICADO — los
 * borradores no aparecen. Eso es lo que queremos (el workflow deja la release en
 * borrador y publicarla es un paso a mano), pero significa que si alguien se olvida de
 * publicar, acá sigue saliendo la versión anterior. Es el comportamiento correcto: mejor
 * ofrecer una versión vieja que una que nadie revisó.
 */
export async function getInstalador() {
  try {
    const res = await fetch(API, {
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
  } catch (e) {
    console.warn(`[landing] No pude leer el release de GitHub (${e.message}).`);
    return null;
  }
}
