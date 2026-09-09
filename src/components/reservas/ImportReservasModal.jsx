/**
 * ImportReservasModal.jsx — Import Reservas from Excel (Arcoiris_Registro reservas Hits.xlsx format)
 */
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker for Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/** Excel serial → ISO date string (YYYY-MM-DD) */
function excelToDate(serial) {
  if (!serial || typeof serial !== 'number') return '';
  const d = new Date(Math.round((Math.floor(serial) - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

/** Parse Brazilian currency string "$9.900,80" → number */
function parseBRL(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return Number(String(str).replace(/\$\s*/, '').replace(/\./g, '').replace(',', '.')) || 0;
}

/** Parse Pax field — can be "2/0" string or Excel date serial artifact */
function parsePax(val) {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' && val > 0 && val < 20) return String(val); // small number = pax count
  return '—'; // Excel date artifact (>40000)
}

// Normalize header for comparison
function nh(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const ALIASES = {
  voucher:      ['voucher', 'oucher', 'numerodovoucher', 'codigoreserva', 'idreserva', 'nreserva', 'nro'],
  inclusao:     ['datadeinclusao', 'inclusao', 'dataincl', 'dtincl', 'cadastradoem'],
  checkin:      ['checkin', 'in', 'datadechegada', 'datachegada', 'entrada', 'dtentrada'],
  checkout:     ['checkout', 'out', 'datadesaida', 'datasaida', 'saida', 'dtsaida'],
  rn:           ['rn', 'roomnights', 'noites', 'diarias', 'quantidadediarias'],
  pax:          ['pax', 'pessoas', 'hospedes', 'paxpax'],
  diarias:      ['valorasdiarias', 'valordiarias', 'diariastotal', 'vlrdiarias'],
  valorReserva: ['valordareserva', 'valorreserva', 'totalreserva', 'vlrreserva', 'total', 'reserva'],
  hospede:      ['nomedohospede', 'hospede', 'cliente', 'nomehospede', 'hospedeprincipal'],
  empresa:      ['empresa', 'razaosocial', 'agencia', 'operadora'],
  apto:         ['apto', 'apartamento', 'uh', 'unidade', 'quarto'],
  categoria:    ['categoria', 'tipoapto', 'categoriauh', 'cat'],
  tarifa:       ['tarifa', 'tar'],
  credito:      ['credito', 'cred'],
  status:       ['status', 'situacao', 'estado'],
};

function buildMapping(headerRow) {
  const map = {};
  const normHeaders = headerRow.map(h => nh(h));
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const colIdx = normHeaders.indexOf(aliases.find(a => normHeaders.includes(a)));
    if (colIdx !== -1) map[field] = colIdx;
  }
  return map;
}

function parseReservasExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary', raw: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        
        // Let's check if it is the "Concept" Layout
        // Concept uses specific headers like "Hóspede Principal", "Hospedagem", "Hospedagem Total"
        const firstRowStr = (rows[0] || []).map(r => String(r).toLowerCase()).join('|');
        const isConceptLayout = firstRowStr.includes('hospedagem') && (firstRowStr.includes('hospede') || firstRowStr.includes('hóspede'));

        if (isConceptLayout) {
          const resultsMap = new Map();
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Main row starts with a number (voucher)
            if (!row || !row[0] || isNaN(parseInt(row[0], 10))) continue;
            
            const voucher = String(row[0]).trim();
            // Concept lists each reservation multiple times, e.g. once per guest. 
            // We ignore subsequent rows for the same voucher to avoid double counting values!
            if (resultsMap.has(voucher)) continue;

            const hospede = String(row[1] || '').trim();
            const apto = String(row[2] || '').trim();
            
            const hospedagem = String(row[3] || '');
            const dates = hospedagem.match(/(\d{2})\/(\d{2})\/(\d{4})/g);
            let checkin = '', checkout = '', rn = 1;
            if (dates && dates.length >= 2) {
              checkin = dates[0].split('/').reverse().join('-');
              checkout = dates[1].split('/').reverse().join('-');
              const d1 = new Date(checkin);
              const d2 = new Date(checkout);
              rn = Math.max(1, Math.round((d2 - d1) / 86400000));
            }
            
            const adultos = Number(row[4]) || 0;
            const criancas = Number(row[5]) || 0;
            const pax = String(adultos + criancas) || '—';
            
            const status = String(row[6] || 'Realizada').trim();
            
            let valorReserva = 0;
            const vVal = row[10];
            if (typeof vVal === 'number') {
              valorReserva = vVal;
            } else if (typeof vVal === 'string') {
              const vStr = vVal.trim();
              if (/\d+,\d{1,2}$/.test(vStr) || (vStr.includes(',') && vStr.includes('.'))) {
                valorReserva = Number(vStr.replace(/\./g, '').replace(',', '.')) || 0;
              } else {
                valorReserva = Number(vStr.replace(',', '.')) || 0;
              }
            }
            
            let empresa = '';
            const metaRow = rows[i + 1] || [];
            if (metaRow[0] && String(metaRow[0]).includes('Loc. OTA')) {
               const empCell = metaRow.find(c => String(c).trim().startsWith('Empresa'));
               if (empCell) empresa = String(empCell).replace('Empresa', '').trim();
               i++; // Skip meta row
            }

            resultsMap.set(voucher, {
              voucher, checkin, checkout, rn, pax, diarias: 0, valorReserva, hospede, empresa, apto, categoria: '', status
            });
          }
          const results = Array.from(resultsMap.values());
          return resolve({ results, map: { voucher: 1, checkin: 1, valorReserva: 1 }, headerRow: ['Concept Excel Layout'] });
        }

        // --- Standard (HITs) Layout ---
        // Find header row (first row with >= 4 headers matched or >= 6 columns)
        let hIdx = 0;
        for (let i = 0; i < Math.min(15, rows.length); i++) {
          const m = buildMapping(rows[i] || []);
          if (Object.keys(m).length >= 4) { hIdx = i; break; }
        }

        const headerRow = rows[hIdx] || [];
        const map = buildMapping(headerRow);
        
        const rawResults = rows.slice(hIdx + 1).filter(r => r.length > 0).map(r => {
          const voucher = map.voucher !== undefined ? String(r[map.voucher] ?? '').trim() : '';
          if (!voucher) return null;

          return {
            voucher,
            inclusao:     map.inclusao !== undefined ? excelToDate(r[map.inclusao]) : '',
            checkin:      map.checkin  !== undefined ? excelToDate(r[map.checkin]) : '',
            checkout:     map.checkout !== undefined ? excelToDate(r[map.checkout]) : '',
            rn:           map.rn !== undefined ? Number(r[map.rn]) || 0 : 0,
            pax:          map.pax !== undefined ? parsePax(r[map.pax]) : '—',
            diarias:      map.diarias !== undefined ? parseBRL(r[map.diarias]) : 0,
            valorReserva: map.valorReserva !== undefined ? parseBRL(r[map.valorReserva]) : 0,
            hospede:      map.hospede !== undefined ? String(r[map.hospede] || '') : '',
            empresa:      map.empresa !== undefined ? String(r[map.empresa] || '') : '',
            apto:         map.apto !== undefined ? String(r[map.apto] || '') : '',
            categoria:    map.categoria !== undefined ? String(r[map.categoria] || '') : '',
            status:       map.status !== undefined ? String(r[map.status] || 'Realizada') : 'Realizada',
          };
        }).filter(Boolean);

        const resultsMap = new Map();
        for (const res of rawResults) {
          if (!resultsMap.has(res.voucher)) {
            resultsMap.set(res.voucher, res);
          }
        }
        const results = Array.from(resultsMap.values());

        resolve({ results, map, headerRow });
      } catch (err) { reject(err); }
    };
    reader.readAsBinaryString(file);
  });
}

