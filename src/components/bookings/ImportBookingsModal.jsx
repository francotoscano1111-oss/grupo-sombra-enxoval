/**
 * ImportBookingsModal.jsx — Import Bookings from Booking.com Excel report
 * Format: "Arcoiris Relatorio Booking x Hits.xlsx"
 * Dates in PT-BR textual format: "30 de jan. de 2026", "1º de fev. de 2026"
 */
import React, { useState } from 'react';
import * as XLSX from 'xlsx';

const MONTHS = {
  'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
  'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
  'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
};

/** Parse "30 de jan. de 2026" or "1º de fev. de 2026" → "2026-01-30" */
function parsePTDate(str) {
  if (!str || typeof str !== 'string') return '';
  // Remove ordinal º and split
  const clean = str.replace(/º/g, '').toLowerCase().trim();
  // matches: "30 de jan. de 2026" or "1 de jan. de 2026"
  const m = clean.match(/^(\d+)\s+de\s+(\w+)\.?\s+de\s+(\d{4})$/);
  if (!m) return '';
  const day   = m[1].padStart(2, '0');
  const month = MONTHS[m[2].slice(0, 3)] || '01';
  const year  = m[3];
  return `${year}-${month}-${day}`;
}

/** Parse "R$ 3.258,14" → number */
function parseBRL(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  return Number(String(str).replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

// Normalize header for comparison
function nh(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const ALIASES = {
  nReserva:   ['numerodareserva', 'nreserva', 'nroreserva', 'idreserva', 'reserva', 'n'],
  nomHospede: ['nomedohospede', 'hospede', 'cliente', 'nomehospede', 'hospedeprincipal'],
  checkin:    ['checkin', 'datadechegada', 'entrada', 'dtentrada', 'chegada'],
  checkout:   ['checkout', 'datadesaida', 'saida', 'dtsaida', 'saida'],
  tipo:       ['tipo', 'status', 'situacao', 'estadodareserva'],
  valor:      ['valor', 'valortotal', 'total', 'vlr', 'vlrtotal'],
  commissao:  ['comissao', 'valorcomissao', 'vlrcomissao', 'feecharge'],
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

function parseBookingsExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary', raw: true });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

        // Find header row: first row with >= 3 headers matched
        let hIdx = 0;
        for (let i = 0; i < Math.min(15, rows.length); i++) {
          const m = buildMapping(rows[i] || []);
          if (Object.keys(m).length >= 3) { hIdx = i; break; }
        }

        const headerRow = rows[hIdx] || [];
        const map = buildMapping(headerRow);

        const results = rows.slice(hIdx + 1).filter(r => r.length > 0).map(r => {
          const nReserva = map.nReserva !== undefined ? String(r[map.nReserva] ?? '').trim() : '';
          if (!nReserva || nReserva === '0') return null;

          return {
            nReserva,
            nomHospede: map.nomHospede !== undefined ? String(r[map.nomHospede] ?? '')  : '',
            checkin:    map.checkin    !== undefined ? parsePTDate(r[map.checkin])     : '',
            checkout:   map.checkout   !== undefined ? parsePTDate(r[map.checkout])    : '',
            tipo:       map.tipo       !== undefined ? String(r[map.tipo] ?? 'Concluída') : 'Concluída',
            valor:      map.valor      !== undefined ? parseBRL(r[map.valor])          : 0,
            commissao:  map.commissao  !== undefined ? parseBRL(r[map.commissao])      : 0,
          };
        }).filter(Boolean);

        resolve({ results, map, headerRow });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsBinaryString(file);
  });
}

const TIPO_BADGE = {
  'Concluída':           'badge-green',
  'Cancelada':           'badge-red',
  'Não comparecimento':  'badge-yellow',
};

export default function ImportBookingsModal({ onImport, checkDuplicates, onClose }) {
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
      const { results, map, headerRow } = await parseBookingsExcel(f);
      setParsed(results);
      setPreview(results.slice(0, 5));

      const missing = ['nReserva', 'checkin', 'valor'].filter(f => map[f] === undefined);
      if (missing.length > 0) {
        setDiagnostics({
          error: `Campos não mapeados: ${missing.join(', ')}`,
          headers: headerRow.map((h, i) => `[${i}] ${h}`).join(' | ')
        });
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

  const fmtBRL = v => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const totalValor      = parsed.reduce((s, r) => s + r.valor, 0);
  const totalCommissao  = parsed.reduce((s, r) => s + r.commissao, 0);
  const concluidas      = parsed.filter(r => r.tipo === 'Concluída').length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(700px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="modal-title">📥 Importar Bookings (Booking.com)</h2>

        <label style={{
          display: 'block', border: '2px dashed var(--color-border)', borderRadius: 10,
          padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: 16,
          background: file ? 'rgba(93,124,242,0.06)' : 'var(--color-bg-hover)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{file ? '📋' : '📂'}</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {file ? file.name : 'Clique para selecionar o arquivo Excel'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Formato: <strong>.xlsx</strong> — Arcoiris Relatorio Booking x Hits.xlsx
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
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
              { label: 'Reservas',    value: parsed.length, color: 'var(--color-accent)' },
              { label: 'Concluídas',  value: concluidas,    color: 'var(--color-green)' },
              { label: 'Valor Total', value: fmtBRL(totalValor),     color: 'var(--color-blue)' },
              { label: 'Comissão',    value: fmtBRL(totalCommissao), color: 'var(--color-yellow)' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: 'var(--color-bg-hover)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {preview.length > 0 && !reviewingDups && (
          <div style={{ marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Pré-visualização ({preview.length} de {parsed.length}):
            </div>
            <table className="data-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Nº Reserva</th><th>Hóspede</th><th>Check-in</th><th>Check-out</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th style={{ textAlign: 'right' }}>Comissão</th><th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.nReserva}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nomHospede}</td>
                    <td>{r.checkin}</td>
                    <td>{r.checkout}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-green)' }}>{fmtBRL(r.valor)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-yellow)' }}>{fmtBRL(r.commissao)}</td>
                    <td><span className={`badge ${TIPO_BADGE[r.tipo] || 'badge-accent'}`}>{r.tipo}</span></td>
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
                Encontramos <strong>{fuzzyMatches.length}</strong> bookings que já existem no sistema. 
                Por padrão eles não serão importados. Desmarque a caixa se quiser forçar a importação.
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
                      Nº Reserva: <strong style={{ color: 'var(--color-text-primary)' }}>{match.row.nReserva}</strong> | 
                      Valor: <strong style={{ color: 'var(--color-green)' }}>R$ {match.row.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
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
            {importing ? '⏳ Importando...' : (reviewingDups ? `✅ Confirmar (${cleanRows.length + (fuzzyMatches.length - skipped.size)})` : `📥 Analisar e Importar ${parsed.length} bookings`)}
          </button>
        </div>
      </div>
    </div>
  );
}
