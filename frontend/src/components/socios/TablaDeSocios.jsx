import { useRef, useEffect, useMemo } from 'react';
import { formatDate } from '../../lib/utils';
import { getDaysInfo } from '../../lib/listaDeSocios';
import { mapMemberToForm } from '../../controllers/formSocio';
import { EmptyState } from '../Layout';
import { DaySelector, Pagination } from '../ui';
import Icon from '../Icon';
import EstadoDelSocio from '../EstadoDelSocio';
import MenuDeAcciones from '../MenuDeAcciones';

/**
 * El formulario vive en ../../controllers/formSocio.
 *
 * ⚠️ NO VOLVER A COPIARLO ACÁ. Estaba declarado dos veces —el alta y la edición— y le
 * faltaba `planId` a las dos: se podía elegir el arancel de un socio y al guardar
 * desaparecía. Afuera se puede probar, y hay un test que falla si algún campo editable no
 * sobrevive la vuelta servidor → formulario.
 */
const MEMBER_MAP_FN = mapMemberToForm;

/** La tabla de socios, con su paginación. Cada fila: datos, arancel, días y acciones. */
export default function TablaDeSocios({
  puedeAsignarMasivo, todosVisiblesMarcados, alternarTodosVisibles, hayAranceles,
  isFetching, pagedMembers, CUANTAS_COLUMNAS, loadError, membersLabelLower, totalRecords,
  search, statusFilter, memberLabel, modal, seleccion, alternarSeleccion,
  guardandoArancel, asignarArancel, aranceles, setCobrando, openWhatsApp,
  openPaymentsHistory, molinete, tomarFoto, canDelete, deleteDialog, pagination, viewTotal,
}) {
  // ⭐ LAS FILAS SE DIBUJAN SOLO CUANDO CAMBIA ALGO DE ELLAS.
  //
  // La pantalla de Socios tiene la lista y todas sus ventanas (el alta, el cobro, el historial,
  // la papelera). Sin esto, abrir cualquier ventana —o cualquier cambio de estado— volvía a
  // dibujar los 50 socios con su selector, sus días y sus botones: medido el 2026-10-22 con el
  // procesador de un celular común, abrir el alta tardaba 270 ms en responder. Ahora las filas se
  // recalculan solo si cambia lo que muestran (la lista, la selección, los aranceles, el que se
  // está guardando).
  //
  // Los botones no capturan las funciones del momento en que se dibujó la fila: llaman a
  // `acciones.current`, que siempre tiene las vigentes. Así una fila que no se re-dibujó no
  // puede usar datos viejos.
  const acciones = useRef(null);
  useEffect(() => {
    acciones.current = {
      alternarSeleccion,
      asignarArancel,
      cobrar: setCobrando,
      editar: (socio) => modal.open(socio, MEMBER_MAP_FN),
      whatsapp: openWhatsApp,
      historial: openPaymentsHistory,
      foto: tomarFoto,
      eliminar: (socio) => deleteDialog.open(socio.id, socio.fullName),
    };
  });
  const molineteDisponible = molinete.disponible;
  const filasDeSocios = useMemo(() => (
    pagedMembers.map((member) => <FilaDeSocio key={member.id} {...{
      member, puedeAsignarMasivo, seleccion, hayAranceles, aranceles, guardandoArancel,
      isFetching, molineteDisponible, canDelete, acciones,
    }} />)
  ), [pagedMembers, puedeAsignarMasivo, seleccion, hayAranceles, aranceles, guardandoArancel, isFetching, molineteDisponible, canDelete]);

  // Ni un socio cargado y sin buscar ni filtrar: el gimnasio recién empieza. Una lista vacía
  // porque falló el pedido NO es esto, y una búsqueda sin resultados tampoco.
  const padronVacio = !isFetching && !loadError && pagedMembers.length === 0
    && totalRecords === 0 && !search && !statusFilter;

  // Primer día: el siguiente paso, con el botón ahí mismo, EN LUGAR de la tabla. Adentro de la
  // tabla quedaba debajo de nueve encabezados y, en el celular, en una tabla más ancha que la
  // pantalla, con barra para el costado.
  if (padronVacio) {
    return (
      <EmptyState
        icon="users"
        title={`Todavía no cargaste ningún ${memberLabel.toLowerCase()}`}
        description="Cargá el primero y desde su ficha ya podés cobrarle la cuota y registrarle la entrada."
        action={(
          <button className="btn btn-primary" onClick={() => modal.open()}>
            <Icon name="plus" size="1em" /> Cargar el primer {memberLabel.toLowerCase()}
          </button>
        )}
      />
    );
  }

  return (
    <div className="card">
      {/* tabla-socios: la tabla esconde columnas según SU ancho, no el de la ventana (ver
          responsive.css, "la tabla de socios mira su propio ancho"). */}
      <div className="table-container tabla-socios">
        <table className="table">
          <thead>
            <tr>
              {puedeAsignarMasivo && (
                <th className="col-check">
                  {/* Marca todo lo que se está VIENDO, no "todos los socios": marcar cosas
                      que no están en pantalla es la forma más fácil de aplicarle un arancel
                      a alguien sin darse cuenta. Con el filtro "Sin arancel" puesto, esto
                      ES el caso de uso completo. */}
                  <input
                    type="checkbox"
                    checked={todosVisiblesMarcados}
                    onChange={alternarTodosVisibles}
                    title={todosVisiblesMarcados ? 'Desmarcar todos' : 'Marcar los de esta página'}
                  />
                </th>
              )}
              <th>Nombre</th>
              <th className="col-dni">DNI</th>
              {/* Encabezados cortos A PROPÓSITO: a 1366px son ellos (y el select de Arancel) los que
                  marcan el ancho mínimo de la tabla, no los datos. Medido el 2026-09-19: con los
                  largos, la tabla pedía 1071px en 1012 y la columna que quedaba afuera era la
                  de Acciones — el botón de Cobrar. Ver responsive.css, "el aire cede". */}
              <th className="col-tel">Tel.</th>
              <th className="col-estado">Estado</th>
              {hayAranceles && <th>Arancel</th>}
              <th className="col-asistencia">Asistencia</th>
              <th>Días</th>
              <th className="col-vence">Vence</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {isFetching && pagedMembers.length === 0 ? (
              <tr>
                <td colSpan={CUANTAS_COLUMNAS} className="table-empty">
                  <span className="spinner" /> Cargando...
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                {/* Una lista vacía porque fallo el pedido NO es un gimnasio sin socios. */}
                <td colSpan={CUANTAS_COLUMNAS} className="table-empty">
                  No se pudieron cargar los {membersLabelLower}
                </td>
              </tr>
            ) : pagedMembers.length === 0 ? (
              <tr>
                <td colSpan={CUANTAS_COLUMNAS} className="table-empty">
                  No se encontraron {membersLabelLower}
                </td>
              </tr>
            ) : (
              filasDeSocios
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination {...pagination} totalCount={viewTotal} />
    </div>
  );
}

/** Un renglón de la tabla. Las acciones van por `acciones.current` (ver arriba, en la tabla). */
function FilaDeSocio({
  member, puedeAsignarMasivo, seleccion, hayAranceles, aranceles, guardandoArancel,
  isFetching, molineteDisponible, canDelete, acciones,
}) {
  const daysInfo = getDaysInfo(member);
  return (
    <tr style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
      {puedeAsignarMasivo && (
        <td className="col-check">
          <input
            type="checkbox"
            checked={seleccion.has(member.id)}
            onChange={() => acciones.current.alternarSeleccion(member.id)}
            aria-label={`Seleccionar a ${member.fullName}`}
          />
        </td>
      )}
      <td data-label="Nombre"><strong>{member.fullName}</strong></td>
      <td data-label="DNI" className="col-dni">{member.dni || '-'}</td>
      <td data-label="Teléfono" className="col-tel">{member.phone || '-'}</td>
      {/* ⭐ El chip decía ACTIVO para alguien que nunca pagó, y el estado es lo
          primero que se mira: un socio recién cargado se veía idéntico a uno al
          día. Ámbar y no rojo — no debe nada, todavía no se le cobró. */}
      <td data-label="Estado" className="col-estado">
        <EstadoDelSocio socio={member} />
      </td>
      {hayAranceles && (
        /* ⭐ El arancel se elige acá mismo, sin abrir la ficha. Con 383
           socios, abrir un modal por cada uno no es una opción: son dos
           clics contra cinco pasos, y la fila no se mueve de lugar. */
        <td data-label="Arancel">
          <select
            className={member.planId ? 'arancel-select' : 'arancel-select sin-arancel'}
            value={member.planId || ''}
            disabled={guardandoArancel === member.id}
            onChange={(e) => acciones.current.asignarArancel(member, e.target.value)}
            title={member.planNombre || 'Sin arancel'}
          >
            <option value="">Sin arancel</option>
            {/* El arancel que el socio tiene puede estar dado de baja y no
                venir entre los vigentes. Sin esta opción el select se vería
                vacío, y el primer cambio se lo borraría sin querer. */}
            {member.planId && !aranceles.some((a) => a.id === member.planId) && (
              <option value={member.planId}>
                {member.planNombre || 'Arancel viejo'} · de baja
              </option>
            )}
            {aranceles.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </td>
      )}
      <td data-label="Asistencia" className="col-asistencia">
        <DaySelector selectedDays={member.attendanceDays || []} readOnly />
      </td>
      <td data-label="Días">
        <span className={`days-countdown ${daysInfo.className}`}>{daysInfo.text}</span>
      </td>
      <td data-label="Vencimiento" className="col-vence">{formatDate(member.membershipEnd)}</td>
      <td data-label="Acciones">
        <div className="table-actions">
          <button
            className="action-btn-quick action-btn-charge"
            /* Antes esto SALTABA a Pagos con un formulario vacío: había que
               buscar de nuevo al socio, elegir el arancel, escribir el monto
               y las fechas. Cinco pasos y un cambio de pantalla para la
               operación más común del gimnasio. */
            onClick={() => acciones.current.cobrar(member)}
            title="Cobrar cuota"
          ><Icon name="cash" size="1em" /></button>
          <button
            className="action-btn-quick action-btn-payment"
            onClick={() => acciones.current.editar(member)}
            title="Editar"
          ><Icon name="edit" size="1em" /></button>
          {/* Sin teléfono queda el hueco, no se corre la fila: los botones
              de todas las filas quedan uno debajo del otro. */}
          {member.phone ? (
            <button
              className="action-btn-quick action-btn-whatsapp"
              onClick={() => acciones.current.whatsapp(member)}
              title="WhatsApp"
            ><Icon name="messageCircle" size="1em" /></button>
          ) : <span className="action-btn-hueco" aria-hidden="true" />}
          {/* Lo que se usa poco, o no tiene vuelta atrás, va en el menú. Con
              cinco botones de colores la fila medía 94 px y "Eliminar" quedaba
              a un dedo de "Cobrar". */}
          <MenuDeAcciones
            titulo={`Más acciones para ${member.fullName}`}
            acciones={[
              { etiqueta: 'Historial de pagos', icono: 'creditCard', onClick: () => acciones.current.historial(member) },
              ...(molineteDisponible
                ? [{ etiqueta: 'Tomar la foto en el molinete', icono: 'camera', onClick: () => acciones.current.foto(member) }]
                : []),
              ...(canDelete
                ? [{ etiqueta: 'Eliminar', icono: 'trash', peligro: true, onClick: () => acciones.current.eliminar(member) }]
                : []),
            ]}
          />
        </div>
      </td>
    </tr>
  );
}
