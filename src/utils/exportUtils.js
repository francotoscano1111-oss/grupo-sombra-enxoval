import * as XLSX from 'xlsx';

/**
 * Generic utility to export a JSON array to an Excel file.
 * @param {Array} data - Array of objects representing rows. Keys act as headers.
 * @param {String} defaultFilename - Base filename without extension or date.
 * @param {String} sheetName - Name of the worksheet.
 */
export const exportToExcel = (data, defaultFilename = 'export', sheetName = 'Dados') => {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${defaultFilename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

/**
 * Generic utility to export a JSON array to a printable A4 PDF format.
 * @param {String} title - The title printed at the top.
 * @param {Array} columns - Array of column configs: { label: 'Header', getValue: (row) => row.value }
 * @param {Array} data - Array of objects representing rows.
 */
export const exportToPdf = (title, columns, data) => {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }
  
  const ths = columns.map(c => `<th>${c.label}</th>`).join('');
  const rows = data.map(row => {
    const tds = columns.map(c => {
      let val = c.getValue(row);
      if (val === null || val === undefined) val = '';
      return `<td>${val}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const html = `<html>
    <head>
      <title>${title}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; color: #333; }
        h2 { text-align: center; margin-bottom: 20px; font-size: 16px; border-bottom: 2px solid #ddd; padding-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        p.meta { margin-bottom: 15px; font-size: 11px; color: #555; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; font-size: 11px; }
        tr:nth-child(even) td { background: #fafafa; }
        .footer { margin-top: 30px; font-size: 9px; color: #999; text-align: right; border-top: 1px dotted #ccc; padding-top: 8px; }
      </style>
    </head>
    <body>
      <h2>${title}</h2>
      <p class="meta"><b>Total de Registros:</b> ${data.length} &nbsp;|&nbsp; <b>Data de Extração:</b> ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
      <table>
        <thead><tr>${ths}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Gerado sistematicamente por GRUPO SOMBRA Finance Hub</div>
      <script>
        window.onload = function() { 
          setTimeout(() => { window.print(); window.close(); }, 500);
        }
      </script>
    </body>
  </html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
};
