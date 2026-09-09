import * as XLSX from 'xlsx';

function parseDateStr(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const str = String(v).trim();
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return str.slice(0, 10);
}

function parseCurrency(str) {
  if(typeof str === 'number') return str;
  if(!str) return 0;
  const s = String(str).replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
  return parseFloat(s) || 0;
}

// Parses Bee2Pay Excel
// Example Headers on Row 9: ["LIQUIDAÇÃO","TIPO DE LANÇAMENTO","RESERVA","CANAL",...,"NSU","COD. AUTORIZAÇÃO",...,"VALOR BRUTO",...,"VALOR LÍQUIDO"]
export function parseBee2Pay(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let hIdx = -1;
  let fileMetadataCnpj = null;

  for (let i = 0; i < 15; i++) {
    const row = rows[i] || [];
    
    // Look for CNPJ metadata in the top rows (Row 4 has 'CNPJ', Row 5 has the value)
    if (row.includes('CNPJ') && rows[i+1]) {
        const cIdx = row.indexOf('CNPJ');
        fileMetadataCnpj = String(rows[i+1][cIdx] || '').replace(/\D/g, '');
    }

    if (row.includes('LIQUIDAÇÃO') && row.includes('TIPO DE LANÇAMENTO') && row.includes('VALOR LÍQUIDO')) {
      hIdx = i; break;
    }
  }

  if (hIdx === -1) throw new Error("Cabeçalho padrão Bee2Pay ('LIQUIDAÇÃO', 'TIPO DE LANÇAMENTO', 'VALOR LÍQUIDO') não encontrado.");

  const headers = rows[hIdx];
  const idxData = headers.indexOf('LIQUIDAÇÃO');
  const idxTipo = headers.indexOf('TIPO DE LANÇAMENTO');
  const idxReserva = headers.indexOf('RESERVA');
  const idxCanal = headers.indexOf('CANAL');
  const idxNsu = headers.indexOf('NSU');
  const idxAutoriz = headers.indexOf('COD. AUTORIZAÇÃO');
  const idxBandeira = headers.indexOf('BANDEIRA');
  const idxValLq = headers.indexOf('VALOR LÍQUIDO');
  const idxStatus = headers.indexOf('STATUS');

  const dataRows = rows.slice(hIdx + 1).filter(r => r.length > 0 && r[idxData] && r[idxValLq]);

  return dataRows.map(r => {
    const itemDate = parseDateStr(r[idxData]);
    const valLiq = parseCurrency(r[idxValLq]);
    
    const nsu = String(r[idxNsu] || '').trim();
    const aut = String(r[idxAutoriz] || '').trim();
    const reserva = String(r[idxReserva] || '').trim();
    const canal = String(r[idxCanal] || '').trim();
    const status = String(r[idxStatus] || '').trim();

    // Bee2Pay NSU or Autorização or fallback to Reserva
    const rawId = nsu || aut ? `${nsu}-${aut}` : `${reserva}-${itemDate}-${valLiq}`;

    const original = {};
    headers.forEach((h, i) => { if (h) original[h] = r[i]; });

    return {
      stoneId: rawId, // Used universally as transaction anti-duplicate key
      data: itemDate,
      valor: valLiq,
      descricao: `Bee2Pay: ${canal} Res: ${reserva}`,
      categoria: 'Cartão de Crédito',
      status: status,
      // Pass upstream the CNPJ parsed from metadata so the import modal knows which company to route to
      cnpj: fileMetadataCnpj,
      original
    };
  });
}