async function parseReservasPDF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedArray = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          let lastY = -1;
          let line = '';
          for (const item of textContent.items) {
            if (lastY !== item.transform[5] && lastY !== -1) {
              fullText += line + '\n';
              line = '';
            }
            line += item.str + ' | ';
            lastY = item.transform[5];
          }
          fullText += line + '\n';
        }

        const lines = fullText.split('\n');
        const results = [];
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^\s*\|\s*\d{3,6}\s*\|/.test(line)) {
            const parts = line.split('|').map(s => s.trim());
            // Map the pipe-separated values:
            // " | 7689 |  | 2025-01-05 |  | 2025-01-11 | 04 |  | - |  | 16.285,50 |"
            const voucher = parts[1];
            const checkin = parts[3] !== '-' ? parts[3] : '';
            const checkout = parts[5] !== '-' ? parts[5] : '';
            const apto = parts[6] && !parts[6].includes('-') ? parts[6] : '';
            
            let valorReserva = 0;
            for (let j = 8; j < parts.length; j++) {
              if (parts[j] && parts[j].includes(',') && /\d/.test(parts[j])) {
                valorReserva = Number(parts[j].replace(/\./g, '').replace(',', '.'));
                break;
              }
            }

            // Extract Hospede Name from adjacent lines (looking at 2 lines above and below)
            let hospede = '';
            for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j++) {
              if (j === i) continue;
              const adj = lines[j].trim();
              if (adj && !adj.startsWith('|') && !adj.includes('2024-') && !adj.includes('2025-') && !adj.includes('Hospedagem')) {
                hospede += adj.replace(/\|/g, '').trim() + ' ';
              }
            }

            // Calculate RN from dates if possible
            let rn = 1;
            if (checkin && checkout && checkin.length === 10 && checkout.length === 10) {
               const start = new Date(checkin);
               const end = new Date(checkout);
               const diff = Math.round((end - start) / 86400000);
               if (diff > 0) rn = diff;
            }

            results.push({
              voucher,
              checkin,
              checkout,
              rn,
              pax: '—',
              diarias: 0,
              valorReserva,
              hospede: hospede.trim() || 'Hóspede não identificado',
              empresa: 'Concept Prime',
              apto,
              categoria: '',
              status: 'Realizada'
            });
          }
        }
        
        resolve({ results, map: { voucher: 1, checkin: 1, valorReserva: 1 }, headerRow: ['Concept PDF Import'] });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Falha ao ler PDF'));
    reader.readAsArrayBuffer(file);
  });
}

