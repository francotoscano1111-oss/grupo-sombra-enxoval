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

function nh(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const ALIASES = {
  cnpj:      ['documento', 'cnpj', 'cgc', 'cpfcnpj', 'cnpjempresa', 'cnpjprestador', 'cnpjsocio', 'idempresa', 'estabelecimento', 'loja', 'pontodevenda', 'pvd', 'cpf', 'doc'],
  data:      ['datadevencimento', 'datadevencimentooriginal', 'datadavenda', 'data', 'dataemissao', 'datamovimento', 'emissao', 'dtemissao', 'datanf', 'dt', 'datatransacao', 'datavenda', 'vencimento', 'datacredito', 'datapgto', 'pagamento', 'datalancamento', 'datapagamento'],
  valor:     ['valorbruto', 'valorliquido', 'valor', 'valortotal', 'vlrservico', 'valorservico', 'vlr', 'vlrmovimento', 'valorvenda', 'bruto', 'liquido', 'credito', 'debito', 'vlrliquido', 'vlrbruto', 'lancamento', 'valorcobrado', 'total'],
  descricao: ['produto', 'descricao', 'historico', 'desc', 'discriminacao', 'obs', 'descricaomovimento', 'servico', 'bandeira', 'resumo', 'banco', 'detalhe', 'nomefantasia', 'nometerminal', 'operacao', 'modalidade'],
  categoria: ['categoria', 'tipo', 'tipodetransacao', 'tipotransacao', 'tipodemovimento', 'origem', 'tipolancamento', 'status'],
  stoneid:   ['stoneid', 'idstone', 'id', 'transacao', 'codigo', 'codigodaoperacao', 'identificador', 'cctransactionid', 'nsu', 'autorizacao', 'nautorizacao', 'cv', 'resumodevendas', 'idtransacao', 'tid', 'numerocontrole'],
};

function buildMapping(headerRow) {
  const map = {};
  const normHeaders = headerRow.map(h => nh(h));
  for (const [field, aliases] of Object.entries(ALIASES)) {
    let colIdx = -1;
    for (const alias of aliases) {
      const found = normHeaders.indexOf(alias);
      if (found !== -1) { colIdx = found; break; }
    }
    if (colIdx !== -1) map[field] = colIdx;
  }
  return map;
}

export function parseGenericHub(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let hIdx = -1;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    // Check if the row has enough non-empty strings
    const strCells = row.filter(c => typeof c === 'string' && c.trim().length > 0);
    if (strCells.length < 3) continue;

    const m = buildMapping(row);
    // Require at least one highly probable column mapped, OR cnpj.
    if (m.data !== undefined || m.valor !== undefined || m.stoneid !== undefined || m.cnpj !== undefined) {
      hIdx = i; break;
    }
  }

  if (hIdx === -1) throw new Error("Não foi possível encontrar o cabeçalho validado no arquivo genérico/Stone.");

  const headerRow = rows[hIdx];
  const map = buildMapping(headerRow);

  const dataRows = rows.slice(hIdx + 1).filter(r => r.length > 0 && (map.cnpj !== undefined ? r[map.cnpj] : true));

  return dataRows.map(r => {
    const extra = {};
    headerRow.forEach((h, i) => { if (h) extra[h] = r[i]; });

    const rawCnpj = map.cnpj !== undefined ? String(r[map.cnpj] || '').replace(/\D/g, '') : '';
    const itemDate = map.data !== undefined ? excelDateToISO(r[map.data]) : '';
    let itemVal = 0;
    
    if (map.valor !== undefined) {
       const v = r[map.valor];
       if (typeof v === 'number') {
         itemVal = v;
       } else if (typeof v === 'string') {
         // Clean string currency
         const clean = v.replace(/[^\d.,-]/g, '');
         if (clean.includes(',') && clean.includes('.')) {
           // format like 1.234,56 -> remove dot, replace comma with dot
           itemVal = parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
         } else if (clean.includes(',')) {
           itemVal = parseFloat(clean.replace(',', '.')) || 0;
         } else {
           itemVal = parseFloat(clean) || 0;
         }
       }
    }
    
    const rawStoneId = map.stoneid !== undefined ? String(r[map.stoneid] || '').trim() : '';

    return {
      stoneId:   rawStoneId || `${rawCnpj}-${itemDate}-${itemVal}`,
      cnpj:      rawCnpj,
      data:      itemDate,
      valor:     itemVal,
      descricao: map.descricao !== undefined ? String(r[map.descricao] || '').trim() : '',
      categoria: map.categoria !== undefined ? String(r[map.categoria] || '').trim() : '',
      original:  extra,
    };
  });
}
