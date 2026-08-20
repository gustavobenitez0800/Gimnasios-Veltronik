// ============================================
// VELTRONIK - SOCIOS QUE PAGARON Y FIGURAN VENCIDOS
// ============================================
// Los restos del bug de los dos pasos: el pago entraba y la request que le corría el
// vencimiento al socio fallaba en silencio, así que quedó gente que pagó figurando como
// vencida. El mecanismo ya está arreglado, pero eso no corrige hacia atrás.
//
// POR QUÉ ES UNA LISTA PARA REVISAR Y NO UNA CORRECCIÓN AUTOMÁTICA
// Son fechas de membresía de gente real. Si el sistema corrige solo y se equivoca en un
// caso raro, le regala meses a alguien o se los saca, y nadie se entera nunca. Así el
// dueño ve cuántos son, de quiénes se trata y cuánto se les debe, y decide.
//
// La sección se esconde sola cuando no hay nada: una vez limpiado, deja de aparecer.
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { paymentService, errorService } from '../services';
import { formatDate } from '../lib/utils';
import Icon from '../components/Icon';

export default function CoverageGaps() {
  const { showToast } = useToast();

  const [gaps, setGaps] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [corrigiendo, setCorrigiendo] = useState(null); // memberId en curso

  const cargar = useCallback(async () => {
    try {
      setGaps(await paymentService.getCoverageGaps());
    } catch {
      // Best-effort de verdad: es una herramienta de limpieza, no puede romper Ajustes.
      setGaps([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const corregir = async (gap) => {
    setCorrigiendo(gap.memberId);
    try {
      const aplicado = await paymentService.fixCoverageGap(gap.memberId);
      showToast(
        aplicado
          ? `${gap.memberName} queda al día hasta el ${formatDate(aplicado)}`
          : `${gap.memberName} ya estaba al día`,
        'success',
      );
      // Recarga en vez de sacar la fila a mano: si otro corrigió algo mientras tanto, la
      // lista queda igual a lo que hay en la base y no a lo que esta pantalla cree.
      await cargar();
    } catch (error) {
      showToast(errorService.getMessage(error), 'error');
    } finally {
      setCorrigiendo(null);
    }
  };

  // Nada que revisar (el caso normal, y el caso final después de limpiar) → no se dibuja.
  if (cargando || gaps.length === 0) return null;

  return (
    <div className="settings-section">
      <h2 className="settings-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Icon name="alertTriangle" size="1.1em" /> Socios que pagaron y figuran vencidos
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '1rem', lineHeight: 1.6 }}>
        Estos <strong>{gaps.length}</strong> {gaps.length === 1 ? 'socio tiene' : 'socios tienen'} un pago
        registrado que cubre más allá de su fecha de vencimiento. Pasaba cuando se cortaba la
        conexión justo después de cobrar: el pago quedaba guardado y la fecha del socio no se
        actualizaba. Ya no puede volver a pasar, pero estos quedaron de antes.
      </p>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Socio</th>
              <th>Figura vencido</th>
              <th>Pagó hasta</th>
              <th>Se le deben</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((gap) => (
              <tr key={gap.memberId}>
                <td data-label="Socio">{gap.memberName}</td>
                <td data-label="Figura vencido">
                  {gap.membershipEnd ? formatDate(gap.membershipEnd) : <span style={{ color: 'var(--text-muted)' }}>sin fecha</span>}
                </td>
                <td data-label="Pagó hasta"><strong>{formatDate(gap.paidUntil)}</strong></td>
                <td data-label="Se le deben">{gap.daysOwed} {gap.daysOwed === 1 ? 'día' : 'días'}</td>
                <td data-label="Acciones">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => corregir(gap)}
                    disabled={corrigiendo !== null}
                  >
                    {corrigiendo === gap.memberId
                      ? (<><span className="spinner" /> Corrigiendo…</>)
                      : 'Corregir'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginTop: '0.75rem', lineHeight: 1.5 }}>
        "Corregir" le pone al socio la fecha hasta la que efectivamente pagó. Nunca le acorta
        la membresía a nadie. Revisá la lista antes: son fechas de gente real.
      </p>
    </div>
  );
}
