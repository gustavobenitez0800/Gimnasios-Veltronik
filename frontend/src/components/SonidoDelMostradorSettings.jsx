import { useEffect, useState } from 'react';
import {
  probarSonido, prepararSonido, volumenDeAvisos, fijarVolumenDeAvisos, queHizoLaMusica,
} from '../lib/alertaSonora';
import Icon from './Icon';

/**
 * Ajustes → Sonido del mostrador (solo en el escritorio).
 *
 * <p>Los avisos del mostrador (la X del vencido, el «din-din» del llavero, el llavero sin dueño)
 * no se ven: se oyen. Y lo que más falla no se ve tampoco: que la música baje. Acá se prueban los
 * tres, se ve si la música de esta PC baja de verdad, y se ajusta el volumen.</p>
 */
export default function SonidoDelMostradorSettings() {
  const [volumen, setVolumen] = useState(() => Math.round(volumenDeAvisos() * 100));
  const [estado, setEstado] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    let vivo = true;
    prepararSonido();
    Promise.resolve(window.electronAPI?.audio?.estado?.())
      .then((e) => { if (vivo) setEstado(e || null); })
      .catch(() => { if (vivo) setEstado(null); });
    return () => { vivo = false; };
  }, []);

  const probar = async (nombre) => {
    setProbando(true);
    try {
      setResultado(queHizoLaMusica(await probarSonido(nombre)));
    } finally {
      setProbando(false);
    }
  };

  const cambiarVolumen = (valor) => {
    setVolumen(Math.round(fijarVolumenDeAvisos(Number(valor) / 100) * 100));
  };

  const ayudante = !estado ? null
    : !estado.disponible ? { ok: false, texto: 'Bajar la música funciona en Windows.' }
      : estado.listo ? { ok: true, texto: 'Bajar la música: listo.' }
        : estado.rendido ? { ok: false, texto: `Bajar la música no anda en esta computadora${estado.ultimoError ? ` (${estado.ultimoError})` : ''}. Los avisos suenan igual.` }
          : { ok: false, texto: 'Bajar la música: arrancando…' };

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="bell" size="1.1em" /> Sonido del mostrador
      </h2>
      <div className="ajuste-pila">
        <p className="ajuste-nota">
          Para enterarse sin mirar la pantalla: una X cuando entra alguien con la cuota vencida, un
          «din-din» cuando entra con el llavero y está todo bien, y dos pitidos cuando pasan un
          llavero que no es de nadie. Con la X y los pitidos, la música de esta computadora baja un
          momento y vuelve sola.
        </p>

        {ayudante && <p className={`ajuste-estado ${ayudante.ok ? 'is-ok' : 'is-mal'}`}>{ayudante.texto}</p>}

        <div className="ajuste-fila">
          <button type="button" className="btn btn-secondary" disabled={probando} onClick={() => probar('vencido')}>
            Probar: socio vencido
          </button>
          <button type="button" className="btn btn-secondary" disabled={probando} onClick={() => probar('entrada')}>
            Probar: entrada con llavero
          </button>
          <button type="button" className="btn btn-secondary" disabled={probando} onClick={() => probar('desconocido')}>
            Probar: llavero sin dueño
          </button>
        </div>

        {resultado && <p className={`ajuste-estado ${resultado.ok ? 'is-ok' : 'is-mal'}`} role="status">{resultado.texto}</p>}

        <div>
          <label className="form-label" htmlFor="avisos-volumen">Volumen de los avisos: {volumen}%</label>
          <input
            id="avisos-volumen" type="range" min="20" max="100" step="5"
            value={volumen} onChange={(e) => cambiarVolumen(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}
