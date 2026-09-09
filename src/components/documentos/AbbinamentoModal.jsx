/**
 * AbbinamentoModal.jsx — Link a PDF document to a bank movement
 *
 * Supports two input modes:
 *   1. File from Drive folder (passed via `folderFile` prop — a File object)
 *   2. Direct upload (standard file picker fallback)
 *
 * The modal also lets the user:
 *   - Mark a movement as "Dispensado" (no file needed)
 *   - Set document tipo and notas
 *   - The linked movement is pre-filled when opened from Pendenti tab
 */
import React, { useState, useEffect } from 'react';

const TIPOS = ['NF-e', 'Contrato', 'Recibo', 'Boleto', 'Comprovante', 'Outro'];

export default function AbbinamentoModal({
  movimento,       // pre-filled movement object (from Pendenti) or null
  extratos,        // all movements list (for search when opening from Documentos tab)
  folderFile,      // File object from folder (optional)
  onSave,          // async (docData) => void
  onClose,
}) {
  const [file,         setFile]         = useState(folderFile || null);
  const [tipo,         setTipo]         = useState('NF-e');
  const [notas,        setNotas]        = useState('');
  const [docStatus,    setDocStatus]    = useState('Documentado');
  const [movSearch,    setMovSearch]    = useState('');
  const [selectedMov,  setSelectedMov]  = useState(movimento || null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  useEffect(() => {
    if (folderFile) setFile(folderFile);
  }, [folderFile]);

  // Search movements (only when not pre-filled)
  const movResults = !movimento && movSearch.trim().length >= 2
    ? extratos.filter(e => {
        const q = movSearch.toLowerCase();
        return (
          (e.descricao || '').toLowerCase().includes(q) ||
          (e.historico  || '').toLowerCase().includes(q) ||
          String(e.valor).includes(q)
        );
      }).slice(0, 8)
    : [];

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') setFile(f);
    else setError('Selecione um arquivo PDF válido');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedMov && !movimento) { setError('Selecione um movimento bancário.'); return; }
    if (docStatus === 'Documentado' && !file) { setError('Selecione um PDF ou escolha "Dispensado".'); return; }

    setSaving(true);
    setError('');
    try {
      const mov = selectedMov || movimento;

      // Optionally read file as dataURL for small preview storage
      let fileDataUrl = null;
      if (file && file.size < 2 * 1024 * 1024) { // only store if < 2MB
        fileDataUrl = await new Promise(res => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.readAsDataURL(file);
        });
      }

      await onSave({
        fileName:           file?.name || '',
        fileSize:           file?.size || 0,
        fileDataUrl,
        movimentoId:        mov.id,
        movimentoData:      mov.data,
        movimentoValor:     mov.valor,
        movimentoDescricao: mov.descricao || mov.historico || '',
        contaBancariaId:    mov.contaBancariaId || '',
        contaBancariaNome:  mov.contaBancariaNome || '',
        tipo,
        notas,
        docStatus,
      });
    } catch (err) {
      setError('Erro ao salvar: ' + err.message);
      setSaving(false);
    }
  };

  const fmtCurrency = v => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}
        style={{ width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>

        <h2 className="modal-title">📎 Vincular Documento</h2>

        <form onSubmit={handleSubmit}>

          {/* Status toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['Documentado', 'Dispensado'].map(s => (
              <button key={s} type="button"
                className={`btn ${docStatus === s ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                onClick={() => setDocStatus(s)}>
                {s === 'Documentado' ? '📎 Documentar' : '✓ Dispensar (sem doc)'}
              </button>
            ))}
          </div>

          {/* Movement: pre-filled or searchable */}
          {movimento ? (
            <div style={{ background: 'var(--color-bg-hover)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>Movimento vinculado</div>
              <div style={{ fontWeight: 600 }}>{movimento.descricao || movimento.historico || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {fmtDate(movimento.data)} · <span style={{ color: movimento.valor < 0 ? 'var(--color-red)' : 'var(--color-green)', fontFamily: 'var(--font-mono)' }}>{fmtCurrency(movimento.valor)}</span>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label">🔍 Buscar movimento bancário</label>
              <input className="form-input" placeholder="Digite descrição, valor..."
                value={movSearch} onChange={e => { setMovSearch(e.target.value); setSelectedMov(null); }} />
              {movResults.length > 0 && (
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, marginTop: 4, overflow: 'hidden' }}>
                  {movResults.map(m => (
                    <button key={m.id} type="button"
                      style={{ display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
                               background: selectedMov?.id === m.id ? 'var(--color-accent-dim)' : 'var(--color-bg-hover)',
                               border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', fontSize: 13 }}
                      onClick={() => { setSelectedMov(m); setMovSearch(m.descricao || m.historico || ''); }}>
                      <span style={{ fontWeight: 600 }}>{m.descricao || m.historico || '—'}</span>
                      <span style={{ float: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-red)' }}>
                        {fmtCurrency(m.valor)} · {fmtDate(m.data)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* File input (only for Documentado) */}
          {docStatus === 'Documentado' && (
            <div className="form-group">
              <label className="form-label">📄 Arquivo PDF</label>
              {file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-bg-hover)', padding: '8px 12px', borderRadius: 8 }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }}
                    onClick={() => setFile(null)}>✕</button>
                </div>
              ) : (
                <label style={{ display: 'block', border: '2px dashed var(--color-border)', borderRadius: 8,
                  padding: '20px', textAlign: 'center', cursor: 'pointer' }}>
                  <div style={{ fontSize: 28, marginBottom: 4 }}>📂</div>
                  <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Clique para selecionar PDF</div>
                  <input type="file" accept=".pdf" onChange={handleFileChange} style={{ display: 'none' }} />
                </label>
              )}
            </div>
          )}

          {/* Tipo + Notas */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Tipo documento</label>
              <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Notas (opzionale)</label>
              <input className="form-input" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Es. NF nº 000015426..." />
            </div>
          </div>

          {error && <div style={{ color: 'var(--color-red)', fontSize: 13, marginBottom: 8 }}>❌ {error}</div>}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '⏳ Salvando...' : docStatus === 'Dispensado' ? '✓ Marcar Dispensado' : '📎 Vincular'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
