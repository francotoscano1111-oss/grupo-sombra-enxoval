import * as XLSX from 'xlsx';

function excelDateToISO(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return String(v);
}

function parseCurrency(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const s = String(val).replace(/[R$\s]/g, '').trim();
  // If it's formatted like 1.234,56, remove dots and change comma to dot
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Otherwise it's already a string with a dot, like "1234.56"
  return parseFloat(s) || 0;
}

// Parses Sicoob Excel
// Example Headers on Row 3: ["Nº estabelecimento","Data do pagamento","Bandeira","Produto","Quantidade","Valor bruto","Desconto","Valor líquido"]
export function parseSicoob(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let hIdx = -1;
  for (let i = 0; i < 15; i++) {
    const row = rows[i] || [];
    if (row.includes('Nº estabelecimento') && row.includes('Data do pagamento')) {
      hIdx = i; break;
    }
  }

  if (hIdx === -1) throw new Error("Cabeçalho padrão do Sicoob ('Nº estabelecimento', 'Data do pagamento') não encontrado.");

  const headers = rows[hIdx];
  const idxEstab = headers.indexOf('Nº estabelecimento');
  const idxData = headers.indexOf('Data do pagamento');
  const idxBandeira = headers.indexOf('Bandeira');
  const idxProduto = headers.indexOf('Produto');
  const idxValor = headers.indexOf('Valor líquido');
  const idxBruto = headers.indexOf('Valor bruto');

  const dataRows = rows.slice(hIdx + 1).filter(r => r.length > 0 && r[idxData] && (r[idxValor] || r[idxBruto]));

  return dataRows.map(r => {
    const itemDate = excelDateToISO(r[idxData]);
    const valLiq = parseCurrency(r[idxValor]);
    const valBruto = parseCurrency(r[idxBruto]);
    const est = String(r[idxEstab] || '').trim();
    const bandeira = String(r[idxBandeira] || '').trim();
    const prod = String(r[idxProduto] || '').trim();

    // Sicoob does not provide a transaction ID in this report, so we hash the row data to prevent duplicates
    const rawId = `${est}-${itemDate}-${bandeira}-${prod}-${valBruto}`;

    const original = {};
    headers.forEach((h, i) => { if (h) original[h] = r[i]; });

    return {
      stoneId: rawId, // using stoneId conceptually as generic transaction ID to match existing logic
      data: itemDate,
      valor: valLiq, // Liquid value for reconciliation usually
      descricao: `Sicoob: ${bandeira} ${prod} (${est})`,
      categoria: 'Cartão de Crédito',
      original
    };
  });
}
