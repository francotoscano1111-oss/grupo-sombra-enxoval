/**
 * ImportModal.jsx — Multi-format import wizard (CSV, Excel, OFX, PDF)
 * Step 1: Drop/select file → parse
 * Step 2: Map columns → preview
 * Step 3: Confirm import
 */
import React, { useState, useCallback } from 'react';
import { parseFile, applyColumnMapping } from '../../utils/parser';
import { fmtCurrency } from '../../utils/formatters';

export default function ImportModal({ module, onImport, onClose }) {
  const isDespesa = module === 'despesas';
  const [step, setStep]       = useState(1); // 1: upload, 2: mapping, 3: preview
  const [parsed, setParsed]   = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Column mapping state
  const [mapping, setMapping] = useState({
    data: '', descricao: '', valor: '', parceiro: '', status: '',
    ...(isDespesa ? { categoria: '' } : {}),
  });

  const [preview, setPreview] = useState([]);

  // File handling
  const handleFile = async (file) => {
    setError('');
    setLoading(true);
    try {
      const result = await parseFile(file);
      setParsed(result);
      // Auto-detect OFX: directly generate rows
      if (result.format === 'ofx') {
        const rows = result.transactions.map(t => ({
          data: t.data, descricao: t.descricao, valor: Math.abs(t.valor),
          parceiro: '', status: 'Pendente',
        }));
        onImport(rows);
        return;
      }
      if (result.format === 'pdf') {
        setError('PDF: apenas armazenamento de anexo disponível. Use CSV/Excel/OFX para importar lançamentos.');
        setLoading(false);
        return;
      }
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

  // Step 2: mapping
  const updateMapping = (field, col) => setMapping(prev => ({ ...prev, [field]: col }));

  const handlePreview = () => {
    const rows = applyColumnMapping((parsed?.rows || []).slice(0, 5), mapping);
    setPreview(rows);
    setStep(3);
  };

  const handleConfirm = () => {
    const all = applyColumnMapping(parsed?.rows || [], mapping);
    onImport(all);
  };

  const headers = parsed?.headers || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 96vw)', maxHeight: '90vh' }}>
        <h2 className="modal-title">📥 Importar {isDespesa ? 'Despesas' : 'Receitas'}</h2>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {['Arquivo', 'Colunas', 'Confirmar'].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: step > i+1 ? 'var(--color-green)' : step === i+1 ? 'var(--color-accent)' : 'var(--color-bg-hover)',
                color: step >= i+1 ? '#fff' : 'var(--color-text-muted)',
              }}>{i+1}</div>
              <span style={{ fontSize: 12, color: step === i+1 ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>{s}</span>
              {i < 2 && <span style={{ color: 'var(--color-border-light)' }}>›</span>}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ background: 'var(--color-red-dim)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 16px', color: 'var(--color-red)', marginBottom: 16, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* STEP 1: Upload */}
        {step === 1 && (
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              style={{
                border: `2px dashed ${dragging ? 'var(--color-accent)' : 'var(--color-border-light)'}`,
                borderRadius: 12, padding: 40, textAlign: 'center', cursor: 'pointer',
                background: dragging ? 'var(--color-accent-dim)' : 'var(--color-bg-secondary)',
                transition: 'all 0.15s ease', marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
              <p style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Arraste o arquivo aqui</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>CSV, Excel (.xlsx/.xls), OFX, PDF</p>
              <label style={{ display: 'inline-block', marginTop: 16 }}>
                <span className="btn btn-secondary">Escolher arquivo</span>
                <input type="file" accept=".csv,.xlsx,.xls,.ofx,.ofc,.pdf" style={{ display: 'none' }} onChange={handleFileInput} />
              </label>
            </div>
            {loading && <div style={{ textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>}
          </div>
        )}

        {/* STEP 2: Column mapping */}
        {step === 2 && parsed && (
          <div>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16, fontSize: 13 }}>
              ✅ <strong style={{ color: 'var(--color-text-primary)' }}>{parsed.rows?.length}</strong> linhas detectadas.
              Mapeie as colunas:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { field: 'data',      label: 'Data de Vencimento *' },
                { field: 'descricao', label: 'Descrição *' },
                { field: 'valor',     label: 'Valor *' },
                { field: 'parceiro',  label: isDespesa ? 'Fornecedor' : 'Cliente' },
                { field: 'status',    label: 'Status' },
                ...(isDespesa ? [{ field: 'categoria', label: 'Categoria' }] : []),
              ].map(({ field, label }) => (
                <div className="form-group" key={field}>
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
              <button className="btn btn-primary" onClick={handlePreview} disabled={!mapping.data || !mapping.descricao || !mapping.valor}>
                Pré-visualizar →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Preview & Confirm */}
        {step === 3 && (
          <div>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 12, fontSize: 13 }}>
              Prévia dos primeiros 5 registros de <strong style={{ color: 'var(--color-text-primary)' }}>{parsed?.rows?.length}</strong>:
            </p>
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead><tr><th>Data</th><th>Descrição</th><th>{isDespesa?'Fornecedor':'Cliente'}</th><th>Valor</th><th>Status</th></tr></thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td>{r.data || '—'}</td>
                      <td>{r.descricao || '—'}</td>
                      <td>{r.parceiro || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: isDespesa ? 'var(--color-red)' : 'var(--color-green)' }}>
                        {fmtCurrency(r.valor)}
                      </td>
                      <td><span className="badge badge-yellow">{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setStep(2)}>← Revisar mapeamento</button>
              <button className="btn btn-primary" id="btn-confirm-import" onClick={handleConfirm}>
                ✅ Importar {parsed?.rows?.length} registros
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
