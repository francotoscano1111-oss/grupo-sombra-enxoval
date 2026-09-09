/**
 * ImportNfsModal.jsx — Import NF-e from Excel file (NFs emitidas Arcoiris.xlsx format)
 */
import React, { useState } from 'react';
import { parseNfsExcel } from '../../utils/parsers/nfsParser';

export default function ImportNfsModal({ empresaCnpj, onImport, checkDuplicates, onClose }) {
  const [file,         setFile]         = useState(null);
  const [preview,      setPreview]      = useState([]);
  const [parsed,       setParsed]       = useState([]);
  const [discardedCount, setDiscardedCount] = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [importing,    setImporting]    = useState(false);
  const [error,        setError]        = useState('');

  const [reviewingDups, setReviewingDups] = useState(false);
  const [cleanRows, setCleanRows]         = useState([]);
  const [fuzzyMatches, setFuzzyMatches]   = useState([]);
  const [skipped, setSkipped]             = useState(new Set());

  const [colMap,       setColMap]       = useState({});
  const [detectedHdrs, setDetectedHdrs] = useState('');

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');
    setLoading(true);
    try {
      const { parsed: rows, detectedHeaders, map } = await parseNfsExcel(f);
      
      let filteredRows = rows.filter(r => r.situacaoNota === 'Normal');
      if (empresaCnpj) {
        const clean = (val) => String(val || '').replace(/[^\d]/g, '');
        const targetCNPJ = clean(empresaCnpj);
        filteredRows = filteredRows.filter(r => clean(r.cnpjPrestador) === targetCNPJ);
      }
      
      setDiscardedCount(rows.length - filteredRows.length);
      setParsed(filteredRows);
      setPreview(filteredRows.slice(0, 15));
      setColMap(map);
      setDetectedHdrs(detectedHeaders);
    } catch (err) {
      setError('Erro ao processar o arquivo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const allZero       = parsed.length > 0 && parsed.every(p => p.valorServico === 0);
  const REQUIRED      = ['numero', 'dataEmissao', 'valorServico']; // issqn/nomeTomador are optional
  const missingFields = REQUIRED.filter(f => !(f in colMap));

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(700px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="modal-title">📥 Importar NFs Emitidas (Excel)</h2>

        {/* Upload area */}
        <label style={{
          display: 'block', border: '2px dashed var(--color-border)', borderRadius: 10,
          padding: '28px', textAlign: 'center', cursor: 'pointer', marginBottom: 16,
          background: file ? 'rgba(93,124,242,0.06)' : 'var(--color-bg-hover)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{file ? '📊' : '📂'}</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {file ? file.name : 'Clique para selecionar o arquivo Excel'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Formato aceito: <strong>.xlsx</strong> — consulta NFSe (NFs emitidas Arcoiris.xlsx)
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
        </label>

        {loading && <div style={{ textAlign: 'center', padding: 20 }}>⏳ Processando...</div>}
        {error   && <div style={{ color: 'var(--color-red)', padding: '8px 12px', background: 'rgba(248,113,113,0.1)', borderRadius: 8, marginBottom: 12 }}>❌ {error}</div>}

        {/* Diagnostic: show when 0 rows, values are 0, or required columns not found */}
        {file && !loading && (allZero || missingFields.length > 0 || (parsed.length === 0 && detectedHdrs)) && (
          <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--color-red)', marginBottom: 6 }}>
              {parsed.length === 0
                ? '⚠️ Nenhuma linha lida — coluna de número não encontrada'
                : '⚠️ Colunas não reconhecidas — valores podem estar incorretos'}
            </div>
            {missingFields.length > 0 && (
              <div style={{ color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                Campos não mapeados: <strong>{missingFields.join(', ')}</strong>
              </div>
            )}
            <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
              Colunas detectadas no arquivo — copie e envie ao suporte:
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 4, wordBreak: 'break-all', maxHeight: 80, overflowY: 'auto', background: 'var(--color-bg-hover)', borderRadius: 6, padding: '6px 8px', userSelect: 'all' }}>
              {detectedHdrs || '(nenhuma — arquivo pode estar vazio ou em formato inesperado)'}
            </div>
          </div>
        )}

        {/* Stats */}
        {parsed.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, background: 'var(--color-bg-hover)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-accent)' }}>{parsed.length}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                NFs prontas
                {discardedCount > 0 && <span style={{display:'block', color:'var(--color-red)', fontSize:10, marginTop:2}}>{discardedCount} ignoradas (filtro/canceladas)</span>}
              </div>
            </div>
            <div style={{ flex: 1, background: 'var(--color-bg-hover)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-green)' }}>
                R$ {parsed.reduce((s, r) => s + r.valorServico, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Valor total serviços</div>
            </div>
            <div style={{ flex: 1, background: 'var(--color-bg-hover)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-yellow)' }}>
                R$ {parsed.reduce((s, r) => s + r.issqn, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>ISSQN total</div>
            </div>
          </div>
        )}

        {/* Preview table */}
        {preview.length > 0 && !reviewingDups && (
          <div style={{ marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>
              Pré-visualização (primeiras {preview.length} de {parsed.length}):
            </div>
            <table className="data-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  <th>Tomador</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th style={{ textAlign: 'right' }}>ISSQN</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.numero}</td>
                    <td>{r.dataEmissao}</td>
                    <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nomeTomador}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-green)' }}>
                      {r.valorServico.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {r.issqn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td><span className={`badge ${r.situacaoNota === 'Normal' ? 'badge-green' : 'badge-red'}`}>{r.situacaoNota}</span></td>
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
                Encontramos <strong>{fuzzyMatches.length}</strong> NFs Emitidas que já existem no sistema. 
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
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <strong>Na Planilha: </strong>
                      Nº <span style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontWeight:700 }}>{match.row.numero}</span> | 
                      Data: <span style={{fontFamily: 'var(--font-mono)'}}>{match.row.dataEmissao}</span> | 
                      Tomador: <strong>{match.row.nomeTomador}</strong> | 
                      Valor: <strong style={{ color: 'var(--color-green)' }}>R$ {match.row.valorServico?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
                      <br/>
                      {match.existingRow && (
                        <div style={{ marginTop: 4, opacity: 0.8 }}>
                          <strong>Já no Banco: </strong>
                          Nº <span style={{fontFamily: 'var(--font-mono)', fontWeight:700 }}>{match.existingRow.numero}</span> | 
                          Data: <span style={{fontFamily: 'var(--font-mono)'}}>{match.existingRow.dataEmissao}</span> | 
                          Tomador: <strong>{match.existingRow.nomeTomador}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => onClose(0)}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!parsed.length || importing}
          >
            {importing ? '⏳ Importando...' : (reviewingDups ? `✅ Confirmar (${cleanRows.length + (fuzzyMatches.length - skipped.size)})` : `📥 Analisar e Importar ${parsed.length} NFs`)}
          </button>
        </div>
      </div>
    </div>
  );
}
