/**
 * ImportContasPagarModal.jsx — Import Contas a Pagar from Excel (CONTAS Á PAGAR-pivot.xlsx)
 */
import React, { useState } from 'react';
import { parseContasExcel } from '../../utils/parsers/contasPagarParser';

export default function ImportContasPagarModal({ onImport, checkDuplicates, onClose }) {
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
      const { results, map, headerRow } = await parseContasExcel(f);
      setParsed(results);
      setPreview(results.slice(0, 5));

      const missing = ['fornecedor', 'vencimento', 'valorConta'].filter(f => map[f] === undefined);
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

  const totalAPagar  = parsed.reduce((s, r) => s + r.aPagar, 0);
  const totalPago    = parsed.reduce((s, r) => s + r.valorPago, 0);

  const fmtBRL = v => Number(v||0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(720px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="modal-title">📥 Importar Contas a Pagar (Excel)</h2>

        <label style={{
          display: 'block', border: '2px dashed var(--color-border)', borderRadius: 10,
          padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: 16,
          background: file ? 'rgba(93,124,242,0.06)' : 'var(--color-bg-hover)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{file ? '💳' : '📂'}</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {file ? file.name : 'Clique para selecionar o arquivo Excel'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Formato: <strong>.xlsx</strong> — CONTAS Á PAGAR-pivot.xlsx
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
              { label: 'Contas',     value: parsed.length,    color: 'var(--color-accent)' },
              { label: 'A Pagar',    value: fmtBRL(totalAPagar),   color: 'var(--color-red)' },
              { label: 'Pago',       value: fmtBRL(totalPago),     color: 'var(--color-green)' },
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
                  <th>Fornecedor</th><th>Vencimento</th><th>Categoria</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th style={{ textAlign: 'right' }}>A Pagar</th>
                  <th>NF</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fornecedor}</td>
                    <td>{r.vencimento}</td>
                    <td>{r.categoria || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {fmtBRL(r.valorConta)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.aPagar < 0 ? 'var(--color-red)' : 'var(--color-yellow)' }}>
                      {fmtBRL(r.aPagar)}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.notaFiscal || '—'}</td>
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
                Encontramos <strong>{fuzzyMatches.length}</strong> contas que já existem no sistema. 
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
                      CNPJ: <strong style={{ color: 'var(--color-text-primary)' }}>{match.row.cnpjFornecedor}</strong> | 
                      Vencimento: <strong>{match.row.vencimento}</strong> | 
                      Valor: <strong style={{ color: 'var(--color-red)' }}>R$ {match.row.valorConta?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
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
            {importing ? '⏳ Importando...' : (reviewingDups ? `✅ Confirmar (${cleanRows.length + (fuzzyMatches.length - skipped.size)})` : `📥 Analisar e Importar ${parsed.length} contas`)}
          </button>
        </div>
      </div>
    </div>
  );
}
