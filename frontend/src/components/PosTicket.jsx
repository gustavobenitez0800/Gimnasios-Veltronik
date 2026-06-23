// ============================================
// VELTRONIK V2 - TICKET TÉRMICO (KIOSCO)
// ============================================
// Comprobante de venta para impresora térmica 58/80mm. En pantalla está OCULTO
// (.pos-ticket { display:none }); se materializa solo al imprimir vía el diálogo
// del SO (window.print). Enfoque universal: funciona con CUALQUIER impresora con
// driver, sin SDK ESC/POS — misma filosofía que el lector de código de barras.
// Si la venta tiene comprobante ARCA autorizado, imprime CAE + QR (obligatorio).
// ============================================

import { QRCodeSVG } from 'qrcode.react';
import { formatCurrency } from '../lib/utils';

const VOUCHER_LABELS = { FACTURA_A: 'Factura A', FACTURA_B: 'Factura B', FACTURA_C: 'Factura C' };

const pad = (n, w) => String(n).padStart(w, '0');
function fmtDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
}

export default function PosTicket({ businessName, receipt, fiscalVoucher, methodLabel }) {
  if (!receipt) return null;
  const v = fiscalVoucher && fiscalVoucher.status === 'AUTHORIZED' ? fiscalVoucher : null;

  return (
    <div className="pos-ticket">
      <div className="pos-ticket-header">{businessName || 'Veltronik'}</div>
      <div className="pos-ticket-meta pos-ticket-center">{fmtDateTime(receipt.createdAt)}</div>
      {receipt.customerName && <div className="pos-ticket-meta">Cliente: {receipt.customerName}</div>}
      <div className="pos-ticket-sep" />

      <div className="pos-ticket-items">
        {(receipt.items || []).map((it, i) => (
          <div key={i} className="pos-ticket-line">
            <span className="pos-ticket-item-name">{Number(it.quantity)} x {it.productName}</span>
            <span>{formatCurrency(it.lineTotal)}</span>
          </div>
        ))}
      </div>

      <div className="pos-ticket-sep" />
      <div className="pos-ticket-line pos-ticket-total"><span>TOTAL</span><span>{formatCurrency(receipt.total)}</span></div>
      <div className="pos-ticket-line"><span>{methodLabel}</span><span>{formatCurrency(receipt.total)}</span></div>
      {receipt.change !== null && receipt.change >= 0 && (
        <div className="pos-ticket-line"><span>Vuelto</span><span>{formatCurrency(receipt.change)}</span></div>
      )}

      {v && (
        <>
          <div className="pos-ticket-sep" />
          <div className="pos-ticket-meta pos-ticket-center">
            {VOUCHER_LABELS[v.voucherType] || 'Comprobante'} {pad(v.pointOfSale, 4)}-{pad(v.number, 8)}
          </div>
          <div className="pos-ticket-meta pos-ticket-center">CAE {v.cae}</div>
          {v.caeExpiration && <div className="pos-ticket-meta pos-ticket-center">Vto CAE {v.caeExpiration}</div>}
          {v.qrUrl && <div className="pos-ticket-qr"><QRCodeSVG value={v.qrUrl} size={150} /></div>}
        </>
      )}

      <div className="pos-ticket-sep" />
      <div className="pos-ticket-footer">¡Gracias por su compra!</div>
    </div>
  );
}
