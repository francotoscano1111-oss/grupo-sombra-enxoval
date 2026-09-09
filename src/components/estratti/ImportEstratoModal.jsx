/**
 * ImportEstratoModal.jsx — Import wizard for bank statements (Excel/OFX)
 * Steps:
 *   1 — File upload
 *   2 — Column mapping (Excel/CSV only)
 *   3 — Full scrollable preview
 *   4 — Fuzzy duplicate review (only shown when probable dupes exist)
 */
import React, { useState, useCallback } from 'react';
import { parseFile } from '../../utils/parser';
import { fmtCurrency, parseCurrency } from '../../utils/formatters';

// ── Similarity bar color helper ───────────────────────────────────────────────
function simColor(sim) {
  if (sim >= 0.85) return 'var(--color-red)';
  if (sim >= 0.70) return 'var(--color-yellow)';
  return 'var(--color-green)';
}

// ── Similarity bar component ──────────────────────────────────────────────────
function SimBar({ similarity }) {
  const pct = Math.round(similarity * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        flex: 1, height: 6, borderRadius: 3,
        background: 'var(--color-bg-hover)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: simColor(similarity),
          transition: 'width 0.3s',
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: simColor(similarity), minWidth: 34 }}>
        {pct}%
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ImportEstratoModal({ contaBancaria, onImport, checkFuzzyDups, onClose }) {
  const [step, setStep]         = useState(1);
  const [parsed, setParsed]     = useState(null);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [dragging, setDragging] = useState(false);

  // Column mapping for Excel/CSV
  const [mapping, setMapping] = useState({
    data: '', descricao: '', valor: '', tipo: '', saldo: '',
    documento: '', historico: '',
  });
  const [preview, setPreview] = useState([]);

  // Step 4 fuzzy review state
  const [fuzzyMatches, setFuzzyMatches]   = useState([]);   // [{newRow,existingRow,similarity,index}]
  const [skipped, setSkipped]             = useState(new Set()); // set of indices to skip
  const [cleanRows, setCleanRows]         = useState([]);   // rows confirmed safe to import
  const [checkingDups, setCheckingDups]   = useState(false);

  // ── File parsing ────────────────────────────────────────────────────────────
  const handleFile = async (file) => {
    setError('');
    setLoading(true);
    try {
      const result = await parseFile(file);

      if (result.format === 'ofx') {
        const rows = result.transactions.map(t => ({
          data:      t.data,
          descricao: t.descricao,
          valor:     t.valor,
          tipo:      t.valor >= 0 ? 'crédito' : 'débito',
          saldo:     null,
          documento: t.checknum || '',
          historico: '',
          _fonte: 'ofx',
        }));
        setParsed({ format: 'ofx', rows, count: rows.length });
        setPreview(rows);
        setStep(3);
        setLoading(false);
        return;
      }

      if (result.format === 'pdf') {
        setError('PDF não suportado para estratos. Use CSV, Excel ou OFX.');
        setLoading(false);
        return;
      }

      setParsed(result);
      setStep(2);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleFileInput = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };

  const updateMapping = (field, col) => setMapping(p => ({ ...p, [field]: col }));

  // ── Build rows from mapping ─────────────────────────────────────────────────
  const buildRows = (sourceRows) => sourceRows.map(row => {
    const rawValor = mapping.valor ? row[mapping.valor] : '';
    const rawTipo  = mapping.tipo  ? (row[mapping.tipo] || '') : '';
    let valor      = parseCurrency(rawValor);
    if (rawTipo.toLowerCase().includes('déb') || rawTipo.toLowerCase().includes('deb')) {
      valor = -Math.abs(valor);
    }
    return {
      data:      mapping.data      ? (row[mapping.data]      || '') : '',
      descricao: (mapping.descricao ? (row[mapping.descricao] || '') : '').trim(),
      valor,
      tipo:      valor >= 0 ? 'crédito' : 'débito',
      saldo:     mapping.saldo     ? parseCurrency(row[mapping.saldo]) : null,
      documento: mapping.documento ? (row[mapping.documento] || '') : '',
      historico: mapping.historico ? (row[mapping.historico] || '') : '',
      _fonte: 'excel',
    };
  });

  const handlePreview = () => {
    const rows = buildRows(parsed?.rows || []);
    setPreview(rows);
    setStep(3);
  };

  // ── Step 3 → fuzzy check → Step 4 or direct import ─────────────────────────
  const handleConfirm = async () => {
    const allRows = parsed?.format === 'ofx' ? parsed.rows : buildRows(parsed?.rows || []);

    if (!checkFuzzyDups) {
      onImport(allRows);
      return;
    }

    setCheckingDups(true);
    try {
      const { clean, fuzzy, exact } = await checkFuzzyDups(allRows);
      // exact → silently skipped; clean → import; fuzzy → user review
      const safeRows = clean.map(c => c.row);

      if (fuzzy.length === 0) {
        // No fuzzy matches → import directly
        onImport(safeRows);
      } else {
        setCleanRows(safeRows);
        setFuzzyMatches(fuzzy);
        setSkipped(new Set(fuzzy.map((_, i) => i))); // default: all fuzzy = skip
        setStep(4);
      }

      if (exact.length > 0) {
        console.info(`[ImportEstratoModal] ${exact.length} movimentos detectados como duplicatas exatas (auto-skip).`);
      }
    } catch (err) {
      console.error('[ImportEstratoModal] fuzzy check error:', err);
      const allRows2 = parsed?.format === 'ofx' ? parsed.rows : buildRows(parsed?.rows || []);
      onImport(allRows2);
    } finally {
      setCheckingDups(false);
    }
  };

  // ── Step 4 final import ─────────────────────────────────────────────────────
  const handleFinalImport = () => {
    const confirmed = fuzzyMatches
      .filter((_, i) => !skipped.has(i))
      .map(m => m.row);
    onImport([...cleanRows, ...confirmed]);
  };

  const toggleSkip = (i) => {
    setSkipped(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const headers    = parsed?.headers || [];
  const totalRows  = parsed?.rows?.length || parsed?.count || 0;
  const STEPS      = ['Arquivo', 'Colunas', 'Confirmar', 'Duplicatas'];
  const stepsShown = step <= 3 ? ['Arquivo', 'Colunas', 'Confirmar'] : STEPS;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(680px, 96vw)', maxHeight: '90vh' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <h2 className="modal-title" style={{ marginBottom: 4 }}>📥 Importar Extrato</h2>
          {contaBancaria && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '3px 10px', borderRadius: 20,
              background: contaBancaria.cor + '20', color: contaBancaria.cor,
              fontSize: 12, fontWeight: 600,
            }}>
              🏦 {contaBancaria.nome}
              {contaBancaria.conta && ` · ${contaBancaria.conta}`}
            </div>
          )}
        </div>

        {/* ── Step indicator ── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
          {stepsShown.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step > i+1 ? 'var(--color-green)' : step === i+1 ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                color: step >= i+1 ? '#fff' : 'var(--color-text-muted)',
              }}>{step > i+1 ? '✓' : i+1}</div>
              <span style={{ fontSize: 12, color: step === i+1 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{s}</span>
              {i < stepsShown.length - 1 && <span style={{ color: 'var(--color-border-light)', fontSize: 16 }}>›</span>}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: 'var(--color-red-dim)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 16px', color: 'var(--color-red)', marginBottom: 16, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STEP 1: Upload                                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              style={{
                border: `2px dashed ${dragging ? 'var(--color-accent)' : 'var(--color-border-light)'}`,
                borderRadius: 12, padding: 44, textAlign: 'center', cursor: 'pointer',
                background: dragging ? 'var(--color-accent-dim)' : 'var(--color-bg-secondary)',
                transition: 'all 0.15s ease', marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 44, marginBottom: 10 }}>🏦</div>
              <p style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 15 }}>
                Arraste o arquivo do extrato aqui
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>
                OFX (recomendado) · Excel (.xlsx/.xls) · CSV
              </p>
              <label style={{ display: 'inline-block', marginTop: 16 }}>
                <span className="btn btn-secondary">Escolher arquivo</span>
                <input
                  type="file"
                  accept=".ofx,.ofc,.csv,.xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={handleFileInput}
                />
              </label>
            </div>
            <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
              💡 <strong style={{ color: 'var(--color-text-secondary)' }}>OFX:</strong> importação automática sem configuração.
              &nbsp;<strong style={{ color: 'var(--color-text-secondary)' }}>Excel/CSV:</strong> mapeamento de colunas no próximo passo.
            </div>
            {loading && <div style={{ textAlign: 'center', marginTop: 16 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STEP 2: Column mapping (Excel/CSV)                                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {step === 2 && parsed && (
          <div>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16, fontSize: 13 }}>
              ✅ <strong style={{ color: 'var(--color-text-primary)' }}>{totalRows} linhas</strong> detectadas.
              Mapeie as colunas do extrato:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { field: 'data',      label: 'Data *',        hint: 'Data do lançamento' },
                { field: 'descricao', label: 'Descrição *',   hint: 'Histórico/Memo' },
                { field: 'valor',     label: 'Valor *',       hint: 'Valor do movimento' },
                { field: 'tipo',      label: 'Tipo/Natureza', hint: 'Crédito/Débito' },
                { field: 'saldo',     label: 'Saldo',         hint: 'Saldo após mov.' },
                { field: 'documento', label: 'Documento',     hint: 'Nº cheque, ref.' },
                { field: 'historico', label: 'Histórico',     hint: 'Complemento' },
              ].map(({ field, label, hint }) => (
                <div className="form-group" key={field} title={hint}>
                  <label className="form-label">{label}</label>
                  <select className="form-input" value={mapping[field]} onChange={e => updateMapping(field, e.target.value)}>
                    <option value="">— não importar —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← Voltar</button>
              <button
                className="btn btn-primary"
                onClick={handlePreview}
                disabled={!mapping.data || !mapping.descricao || !mapping.valor}
              >
                Pré-visualizar →
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STEP 3: Full scrollable preview                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: 0 }}>
                📋 <strong style={{ color: 'var(--color-text-primary)' }}>{preview.length}</strong> movimentos prontos para importar
              </p>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', background: 'var(--color-bg-hover)', padding: '2px 8px', borderRadius: 12 }}>
                Scroll para ver todos
              </span>
            </div>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 320, marginBottom: 12, borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
              <table className="data-table" style={{ fontSize: 12, marginBottom: 0 }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', zIndex: 1 }}>
                  <tr>
                    <th style={{ width: 36, textAlign: 'center', color: 'var(--color-text-muted)' }}>#</th>
                    <th>Data</th><th>Descrição</th><th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{i + 1}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap' }}>{r.data}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.descricao || '—'}</td>
                      <td>
                        <span className={`badge ${r.tipo === 'crédito' ? 'badge-green' : 'badge-red'}`}>
                          {r.tipo}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.tipo === 'crédito' ? 'var(--color-green)' : 'var(--color-red)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {r.tipo === 'crédito' ? '+' : ''}{fmtCurrency(r.valor)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {r.saldo != null ? fmtCurrency(r.saldo) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ background: 'var(--color-yellow-dim)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--color-yellow)', marginBottom: 16 }}>
              ⚡ Duplicatas exatas são ignoradas automaticamente. Movimentos similares (possíveis duplicatas entre OFX e Excel) serão revisados antes de importar.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(parsed?.format === 'ofx' ? 1 : 2)}>← Voltar</button>
              <button
                className="btn btn-primary"
                id="btn-confirm-import-extrato"
                onClick={handleConfirm}
                disabled={checkingDups}
              >
                {checkingDups
                  ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2, display: 'inline-block', marginRight: 8 }} />Verificando...</>
                  : `✅ Analisar e Importar ${preview.length} movimentos`}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STEP 4: Fuzzy duplicate review                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {step === 4 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 6px' }}>
                🔍 Encontramos <strong style={{ color: 'var(--color-yellow)' }}>{fuzzyMatches.length}</strong> transação(ões) similares a movimentos já existentes na base.
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: 0 }}>
                Revise cada par e <strong>desmarque</strong> aquelas que deseja importar mesmo assim. Por padrão todas estão marcadas como <em>duplicata (skip)</em>.
              </p>
            </div>

            {/* Fuzzy match cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto', paddingRight: 2 }}>
              {fuzzyMatches.map((match, i) => {
                const isSkipped = skipped.has(i);
                return (
                  <div
                    key={i}
                    style={{
                      border: `1px solid ${isSkipped ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
                      borderRadius: 10,
                      background: isSkipped ? 'var(--color-red-dim)' : 'rgba(74,222,128,0.05)',
                      padding: '10px 14px',
                      transition: 'all 0.2s',
                    }}
                  >
                    {/* Header row: skip toggle + similarity */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={isSkipped}
                          onChange={() => toggleSkip(i)}
                          style={{ width: 16, height: 16, accentColor: 'var(--color-red)', cursor: 'pointer' }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: isSkipped ? 'var(--color-red)' : 'var(--color-green)' }}>
                          {isSkipped ? '🚫 Tratar como duplicata (skip)' : '✅ Importar mesmo assim'}
                        </span>
                      </label>
                      <div style={{ minWidth: 160 }}>
                        <SimBar similarity={match.similarity} />
                      </div>
                    </div>

                    {/* Side-by-side comparison */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {/* Existing */}
                      <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Já na base
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                          {match.existingRow.data}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={match.existingRow.descricao}>
                          {match.existingRow.descricao || '—'}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4, color: Number(match.existingRow.valor) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                          {Number(match.existingRow.valor) >= 0 ? '+' : ''}{fmtCurrency(match.existingRow.valor)}
                        </div>
                        <div style={{ fontSize: 10, marginTop: 3, color: 'var(--color-text-muted)' }}>
                          fonte: {match.existingRow.fonte?.toUpperCase() || 'MANUAL'}
                        </div>
                      </div>

                      {/* New */}
                      <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          A importar
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                          {match.row.data}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={match.row.descricao}>
                          {match.row.descricao || '—'}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4, color: Number(match.row.valor) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                          {Number(match.row.valor) >= 0 ? '+' : ''}{fmtCurrency(match.row.valor)}
                        </div>
                        <div style={{ fontSize: 10, marginTop: 3, color: 'var(--color-text-muted)' }}>
                          fonte: {match.row._fonte?.toUpperCase() || 'EXCEL'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary + actions */}
            <div style={{ marginTop: 14 }}>
              <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                ✅ <strong style={{ color: 'var(--color-text-primary)' }}>{cleanRows.length}</strong> novos ·
                🚫 <strong style={{ color: 'var(--color-red)' }}>{skipped.size}</strong> pulados (duplicatas) ·
                ➕ <strong style={{ color: 'var(--color-green)' }}>{fuzzyMatches.length - skipped.size}</strong> fuzzy confirmados para importar
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setStep(3)}>← Voltar</button>
                <button
                  className="btn btn-primary"
                  id="btn-confirm-fuzzy-import"
                  onClick={handleFinalImport}
                >
                  ✅ Importar {cleanRows.length + (fuzzyMatches.length - skipped.size)} movimentos
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
