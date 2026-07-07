// ============================================
// VELTRONIK V2 - FACTURACIÓN ARCA (KIOSCO)
// ============================================
// Configuración fiscal (CUIT, condición, punto de venta,
// certificado CIFRADO), facturación automática y listado
// de comprobantes con su CAE/estado. El front solo dibuja
// lo que el backend (módulo fiscal) computa y devuelve.
// ============================================

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { kioskService } from '../services';
import { PageHeader } from '../components/Layout';
import { FormField, Badge, DataTable } from '../components/ui';
import Icon from '../components/Icon';

const CONDICION_OPTIONS = [
  { value: 'MONOTRIBUTO', label: 'Monotributo (Factura C)' },
  { value: 'RESPONSABLE_INSCRIPTO', label: 'Responsable Inscripto (Factura A/B)' },
  { value: 'EXENTO', label: 'Exento (Factura C)' },
];
const ENV_OPTIONS = [
  { value: 'HOMOLOGACION', label: 'Homologación (pruebas)' },
  { value: 'PRODUCCION', label: 'Producción (válido fiscalmente)' },
];
const VOUCHER_LABELS = {
  FACTURA_A: 'Factura A', FACTURA_B: 'Factura B', FACTURA_C: 'Factura C',
  NOTA_CREDITO_A: 'NC A', NOTA_CREDITO_B: 'NC B', NOTA_CREDITO_C: 'NC C',
};
const STATUS = {
  AUTHORIZED: { label: 'Autorizado', status: 'active' },
  PENDING: { label: 'Pendiente', status: 'pending' },
  CONTINGENCY: { label: 'Contingencia', status: 'pending' },
  REJECTED: { label: 'Rechazado', status: 'inactive' },
};

