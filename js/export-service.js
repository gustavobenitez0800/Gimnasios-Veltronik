// ============================================
// GIMNASIO VELTRONIK - EXPORT SERVICE
// Sistema de Exportación a PDF y Excel
// ============================================

/**
 * Configuración de reportes
 */
const REPORT_CONFIG = {
    gym: {
        name: 'Tu Gimnasio',
        logo: null // URL del logo si existe
    },
    colors: {
        primary: '#0EA5E9',
        secondary: '#1E293B',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444'
    }
};

/**
 * Actualizar configuración del gimnasio
 */
function setReportGymInfo(name, logoUrl = null) {
    REPORT_CONFIG.gym.name = name;
    REPORT_CONFIG.gym.logo = logoUrl;
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Formatear moneda
 */
function formatCurrencyReport(amount) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0
    }).format(amount || 0);
}

/**
 * Formatear fecha
 */
function formatDateReport(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Obtener fecha y hora actual formateada
 */
function getCurrentDateTime() {
    return new Date().toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================
// EXPORTAR A PDF (usando jsPDF)
// ============================================

/**
 * Verificar si jsPDF está disponible
 */
function isJsPDFAvailable() {
    return typeof jspdf !== 'undefined' || typeof window.jspdf !== 'undefined';
}

/**
 * Obtener instancia de jsPDF
 */
function getJsPDF() {
    if (typeof jspdf !== 'undefined') {
        return new jspdf.jsPDF();
    }
    if (typeof window.jspdf !== 'undefined') {
        return new window.jspdf.jsPDF();
    }
    throw new Error('jsPDF no está cargado');
}

/**
 * Exportar lista de socios a PDF
 */
async function exportMembersToPDF(members, options = {}) {
    if (!isJsPDFAvailable()) {
        throw new Error('jsPDF no está disponible. Incluye el CDN en la página.');
    }

    const doc = getJsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(14, 165, 233); // Primary color
    doc.text(REPORT_CONFIG.gym.name, margin, y);

    y += 10;
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Reporte de Socios', margin, y);

    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generado: ${getCurrentDateTime()}`, margin, y);
    doc.text(`Total: ${members.length} socios`, pageWidth - margin - 50, y);

    y += 15;

    // Table header
    const headers = ['Nombre', 'DNI', 'Teléfono', 'Estado', 'Vencimiento'];
    const colWidths = [60, 30, 35, 25, 30];

    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y - 5, pageWidth - margin * 2, 10, 'F');

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    let x = margin + 2;
    headers.forEach((header, i) => {
        doc.text(header, x, y);
        x += colWidths[i];
    });

    y += 10;
    doc.setTextColor(60, 60, 60);

    // Table rows
    members.forEach((member, index) => {
        // Check for page break
        if (y > 270) {
            doc.addPage();
            y = 20;
        }

        // Alternate row background
        if (index % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y - 5, pageWidth - margin * 2, 8, 'F');
        }

        x = margin + 2;
        doc.setFontSize(8);

        // Name
        doc.text((member.full_name || '-').substring(0, 25), x, y);
        x += colWidths[0];

        // DNI
        doc.text(member.dni || '-', x, y);
        x += colWidths[1];

        // Phone
        doc.text(member.phone || '-', x, y);
        x += colWidths[2];

        // Status
        const statusColors = {
            'active': [34, 197, 94],
            'inactive': [156, 163, 175],
            'expired': [239, 68, 68]
        };
        const statusColor = statusColors[member.status] || [120, 120, 120];
        doc.setTextColor(...statusColor);
        doc.text(member.status === 'active' ? 'Activo' : member.status === 'expired' ? 'Vencido' : 'Inactivo', x, y);
        doc.setTextColor(60, 60, 60);
        x += colWidths[3];

        // Expiration
        doc.text(formatDateReport(member.membership_end), x, y);

        y += 8;
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
    }

    // Save
    const filename = options.filename || `socios_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    return { success: true, filename };
}

/**
 * Exportar reporte de pagos/ingresos a PDF
 */
async function exportPaymentsToPDF(payments, options = {}) {
    if (!isJsPDFAvailable()) {
        throw new Error('jsPDF no está disponible');
    }

    const doc = getJsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 20;

    // Calculate totals
    const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const paidAmount = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);

    // Header
    doc.setFontSize(20);
    doc.setTextColor(14, 165, 233);
    doc.text(REPORT_CONFIG.gym.name, margin, y);

    y += 10;
    doc.setFontSize(14);
    doc.setTextColor(60, 60, 60);
    doc.text('Reporte de Ingresos', margin, y);

    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generado: ${getCurrentDateTime()}`, margin, y);

    // Summary box
    y += 15;
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y - 5, pageWidth - margin * 2, 25, 3, 3, 'F');

    doc.setFontSize(10);
    doc.setTextColor(34, 197, 94);
    doc.text('Total Ingresos:', margin + 5, y + 5);
    doc.setFontSize(16);
    doc.text(formatCurrencyReport(paidAmount), margin + 5, y + 15);

    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`${payments.length} pagos registrados`, pageWidth - margin - 50, y + 10);

    y += 35;

    // Table header
    const headers = ['Fecha', 'Socio', 'Monto', 'Método', 'Estado'];
    const colWidths = [30, 60, 35, 30, 25];

    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y - 5, pageWidth - margin * 2, 10, 'F');

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    let x = margin + 2;
    headers.forEach((header, i) => {
        doc.text(header, x, y);
        x += colWidths[i];
    });

    y += 10;
    doc.setTextColor(60, 60, 60);

    // Table rows
    payments.forEach((payment, index) => {
        if (y > 270) {
            doc.addPage();
            y = 20;
        }

        if (index % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y - 5, pageWidth - margin * 2, 8, 'F');
        }

        x = margin + 2;
        doc.setFontSize(8);

        doc.text(formatDateReport(payment.payment_date), x, y);
        x += colWidths[0];

        doc.text((payment.member?.full_name || '-').substring(0, 28), x, y);
        x += colWidths[1];

        doc.text(formatCurrencyReport(payment.amount), x, y);
        x += colWidths[2];

        const methods = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transfer.' };
        doc.text(methods[payment.payment_method] || payment.payment_method || '-', x, y);
        x += colWidths[3];

        const statusColors = { 'paid': [34, 197, 94], 'pending': [245, 158, 11], 'overdue': [239, 68, 68] };
        doc.setTextColor(...(statusColors[payment.status] || [120, 120, 120]));
        doc.text(payment.status === 'paid' ? 'Pagado' : payment.status === 'pending' ? 'Pend.' : 'Vencido', x, y);
        doc.setTextColor(60, 60, 60);

        y += 8;
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth / 2, 290, { align: 'center' });
    }

    const filename = options.filename || `ingresos_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    return { success: true, filename, totalAmount: paidAmount };
}

// ============================================
// EXPORTAR A EXCEL (usando SheetJS/XLSX)
// ============================================

/**
 * Verificar si SheetJS está disponible
 */
function isXLSXAvailable() {
    return typeof XLSX !== 'undefined';
}

/**
 * Exportar lista de socios a Excel
 */
async function exportMembersToExcel(members, options = {}) {
    if (!isXLSXAvailable()) {
        throw new Error('SheetJS (XLSX) no está disponible. Incluye el CDN en la página.');
    }

    // Prepare data
    const data = members.map(m => ({
        'Nombre Completo': m.full_name || '-',
        'DNI': m.dni || '-',
        'Email': m.email || '-',
        'Teléfono': m.phone || '-',
        'Dirección': m.address || '-',
        'Fecha Nacimiento': m.birth_date || '-',
        'Tipo Membresía': m.membership_type || '-',
        'Inicio Membresía': m.membership_start || '-',
        'Fin Membresía': m.membership_end || '-',
        'Estado': m.status === 'active' ? 'Activo' : m.status === 'expired' ? 'Vencido' : 'Inactivo',
        'Contacto Emergencia': m.emergency_contact || '-',
        'Tel. Emergencia': m.emergency_phone || '-',
        'Notas': m.notes || '-'
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Set column widths
    ws['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 25 }, { wch: 15 },
        { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 30 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Socios');

    // Save
    const filename = options.filename || `socios_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);

    return { success: true, filename, count: members.length };
}

/**
 * Exportar pagos a Excel
 */
async function exportPaymentsToExcel(payments, options = {}) {
    if (!isXLSXAvailable()) {
        throw new Error('SheetJS (XLSX) no está disponible');
    }

    const data = payments.map(p => ({
        'Fecha Pago': p.payment_date || '-',
        'Fecha Vencimiento': p.due_date || '-',
        'Socio': p.member?.full_name || '-',
        'DNI Socio': p.member?.dni || '-',
        'Monto': p.amount || 0,
        'Método': p.payment_method === 'cash' ? 'Efectivo' :
            p.payment_method === 'card' ? 'Tarjeta' :
                p.payment_method === 'transfer' ? 'Transferencia' : p.payment_method || '-',
        'Estado': p.status === 'paid' ? 'Pagado' : p.status === 'pending' ? 'Pendiente' : 'Vencido',
        'Notas': p.notes || '-'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    // Column widths
    ws['!cols'] = [
        { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 12 },
        { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 30 }
    ];

    // Add summary row
    const totalPaid = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0);
    const totalPending = payments.filter(p => p.status !== 'paid').reduce((s, p) => s + (p.amount || 0), 0);

    XLSX.utils.sheet_add_aoa(ws, [
        [],
        ['RESUMEN'],
        ['Total Pagado:', totalPaid],
        ['Total Pendiente:', totalPending],
        ['Total General:', totalPaid + totalPending]
    ], { origin: -1 });

    XLSX.utils.book_append_sheet(wb, ws, 'Pagos');

    const filename = options.filename || `pagos_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);

    return { success: true, filename, count: payments.length };
}

/**
 * Exportar registros de acceso a Excel
 */
async function exportAccessLogsToExcel(logs, options = {}) {
    if (!isXLSXAvailable()) {
        throw new Error('SheetJS (XLSX) no está disponible');
    }

    const data = logs.map(l => ({
        'Fecha': formatDateReport(l.check_in_at),
        'Socio': l.member?.full_name || '-',
        'DNI': l.member?.dni || '-',
        'Hora Entrada': new Date(l.check_in_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
        'Hora Salida': l.check_out_at ? new Date(l.check_out_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '-',
        'Método': l.access_method || 'Manual'
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);

    ws['!cols'] = [
        { wch: 12 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Accesos');

    const filename = options.filename || `accesos_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);

    return { success: true, filename, count: logs.length };
}

// Exportar para uso global
window.VeltronikExport = {
    setGymInfo: setReportGymInfo,
    pdf: {
        members: exportMembersToPDF,
        payments: exportPaymentsToPDF
    },
    excel: {
        members: exportMembersToExcel,
        payments: exportPaymentsToExcel,
        accessLogs: exportAccessLogsToExcel
    },
    isJsPDFAvailable,
    isXLSXAvailable
};
