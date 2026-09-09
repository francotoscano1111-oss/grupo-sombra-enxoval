import * as XLSX from 'xlsx';

/** Excel serial → ISO date string (YYYY-MM-DD) */
export function excelToDate(serial) {
  if (!serial || typeof serial !== 'number') return '';
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

// Normalize header for comparison
export function nh(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export const CONTAS_PAGAR_ALIASES = {
  empresaNome:    ['empresa', 'unidade', 'nomeempresa'],
  previsao:       ['previsao', 'dataprevisao', 'dtprevisao'],
  cnpjFornecedor: ['cnpjdocredor', 'cnpjfornecedor', 'cpfcnpj', 'cnpj'],
  fornecedor:     ['razaosocialdocredor', 'fornecedor', 'credor', 'favorecido', 'nomecredor'],
  tags:           ['tags', 'etiquetas', 'marcas'],
  emissao:        ['dataemissao', 'emissao', 'dtemissao'],
  vencimento:     ['datavencimento', 'vencimento', 'dtvenc', 'venc'],
  registro:       ['dataregistro', 'registro', 'dtreg'],
  categoria:      ['categoria', 'contacontabil', 'planodecontas'],
  contaCorrente:  ['contacorrente', 'banco', 'conta'],
  notaFiscal:     ['numeronf', 'notafiscal', 'nf', 'numeroauxiliar'],
  parcela:        ['parcela', 'nparcela'],
  documento:      ['numerododocumento', 'documento', 'doc'],
  numero:         ['numero', 'num', 'id'],
  pedidoVenda:    ['pedidodevenda', 'pedido'],
  vendedor:       ['vendedor', 'comprador'],
  projeto:        ['projeto', 'centrodecusto'],
  origem:         ['origem', 'tipo'],
  valorConta:     ['valorconta', 'valortotal', 'valor', 'total'],
  valorPIS:       ['valorpis', 'pis'],
  valorCOFINS:    ['valorcofins', 'cofins'],
  valorCSLL:      ['valorcsll', 'csll'],
  valorIR:        ['valorir', 'irrf', 'ir'],
  valorISS:       ['valoriss', 'iss'],
  valorINSS:      ['valorinss', 'inss'],
  valorLiquido:   ['valorliquido', 'liquido'],
  valorPago:      ['valorpago', 'pago'],
  aPagar:         ['valorapagar', 'apagar', 'saldo', 'valoraberto'],
};

function buildMapping(headerRow) {
  const map = {};
  const normHeaders = headerRow.map(h => nh(h));
  for (const [field, aliases] of Object.entries(CONTAS_PAGAR_ALIASES)) {
    const colIdx = normHeaders.indexOf(aliases.find(a => normHeaders.includes(a)));
    if (colIdx !== -1) map[field] = colIdx;
  }
  return map;
}

export function parseContasExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary', raw: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

        // Find header row: first row with >= 5 headers matched
        let hIdx = 0;
        for (let i = 0; i < Math.min(15, rows.length); i++) {
          const m = buildMapping(rows[i] || []);
          if (Object.keys(m).length >= 5) { hIdx = i; break; }
        }

        const headerRow = rows[hIdx] || [];
        const map = buildMapping(headerRow);

        const results = rows.slice(hIdx + 1).filter(r => r.length > 0).map(r => {
          const fornecedor = map.fornecedor !== undefined ? String(r[map.fornecedor] ?? '').trim() : '';
          if (!fornecedor) return null;

          const obj = {};
          for (const key of Object.keys(CONTAS_PAGAR_ALIASES)) {
            const idx = map[key];
            if (idx === undefined) {
              obj[key] = (key.startsWith('valor') || key === 'aPagar') ? 0 : '';
              continue;
            }
            const val = r[idx];
            if (key.startsWith('valor') || key === 'aPagar') {
              obj[key] = Number(val) || 0;
            } else if (['previsao', 'emissao', 'vencimento', 'registro'].includes(key)) {
              obj[key] = excelToDate(val);
            } else {
              obj[key] = String(val ?? '');
            }
          }
          return obj;
        }).filter(Boolean);

        resolve({ results, map, headerRow });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsBinaryString(file);
  });
}