const fmtMoney = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toLocaleString('es-AR')}`);
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('es-AR') : '—');

const EMPTY_CFG = { cuit: '', razonSocial: '', condicionIva: 'MONOTRIBUTO', environment: 'HOMOLOGACION', defaultPosNumber: '', enabled: 'no' };

export default function KioskFiscalPage() {
  const { showToast } = useToast();

  const [config, setConfig] = useState(null);
  const [vouchers, setVouchers] = useState([]);
  const [autoInvoice, setAutoInvoice] = useState(false);
  const [loading, setLoading] = useState(true);

  const [cfgForm, setCfgForm] = useState(EMPTY_CFG);
  const [savingCfg, setSavingCfg] = useState(false);

  const [cert, setCert] = useState({ certificatePem: '', privateKeyPem: '' });
  const [uploadingCert, setUploadingCert] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [cfg, vs, settings] = await Promise.all([
        kioskService.getFiscalConfig(),
        kioskService.getFiscalVouchers(),
        kioskService.getSettings(),
      ]);
      setConfig(cfg);
      setVouchers(vs);
      setAutoInvoice(!!settings.autoInvoice);
      setCfgForm({
        cuit: cfg.cuit ?? '',
        razonSocial: cfg.razonSocial ?? '',
        condicionIva: cfg.condicionIva ?? 'MONOTRIBUTO',
        environment: cfg.environment ?? 'HOMOLOGACION',
        defaultPosNumber: cfg.defaultPosNumber ?? '',
        enabled: cfg.enabled ? 'yes' : 'no',
      });
    } catch (err) {
      showToast(err.message || 'Error al cargar la facturación', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSaveCfg = async (e) => {
    e.preventDefault();
    setSavingCfg(true);
    try {
      await kioskService.updateFiscalConfig({
        cuit: cfgForm.cuit !== '' ? Number(cfgForm.cuit) : null,
        razonSocial: cfgForm.razonSocial.trim() || null,
        condicionIva: cfgForm.condicionIva,
        environment: cfgForm.environment,
        defaultPosNumber: cfgForm.defaultPosNumber !== '' ? Number(cfgForm.defaultPosNumber) : null,
        enabled: cfgForm.enabled === 'yes',
      });
      showToast('Configuración fiscal guardada', 'success');
      loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Error al guardar', 'error');
    } finally {
      setSavingCfg(false);
    }
  };

  // Lee un archivo (.crt/.key/.pem) directo al formulario: para el dueño es mucho más
  // simple elegir el archivo que abrirlo y copiar/pegar el texto PEM.
  const readFileInto = (field) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCert((c) => ({ ...c, [field]: String(reader.result || '').trim() }));
    reader.onerror = () => showToast('No se pudo leer el archivo. Probá pegando el contenido.', 'error');
    reader.readAsText(file);
    e.target.value = ''; // permite re-elegir el mismo archivo
  };

  const handleUploadCert = async (e) => {
    e.preventDefault();
    if (!cert.certificatePem.trim() || !cert.privateKeyPem.trim()) {
      showToast('Cargá el certificado y la clave privada', 'error'); return;
    }
    setUploadingCert(true);
    try {
      await kioskService.uploadFiscalCertificate(cert.certificatePem.trim(), cert.privateKeyPem.trim());
      showToast('Certificado guardado (cifrado)', 'success');
      setCert({ certificatePem: '', privateKeyPem: '' });
      loadAll();
    } catch (err) {
      showToast(err?.response?.data?.message || 'No se pudo guardar el certificado', 'error');
    } finally {
      setUploadingCert(false);
    }
  };

  const handleToggleAuto = async (value) => {
    const next = value === 'yes';
    setAutoInvoice(next);
    try {
      await kioskService.updateSettings({ autoInvoice: next });
      showToast(next ? 'Facturación automática activada' : 'Facturación automática desactivada', 'success');
    } catch (err) {
      setAutoInvoice(!next); // revertir si falla
      showToast(err.message || 'No se pudo cambiar', 'error');
    }
  };

  if (loading) {
    return <div className="card text-center text-muted" style={{ padding: '3rem' }}><span className="spinner" /> Cargando...</div>;
  }

  return (
    <div>
      <PageHeader title="Facturación ARCA" subtitle="Configuración fiscal y comprobantes electrónicos" icon="fileText" />

      {/* ─── Configuración ─── */}
      <div className="card mb-3">
        <h3 style={{ marginTop: 0 }}><Icon name="settings" size="1em" /> Datos ante ARCA</h3>
        <form onSubmit={handleSaveCfg}>
          <div className="modal-form">
            <FormField label="CUIT" type="number" placeholder="20123456789"
              value={cfgForm.cuit} onChange={(v) => setCfgForm((f) => ({ ...f, cuit: v }))} />
            <FormField label="Razón social" placeholder="Tu nombre / razón social"
              value={cfgForm.razonSocial} onChange={(v) => setCfgForm((f) => ({ ...f, razonSocial: v }))} />
            <FormField label="Condición frente al IVA" type="select" options={CONDICION_OPTIONS}
              value={cfgForm.condicionIva} onChange={(v) => setCfgForm((f) => ({ ...f, condicionIva: v }))} />
            <FormField label="Punto de venta" type="number" placeholder="1"
              value={cfgForm.defaultPosNumber} onChange={(v) => setCfgForm((f) => ({ ...f, defaultPosNumber: v }))}
              hint="El que registraste en ARCA (en homologación suele ser 1)" />
            <FormField label="Ambiente" type="select" options={ENV_OPTIONS}
              value={cfgForm.environment} onChange={(v) => setCfgForm((f) => ({ ...f, environment: v }))} />
            <FormField label="Estado" type="select"
              options={[{ value: 'yes', label: 'Activado (emite comprobantes)' }, { value: 'no', label: 'Desactivado' }]}
              value={cfgForm.enabled} onChange={(v) => setCfgForm((f) => ({ ...f, enabled: v }))} />
          </div>
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={savingCfg}>
              {savingCfg ? <><span className="spinner" /> Guardando...</> : 'Guardar configuración'}
            </button>
          </div>
        </form>
      </div>

      {/* ─── Certificado ─── */}
      <div className="card mb-3">
        <h3 style={{ marginTop: 0 }}>
          <Icon name="lock" size="1em" /> Certificado de ARCA{' '}
          <Badge status={config?.certificateLoaded ? 'active' : 'inactive'}
            label={config?.certificateLoaded ? 'Cargado' : 'Sin cargar'} />
        </h3>
        <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '-0.25rem' }}>
          Elegí los archivos que descargaste de ARCA (o pegá su contenido). Se guardan
          <strong> cifrados</strong> — nunca se muestran ni se descargan. Al subirlos, el sistema
          verifica que el certificado esté vigente y que la clave corresponda al certificado.
        </p>
        <details style={{ marginBottom: '0.75rem' }}>
          <summary className="text-muted" style={{ cursor: 'pointer', fontSize: '0.8125rem' }}>
            ¿Cómo consigo el certificado? (3 pasos)
          </summary>
          <ol className="text-muted" style={{ fontSize: '0.8125rem', lineHeight: 1.6, margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
            <li>En el sitio de ARCA (con clave fiscal), entrá a <strong>"Administración de Certificados Digitales"</strong> y creá un alias para tu negocio.</li>
            <li>Descargá el certificado (<code>.crt</code>). La clave privada (<code>.key</code>) es la que se generó junto con el pedido — si te lo hizo tu contador, pedile los dos archivos.</li>
            <li>En <strong>"Administrador de Relaciones de Clave Fiscal"</strong>, autorizá el servicio <strong>"Facturación Electrónica" (wsfe)</strong> para ese certificado. Después cargá los archivos acá.</li>
          </ol>
        </details>
        <form onSubmit={handleUploadCert}>
          <div className="modal-form">
            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.375rem' }}>Archivo del certificado (.crt / .pem)</label>
              <input type="file" accept=".crt,.pem,.cer,.txt" onChange={readFileInto('certificatePem')} />
            </div>
            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.375rem' }}>Archivo de la clave privada (.key)</label>
              <input type="file" accept=".key,.pem,.txt" onChange={readFileInto('privateKeyPem')} />
            </div>
          </div>
          <FormField label="Certificado (PEM)" type="textarea" fullWidth
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            value={cert.certificatePem} onChange={(v) => setCert((c) => ({ ...c, certificatePem: v }))} />
          <FormField label="Clave privada (PEM)" type="textarea" fullWidth
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
            value={cert.privateKeyPem} onChange={(v) => setCert((c) => ({ ...c, privateKeyPem: v }))} />
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={uploadingCert}>
              {uploadingCert ? <><span className="spinner" /> Subiendo...</> : <><Icon name="lock" size="1em" /> Subir certificado</>}
            </button>
          </div>
        </form>
      </div>

      {/* ─── Facturación automática ─── */}
      <div className="card mb-3">
        <h3 style={{ marginTop: 0 }}><Icon name="check" size="1em" /> Facturación automática</h3>
        <div style={{ maxWidth: 360 }}>
          <FormField label="Facturar cada venta automáticamente" type="select"
            options={[{ value: 'no', label: 'No (facturo cuando quiero)' }, { value: 'yes', label: 'Sí, emitir comprobante en cada venta' }]}
            value={autoInvoice ? 'yes' : 'no'} onChange={handleToggleAuto}
            hint="Si está activo, cada venta del POS genera un comprobante ARCA (sin frenar la venta)" />
        </div>
      </div>

      {/* ─── Comprobantes ─── */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}><Icon name="fileText" size="1em" /> Comprobantes emitidos</h3>
        <DataTable
          columns={[
            { key: 'type', label: 'Tipo', render: (v) => VOUCHER_LABELS[v.voucherType] || v.voucherType },
            { key: 'number', label: 'Número', render: (v) => (v.number ? `${String(v.pointOfSale).padStart(4, '0')}-${String(v.number).padStart(8, '0')}` : '—') },
            { key: 'date', label: 'Fecha', render: (v) => fmtDate(v.voucherDate) },
            { key: 'total', label: 'Total', render: (v) => fmtMoney(v.totalAmount) },
            { key: 'cae', label: 'CAE', render: (v) => v.cae || '—' },
            { key: 'vto', label: 'Vto CAE', render: (v) => fmtDate(v.caeExpiration) },
            { key: 'status', label: 'Estado', render: (v) => {
              const s = STATUS[v.status] || { label: v.status, status: 'inactive' };
              return <Badge status={s.status} label={s.label} />;
            } },
          ]}
          data={vouchers}
          emptyMessage="Todavía no se emitieron comprobantes."
        />
      </div>
    </div>
  );
}
