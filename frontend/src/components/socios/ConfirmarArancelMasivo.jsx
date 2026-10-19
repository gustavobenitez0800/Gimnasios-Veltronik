import { formatCurrency } from '../../lib/utils';
import { SACAR_ARANCEL } from '../../lib/listaDeSocios';
import { ConfirmDialog } from '../Layout';

/**
 * CONFIRMAR LA ASIGNACIÓN MASIVA.
 *
 * Escribir sobre doscientas fichas no puede pasar por un cambio de desplegable. Y lo que más
 * importa está en el segundo párrafo: cuántos de los seleccionados YA tenían un arancel
 * distinto, que es el dato que evita pisarle la cuota a gente que estaba bien.
 */
export default function ConfirmarArancelMasivo({
  confirmandoMasivo, setConfirmandoMasivo, aranceles, pagedMembers, seleccion, aplicarArancelMasivo,
}) {
  const destino = confirmandoMasivo.planId === SACAR_ARANCEL
    ? null
    : aranceles.find((a) => a.id === confirmandoMasivo.planId);
  const elegidos = pagedMembers.filter((m) => seleccion.has(m.id));
  // Se cuenta sobre lo que está a la vista; puede haber más marcados de otras páginas,
  // pero nunca se dice un número menor al real: si no está visible, no se afirma nada.
  const pisados = elegidos.filter(
    (m) => m.planId && m.planId !== confirmandoMasivo.planId,
  ).length;

  return (
    <ConfirmDialog
      open
      title={destino ? `Asignar "${destino.name}"` : 'Sacarles el arancel'}
      message={
        destino
          ? `Van a quedar ${seleccion.size} socios con "${destino.name}" `
            + `(${formatCurrency(destino.price)}).`
          : `${seleccion.size} socios van a quedar sin arancel.`
      }
      extra={pisados > 0
        ? `⚠️ ${pisados} de ellos ya tenían otro arancel y se les va a reemplazar.`
        : null}
      icon="users"
      confirmText={destino ? 'Asignar a todos' : 'Sacárselo a todos'}
      // Rojo solo para sacar el arancel. Asignar uno no destruye nada, y pintar de
      // rojo una acción normal hace que el rojo deje de significar algo el día que
      // aparezca en un borrado de verdad.
      confirmClass={destino ? 'btn-primary' : 'btn-danger'}
      onConfirm={aplicarArancelMasivo}
      onCancel={() => setConfirmandoMasivo(null)}
    />
  );
}
