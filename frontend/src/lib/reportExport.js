// ============================================
// VELTRONIK - EXPORTACIÓN DE REPORTES (Excel / PDF)
// ============================================
// Lo comparten Reportes del gimnasio y Reportes del kiosco, que tenían la misma
// función escrita dos veces (idéntica en Excel, y en PDF solo cambiaba el color
// del encabezado).
//
// Los import son DINÁMICOS a propósito: xlsx y jspdf pesan ~800 KB juntos y no
// tienen por qué estar en el bundle inicial de una app que la mayoría del tiempo
// se usa para vender, no para exportar. Se bajan al apretar el botón.
// ============================================

/** Color del encabezado de las tablas del PDF (RGB). */
const HEAD_COLOR = [41, 128, 185];

/**
 * @param {string} filename — con extensión .xlsx
 * @param {string[]} headers — fila de títulos
 * @param {Array<Array>} rows — filas de datos
 */
export async function downloadExcel(filename, headers, rows) {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte');
  XLSX.writeFile(workbook, filename);
}

/**
 * @param {string} title — encabezado impreso arriba de la tabla
 */
export async function downloadPDF(title, filename, headers, rows) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  doc.setFontSize(10);
  doc.text(`Generado el: ${new Date().toLocaleString('es-AR')}`, 14, 22);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    styles: { fontSize: 8 },
    headStyles: { fillColor: HEAD_COLOR },
  });

  doc.save(filename);
}