export default function ImportReservasModal({ checkDuplicates, onImport, onClose }) {
  const [file,      setFile]      = useState(null);
  const [preview,   setPreview]   = useState([]);
  const [parsed,    setParsed]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [error,     setError]     = useState('');

  const [reviewingDups, setReviewingDups] = useState(false);
  const [cleanRows, setCleanRows]         = useState([]);
  const [fuzzyMatches, setFuzzyMatches]   = useState([]);
  const [skipped, setSkipped]             = useState(new Set());

  const [diagnostics, setDiagnostics] = useState(null);

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setError(''); setDiagnostics(null);
    setLoading(true);
    try {
      const isPdf = f.name.toLowerCase().endsWith('.pdf');
      const { results, map, headerRow } = isPdf 
        ? await parseReservasPDF(f) 
        : await parseReservasExcel(f);
        
      setParsed(results);
      setPreview(results.slice(0, 15));

      if (!isPdf) {
        const missing = ['voucher', 'checkin', 'valorReserva'].filter(f => map[f] === undefined);
        if (missing.length > 0) {
          setDiagnostics({
            error: `Campos não mapeados: ${missing.join(', ')}`,
            headers: headerRow.map((h, i) => `[${i}] ${h}`).join(' | ')
          });
        }
      }
    } catch (err) {
      setError('Erro ao processar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!parsed.length) return;
    setImporting(true);
    try {
      if (!reviewingDups && checkDuplicates) {
         const { clean, duplicates } = await checkDuplicates(parsed);
         if (duplicates.length > 0) {
            setCleanRows(clean.map(c => c.row));
            setFuzzyMatches(duplicates);
            setSkipped(new Set(duplicates.map((_, i) => i)));
            setReviewingDups(true);
            setImporting(false);
            return;
         }
      }

      const toImport = reviewingDups 
        ? [...cleanRows, ...fuzzyMatches.filter((_,i) => !skipped.has(i)).map(m => m.row)]
        : parsed;

      const count = await onImport(toImport);
      onClose(count);
    } catch (err) {
      setError('Erro ao importar: ' + err.message);
      setImporting(false);
    }
  };

  const toggleSkip = (i) => {
    setSkipped(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const totalRN    = parsed.reduce((s, r) => s + r.rn, 0);
  const totalValor = parsed.reduce((s, r) => s + r.valorReserva, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="modal-title">📥 Importar Registro de Reservas</h2>

        <label style={{
          display: 'block', border: '2px dashed var(--color-border)', borderRadius: 10,
          padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: 16,
          background: file ? 'rgba(93,124,242,0.06)' : 'var(--color-bg-hover)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{file ? '🏨' : '📂'}</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {file ? file.name : 'Clique para selecionar o arquivo (Excel ou PDF)'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Formato aceito: <strong>.xlsx, .pdf</strong> (HITs ou Concept)
          </div>
          <input type="file" accept=".xlsx,.xls,.pdf" onChange={handleFile} style={{ display: 'none' }} />
        </label>

        {loading && <div style={{ textAlign: 'center', padding: 20 }}>⏳ Processando...</div>}
        {error   && <div style={{ color: 'var(--color-red)', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 8, marginBottom: 12 }}>❌ {error}</div>}
        
        {diagnostics && (
          <div style={{ color: 'var(--color-yellow)', padding: '8px 12px', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>⚠️ {diagnostics.error}</div>
            <div style={{ fontSize: 10, marginTop: 4, opacity: 0.8, wordBreak: 'break-all' }}>Colunas detectadas: {diagnostics.headers}</div>
          </div>
        )}

        {parsed.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Reservas',    value: parsed.length,                                  color: 'var(--color-accent)' },
              { label: 'Total RN',    value: totalRN + ' room nights',                       color: 'var(--color-blue)' },
              { label: 'Valor Total', value: 'R$ ' + totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), color: 'var(--color-green)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: 'var(--color-bg-hover)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {preview.length > 0 && !reviewingDups && (
          <div style={{ marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Pré-visualização (primeiras {preview.length} de {parsed.length}):
            </div>
            <table className="data-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Voucher</th><th>Check-in</th><th>Check-out</th>
                  <th>RN</th><th>Hóspede</th><th>Empresa</th>
                  <th style={{ textAlign: 'right' }}>Valor</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.voucher}</td>
                    <td>{r.checkin}</td>
                    <td>{r.checkout}</td>
                    <td style={{ textAlign: 'center' }}>{r.rn}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.hospede}</td>
                    <td>{r.empresa}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-green)' }}>
                      {r.valorReserva.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td><span className="badge badge-green">{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reviewingDups && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: 'var(--color-red-dim)', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
              <h4 style={{ color: 'var(--color-red)', margin: '0 0 8px 0', fontSize: 14 }}>⚠️ Duplicatas Encontradas</h4>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-primary)' }}>
                Encontramos <strong>{fuzzyMatches.length}</strong> reservas que já existem no sistema. 
                Por padrão elas não serão importadas. Desmarque a caixa se quiser forçar a importação.
              </p>
            </div>
            
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
              {fuzzyMatches.map((match, i) => {
                const isSkipped = skipped.has(i);
                return (
                  <div key={i} style={{
                    border: `1px solid ${isSkipped ? 'var(--color-red)' : 'var(--color-green)'}`,
                    borderRadius: 8, padding: '10px 14px',
                    background: isSkipped ? 'var(--color-red-dim)' : 'rgba(74,222,128,0.05)',
                  }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                      <input type="checkbox" checked={isSkipped} onChange={() => toggleSkip(i)} style={{ accentColor: 'var(--color-red)' }} />
                      <strong style={{ fontSize: 13, color: isSkipped ? 'var(--color-red)' : 'var(--color-green)' }}>
                        {isSkipped ? '🚫 Ignorar Duplicata (Skip)' : '✅ Forçar Importação'}
                      </strong>
                    </label>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      Voucher: <strong style={{ color: 'var(--color-text-primary)' }}>{match.row.voucher}</strong> | 
                      Hóspede: <strong>{match.row.hospede}</strong> | 
                      Valor: <strong style={{ color: 'var(--color-green)' }}>R$ {match.row.valorReserva?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => onClose(0)}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleImport} disabled={!parsed.length || importing}>
            {importing ? '⏳ Importando...' : (reviewingDups ? `✅ Confirmar (${cleanRows.length + (fuzzyMatches.length - skipped.size)})` : `📥 Analisar e Importar ${parsed.length} reservas`)}
          </button>
        </div>
      </div>
    </div>
  );
}
