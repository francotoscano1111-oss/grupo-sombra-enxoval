import * as XLSX from 'xlsx';

// Convert Excel serial date to YYYY-MM-DD
function excelDateToISO(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    // Try common Brazilian formats dd/mm/yyyy or yyyy-mm-dd
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return String(v);
}

function excelDateToMonth(v) {
  const iso = excelDateToISO(v);
  return iso ? iso.slice(0, 7) : '';
}

// Normalize header for comparison: remove accents, lowercase, keep only alphanum
function nh(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Field → array of normalized aliases (order = priority)
export const NFS_ALIASES = {
  numero:            ['ndanota', 'numerodanota', 'numeronf', 'numeronota', 'numero', 'nf', 'nfs', 'nota', 'num', 'n', 'nnfse'],
  dataEmissao:       ['datadaemissaodanota', 'datadaemissao', 'dataemissaodanota', 'dataemissao',
                      'dataemit', 'dtemissao', 'emissao', 'data', 'dataemi', 'datanota', 'dtemi'],
  competencia:       ['competencia', 'mescompetencia', 'comp', 'mescomp'],
  codigoNfse:        ['ndarpsdeorig', 'ndarpsdeorig', 'ndarps', 'codigonfse', 'codigoverificacao',
                      'codigonf', 'codverif', 'codigo', 'rps', 'nrps'],
  situacaoNota:      ['statusdanota', 'situacaodanota', 'situacaonota', 'situacao', 'status', 'statusnota', 'situacaonfs'],
  situacaoPagamento: ['statusdepagamento', 'statusdopagamento', 'situacaopagamento', 'statuspagamento', 'situacaopgto', 'pagamento', 'pgto'],
  cnpjPrestador:     ['cnpjprestador', 'cpfcnpjprestador', 'prestadorcnpj', 'cnpjemitente'],
  nomePrestador:     ['nomeprestador', 'razaosocialprestador', 'prestador', 'emitente'],
  cnpjTomador:       ['cnpjtomador', 'cpfcnpjtomador', 'cpfcnpj', 'tomadorcnpj', 'cnpjcliente'],
  nomeTomador:       ['denominacaodotomador', 'denominacaotomador', 'nometomador',
                      'razaosocialtomador', 'tomador', 'cliente', 'nomedocliente'],
  valorServico:      ['valordoservico', 'valorservico', 'valorservicos', 'valorbruto',
                      'vlrservico', 'vlservico', 'valornf', 'valor', 'valortotal', 'valorliquido', 'vldoserv'],
  deducoes:          ['deducoes', 'deducao', 'desconto', 'deducaovalor', 'deducoesreducoes'],
  aliquota:          ['aliquota', 'aliquotaissqn', 'aliq', 'aliquotaiss', 'aliquotaissqndanota'],
  retencao:          ['retidonafonte', 'retencao', 'valorretencao', 'issqnretido', 'valorretencaoiss'],
  issqn:             ['valordoissqn', 'issqn', 'valorissqn', 'issqncalculado', 'vlissqn',
                      'issqntotal', 'iss', 'valoriss', 'issqnapurado', 'valorissqn', 'issqnapurado'],
  tipoRetencao:      ['tiporetencao', 'tipoissqn', 'retencaotipo'],
  descricao:         ['descricao', 'discriminacao', 'descricaoservico', 'descricaodoservico', 'historico', 'obs',
                      'descriservico', 'discriminacaoservico', 'discriminacaodoservico'],
  localPrestacao:    ['localprestacao', 'municipioprestacao', 'cidadeprestacao', 'localservico'],
  localTomador:      ['localtomador', 'municipiotomador'],
};

function buildMapping(headerRow) {
  const map = {};
  const normHeaders = headerRow.map(h => nh(h));
  for (const [field, aliases] of Object.entries(NFS_ALIASES)) {
    for (const alias of aliases) {
      const col = normHeaders.indexOf(alias);
      if (col !== -1 && !(field in map)) { map[field] = col; break; }
    }
  }
  return map;
}

export function parseNfsExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary', cellDates: false });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const raw  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Find header row: first row with >= 4 non-empty string cells
        let hIdx = 0;
        for (let i = 0; i < Math.min(15, raw.length); i++) {
          const strCells = (raw[i] || []).filter(c => typeof c === 'string' && c.trim().length > 0);
          if (strCells.length >= 4) { hIdx = i; break; }
        }

        const headerRow     = raw[hIdx] || [];
        const map           = buildMapping(headerRow);
        const detectedHeaders = headerRow.map((h, i) => `[${i}] ${String(h)}`).join(' | ');

        console.info('[NFS Parser] Sheet:', wb.SheetNames[0]);
        console.info('[NFS Parser] Header row idx:', hIdx);
        console.info('[NFS Parser] Headers:', detectedHeaders);
        console.info('[NFS Parser] Mapping:', map);

        const get  = (row, field) => map[field] !== undefined ? row[map[field]] : '';
        const getN = (row, field) => { const v = get(row, field); return v === '' ? 0 : (Number(v) || 0); };
        const getS = (row, field) => String(get(row, field) || '').trim();

        const parsed = [];
        for (let i = hIdx + 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r || r.every(c => c === '' || c === null || c === undefined)) continue;

          // Use mapped numero OR fallback to column 0
          const rawNum = map.numero !== undefined ? r[map.numero] : r[0];
          if (rawNum === '' || rawNum === null || rawNum === undefined) continue;

          parsed.push({
            numero:            String(rawNum).trim(),
            dataEmissao:       excelDateToISO(get(r, 'dataEmissao')),
            competencia:       excelDateToMonth(get(r, 'competencia') || get(r, 'dataEmissao')),
            codigoNfse:        getS(r, 'codigoNfse'),
            situacaoNota:      getS(r, 'situacaoNota')      || 'Normal',
            situacaoPagamento: getS(r, 'situacaoPagamento') || 'Pendente',
            cnpjPrestador:     getS(r, 'cnpjPrestador'),
            nomePrestador:     getS(r, 'nomePrestador'),
            cnpjTomador:       getS(r, 'cnpjTomador'),
            nomeTomador:       getS(r, 'nomeTomador'),
            valorServico:      getN(r, 'valorServico'),
            deducoes:          getN(r, 'deducoes'),
            aliquota:          getN(r, 'aliquota'),
            retencao:          getN(r, 'retencao'),
            issqn:             getN(r, 'issqn'),
            tipoRetencao:      getS(r, 'tipoRetencao'),
            descricao:         getS(r, 'descricao'),
            localPrestacao:    getS(r, 'localPrestacao'),
            localTomador:      getS(r, 'localTomador'),
          });
        }

        resolve({ parsed, detectedHeaders, map });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsBinaryString(file);
  });
}
