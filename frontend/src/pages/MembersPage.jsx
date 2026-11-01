// ============================================
// VELTRONIK V2 - SOCIOS / ALUMNOS (gym)
// ============================================
// ABM de socios con búsqueda y paginación server-side, historial de pagos y
// export a CSV. Cómo se llama al socio lo dice lib/gym.
// ============================================

// ─── DÓNDE ESTÁ CADA COSA ───
//
// Esta página solo ordena las piezas. El estado y las acciones de la pantalla viven en
// controllers/usePantallaDeSocios.js (que usa useMemberController para los datos); la tabla,
// la ficha, la papelera y las demás ventanas, en components/socios/; los filtros y la columna
// de días, en lib/listaDeSocios.js.

import { usePantallaDeSocios } from '../controllers/usePantallaDeSocios';
import { STATUS_FILTER_OPTIONS } from '../lib/listaDeSocios';
import { invalidateQueries } from '../hooks';
import { PageHeader, ConfirmDialog } from '../components/Layout';
import { FilterBar } from '../components/ui';
import Icon from '../components/Icon';
import CobroRapido from '../components/CobroRapido';
import ImportarSocios from '../components/ImportarSocios';
import BarraDeSeleccion from '../components/socios/BarraDeSeleccion';
import TablaDeSocios from '../components/socios/TablaDeSocios';
import FichaDelSocio from '../components/socios/FichaDelSocio';
import HistorialDePagos from '../components/socios/HistorialDePagos';
import ConfirmarArancelMasivo from '../components/socios/ConfirmarArancelMasivo';
import Papelera from '../components/socios/Papelera';

export default function MembersPage() {
  const socios = usePantallaDeSocios();
  const {
    membersLabel, membersLabelLower, memberLabel, canDelete, isFetching, pagedMembers, totalRecords,
    abrirPapelera, setImportando, exportCSV, modal, handleSearchInput, statusFilter, setStatusFilter,
    pagination, puedeAsignarMasivo, seleccion, confirmandoMasivo, importando, refresh,
    cobrando, setCobrando, aranceles, cobrarCuota, deleteDialog, handleDelete,
  } = socios;

  return (
    <div className="members-page">
      <PageHeader
        title={membersLabel}
        subtitle={isFetching && pagedMembers.length > 0 ? "Actualizando datos..." : `${totalRecords} ${membersLabelLower} registrados`}
        icon="users"
        actions={
          <div className="flex gap-1">
            {/* Mismo permiso que borrar: quien no puede mandar a la papelera tampoco tiene
                por qué sacar de ella. */}
            {canDelete && (
              <button className="btn btn-secondary" onClick={abrirPapelera} title="Socios eliminados">
                <Icon name="trash" /> Papelera
              </button>
            )}
            {/* Mismo permiso que el backend (ImportacionSociosController): una importación
                puede dar de alta cientos de socios o cambiarles el vencimiento a todos. */}
            {canDelete && (
              <button className="btn btn-secondary" onClick={() => setImportando(true)} title="Cargar socios desde un Excel">
                <Icon name="fileText" /> Importar
              </button>
            )}
            <button className="btn btn-secondary" onClick={exportCSV}>
              <Icon name="download" /> Exportar
            </button>
            <button className="btn btn-primary" onClick={() => modal.open()}>
              <Icon name="plus" /> Nuevo {memberLabel.toLowerCase()}
            </button>
          </div>
        }
      />

      {/* Filters */}
      <FilterBar
        onSearch={handleSearchInput}
        searchPlaceholder="Buscar por nombre, DNI o email..."
        filters={[
          {
            value: statusFilter,
            onChange: (v) => { setStatusFilter(v); pagination.reset(); },
            options: STATUS_FILTER_OPTIONS,
          },
        ]}
        count={totalRecords}
        countLabel={membersLabelLower}
      />

      {puedeAsignarMasivo && seleccion.size > 0 && <BarraDeSeleccion {...socios} />}

      <TablaDeSocios {...socios} />

      <FichaDelSocio {...socios} />

      <HistorialDePagos {...socios} />

      {confirmandoMasivo && <ConfirmarArancelMasivo {...socios} />}

      <Papelera {...socios} />

      {/* ─── IMPORTAR DESDE UN EXCEL ─── */}
      <ImportarSocios
        abierto={importando}
        onCerrar={() => setImportando(false)}
        onImportado={() => {
          // Cambió el padrón entero de golpe: el listado, el panel y la retención.
          invalidateQueries('members');
          invalidateQueries('gym_dashboard');
          invalidateQueries('retention_analytics');
          refresh();
        }}
      />

      {/* ─── COBRAR, SIN IRSE DE ACÁ ─── */}
      <CobroRapido
        socio={cobrando}
        aranceles={aranceles}
        abierto={!!cobrando}
        onCerrar={() => setCobrando(null)}
        onCobrar={cobrarCuota}
      />

      {/* ─── DELETE CONFIRMATION ─── */}
      {/* El texto decía "esta acción no se puede deshacer", y desde la 2.6.32 es mentira: el
          socio va a la papelera con toda su historia. Decirle a alguien que algo es
          irreversible cuando no lo es le hace evitar una limpieza que podría hacer tranquilo
          — y el día que aparezca un borrado que SÍ sea irreversible, ya no le va a creer. */}
      <ConfirmDialog
        open={deleteDialog.isOpen}
        title={`Eliminar ${memberLabel}`}
        message={`¿Eliminar a "${deleteDialog.itemName}"? Deja de aparecer en el sistema y no puede entrar al gimnasio.`}
        extra="Se puede recuperar desde la papelera, con sus pagos y sus visitas."
        icon="trash"
        confirmText="Eliminar"
        confirmClass="btn-danger"
        onConfirm={handleDelete}
        onCancel={deleteDialog.close}
      />
    </div>
  );
}
