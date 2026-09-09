import React, { useState } from 'react';
import { extractField } from '../../utils/reconciliation';

export default function ReconciliationWorkspace({ results, onCommit, onCancel }) {
  const [tab, setTab] = useState('auto');
  const [approvedSuggestions, setApprovedSuggestions] = useState({});
  const [manualNMMatches, setManualNMMatches] = useState([]);
  const [cartA, setCartA] = useState([]);
  const [cartB, setCartB] = useState([]);

  const handleApprove = (aId, candidate) => {
    // Allows multiple candidates (1:N) in suggestions by toggling
    setApprovedSuggestions(prev => {
      const list = prev[aId] || [];
      const exists = list.find(c => c.id === candidate.id);
      if (exists) return { ...prev, [aId]: list.filter(c => c.id !== candidate.id) };
      return { ...prev, [aId]: [...list, candidate] };
    });
  };

  const handleDisapprove = (aId) => {
    setApprovedSuggestions(prev => {
      const copy = { ...prev };
      delete copy[aId];
      return copy;
    });
  };

  const toggleCartA = (item) => {
    setCartA(prev => prev.find(x => x.id === item.id) ? prev.filter(x => x.id !== item.id) : [...prev, item]);
  };

  const toggleCartB = (item) => {
    setCartB(prev => prev.find(x => x.id === item.id) ? prev.filter(x => x.id !== item.id) : [...prev, item]);
  };

  const saveNMBatch = () => {
    if (cartA.length === 0 || cartB.length === 0) return;
    setManualNMMatches(prev => [...prev, { a: cartA, b: cartB }]);
    setCartA([]);
    setCartB([]);
  };

  const removeNMBatch = (index) => {
    setManualNMMatches(prev => prev.filter((_, i) => i !== index));
  };

  if (!results) return null;

  const filteredOrphansA = (results.orphansA || []).filter(o => !manualNMMatches.some(m => m.a.find(x => x.id === o.id)));
  const filteredOrphansB = (results.orphansB || []).filter(o => !manualNMMatches.some(m => m.b.find(x => x.id === o.id)));

  const countOrphans = filteredOrphansA.length + filteredOrphansB.length;
  const tdStyle = { padding: '12px', fontSize: 13, borderBottom: '1px solid var(--color-border-light)' };

  const cartSumA = cartA.reduce((s, x) => s + Number(extractField(x, results.rules?.mapA?.valueKey) || 0), 0);
  const cartSumB = cartB.reduce((s, x) => s + Number(extractField(x, results.rules?.mapB?.valueKey) || 0), 0);
  const cartDelta = Math.abs(cartSumA - cartSumB);

  return (
    <div className="card fade-in" style={{ padding: 0, marginTop: 32, overflow: 'hidden', border: '1px solid var(--color-border)', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
      {/* ── TABS ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
        <button 
          onClick={() => setTab('auto')}
          style={{ flex: 1, padding: 20, background: tab === 'auto' ? 'var(--color-bg)' : 'transparent', border: 'none', borderBottom: tab === 'auto' ? '3px solid var(--color-green)' : '3px solid transparent', color: tab === 'auto' ? 'var(--color-text)' : 'var(--color-text-secondary)', fontWeight: tab === 'auto' ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s', fontSize: 15 }}
        >
          <span style={{ fontSize: 20 }}>🟢</span> 
          <span>Match Perfeitos ({results.auto?.length || 0})</span>
        </button>
        <button 
          onClick={() => setTab('suggested')}
          style={{ flex: 1, padding: 20, background: tab === 'suggested' ? 'var(--color-bg)' : 'transparent', border: 'none', borderBottom: tab === 'suggested' ? '3px solid var(--color-yellow)' : '3px solid transparent', color: tab === 'suggested' ? 'var(--color-text)' : 'var(--color-text-secondary)', fontWeight: tab === 'suggested' ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s', fontSize: 15 }}
        >
          <span style={{ fontSize: 20 }}>🟡</span> 
          <span>Revisão Manual ({results.suggested?.length || 0})</span>
        </button>
        <button 
          onClick={() => setTab('orphans')}
          style={{ flex: 1, padding: 20, background: tab === 'orphans' ? 'var(--color-bg)' : 'transparent', border: 'none', borderBottom: tab === 'orphans' ? '3px solid var(--color-red)' : '3px solid transparent', color: tab === 'orphans' ? 'var(--color-text)' : 'var(--color-text-secondary)', fontWeight: tab === 'orphans' ? 700 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, transition: 'all 0.2s', fontSize: 15 }}
        >
          <span style={{ fontSize: 20 }}>🔴</span> 
          <span>Órfãos ({countOrphans})</span>
        </button>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ padding: 32, minHeight: 300, maxHeight: 600, overflowY: 'auto', background: 'var(--color-bg)' }}>
        
        {tab === 'auto' && (
           <div className="fade-in">
             <div style={{ marginBottom: 24, padding: 16, background: 'rgba(52, 211, 153, 0.05)', borderRadius: 12, border: '1px solid rgba(52, 211, 153, 0.2)' }}>
               <h4 style={{ color: 'var(--color-green)', margin: 0, fontWeight: 700, fontSize: 15 }}>✅ Pronto para Reconciliar (Massivo)</h4>
               <p style={{ fontSize: 13, marginTop: 6, opacity: 0.8, lineHeight: 1.5 }}>
                 Estes itens combinam perfeitamente segundo as regras (Tolerância {results.rules?.valueTolerance}% e ±{results.rules?.dateTolerance} dias). 
                 Ao salvar, eles serão vinculados automaticamente nas respectivas bases de dados.
               </p>
             </div>

             <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden' }}>
               <thead>
                 <tr style={{ textAlign: 'left', background: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                   <th style={{ padding: '12px 16px' }}>Fonte A (Base)</th>
                   <th style={{ padding: '12px 8px', width: 50, textAlign: 'center' }}></th>
                   <th style={{ padding: '12px 16px' }}>Fonte B (Confronto)</th>
                 </tr>
               </thead>
               <tbody>
                {(results.auto || []).map((pair, i) => {
                   const dA = extractField(pair.a, results.rules?.mapA?.dateKey);
                   const vA = extractField(pair.a, results.rules?.mapA?.valueKey);
                   const dcA = extractField(pair.a, results.rules?.mapA?.descKey);
                   
                   const dB = extractField(pair.b, results.rules?.mapB?.dateKey);
                   const vB = extractField(pair.b, results.rules?.mapB?.valueKey);
                   const dcB = extractField(pair.b, results.rules?.mapB?.descKey);

                   return (
                     <tr key={i} style={{ transition: 'background 0.2s' }} className="hoverable-row">
                       <td style={tdStyle}>
                         <span style={{ display: 'inline-block', minWidth: 85, fontFamily: 'var(--font-mono)' }}>{dA}</span>
                         <strong style={{ marginLeft: 8 }}>R$ {Number(vA || 0).toFixed(2)}</strong> <br/>
                         <span style={{ opacity: 0.6, fontSize: 12, marginTop: 4, display: 'block' }}>{dcA}</span>
                       </td>
                       <td style={{ ...tdStyle, textAlign: 'center', fontSize: 18, opacity: 0.3 }}>🔗</td>
                       <td style={tdStyle}>
                         <span style={{ display: 'inline-block', minWidth: 85, fontFamily: 'var(--font-mono)' }}>{dB}</span>
                         <strong style={{ marginLeft: 8, color: 'var(--color-green)' }}>R$ {Number(vB || 0).toFixed(2)}</strong> <br/>
                         <span style={{ opacity: 0.6, fontSize: 12, marginTop: 4, display: 'block' }}>{dcB}</span>
                       </td>
                     </tr>
                   );
                 })}
                 {results.auto?.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>Nenhum match perfeito encontrado.</td></tr>}
               </tbody>
             </table>
           </div>
        )}

        {tab === 'suggested' && (
           <div className="fade-in">
             <div style={{ marginBottom: 24, padding: 16, background: 'rgba(251, 191, 36, 0.05)', borderRadius: 12, border: '1px solid rgba(251, 191, 36, 0.2)' }}>
               <h4 style={{ color: 'var(--color-yellow)', margin: 0, fontWeight: 700, fontSize: 15 }}>⚠️ Requerem Atenção (Ação Manual)</h4>
               <p style={{ fontSize: 13, marginTop: 6, opacity: 0.8, lineHeight: 1.5 }}>
                 Itens com divergências superiores à tolerância configurada ou que possuem **múltiplos candidatos** válidos na outra fonte. Você deve confirmar o match correto.
               </p>
             </div>
             
             <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
               {(results.suggested || []).map((sugg, i) => {
                 const isApproved = approvedSuggestions[sugg.a.id];
                 
                 const dA = extractField(sugg.a, results.rules?.mapA?.dateKey);
                 const vA = extractField(sugg.a, results.rules?.mapA?.valueKey);
                 const dcA = extractField(sugg.a, results.rules?.mapA?.descKey);
                 
                 return (
                   <div key={i} style={{ display: 'flex', gap: 16, padding: 16, background: 'var(--color-bg-secondary)', borderRadius: 12, border: isApproved ? '2px solid var(--color-green)' : '1px solid var(--color-border)' }}>
                     {/* LATO A */}
                     <div style={{ flex: 1, paddingRight: 16, borderRight: '1px solid var(--color-border)' }}>
                       <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>Registro Original (A)</div>
                       <strong style={{ fontSize: 16, display: 'block', marginBottom: 4 }}>R$ {Number(vA || 0).toFixed(2)}</strong>
                       <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{dA}</span>
                       <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>{dcA}</div>
                     </div>
                     
                     {/* LATO B (Candidati) */}
                     <div style={{ flex: 1.5 }}>
                       <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
                         {isApproved ? 'Candidato Aprovado' : `Selecione entre ${sugg.candidates.length} candidatos plausíveis (B)`}
                       </div>
                       
                        {isApproved ? (() => {
                          const isArray = Array.isArray(isApproved) ? isApproved : [isApproved];
                          if (isArray.length === 0) return null;
                          return (
                          <div style={{ padding: 12, background: 'rgba(52, 211, 153, 0.1)', borderRadius: 8, border: '1px solid var(--color-green)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                               <strong style={{ color: 'var(--color-green)', fontSize: 14 }}>R$ {isArray.reduce((s, x) => s + Number(extractField(x, results.rules?.mapB?.valueKey) || 0), 0).toFixed(2)} ({isArray.length} itens)</strong> 
                               <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginLeft: 8 }}>Vínculo Sugerido</span>
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => handleDisapprove(sugg.a.id)}>Limpar Seleção</button>
                          </div>
                       )})() : null}
                       
                       {(!isApproved || isApproved.length === 0) ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {sugg.candidates.map(cand => {
                              const selected = Array.isArray(approvedSuggestions[sugg.a.id]) && approvedSuggestions[sugg.a.id].find(c => c.id === cand.id);
                              const dC = extractField(cand, results.rules?.mapB?.dateKey);
                              const vC = extractField(cand, results.rules?.mapB?.valueKey);
                              const dcC = extractField(cand, results.rules?.mapB?.descKey);
                              
                              const gap = Math.abs((Number(vA)||0) - (Number(vC)||0));
                              return (
                                 <div key={cand.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: selected ? 'rgba(52,211,153,0.05)' : 'var(--color-bg)', borderRadius: 8, border: selected ? '2px solid var(--color-green)' : '1px solid var(--color-border)' }}>
                                  <div>
                                    <strong style={{ color: 'var(--color-text)', fontSize: 14 }}>R$ {Number(vC||0).toFixed(2)}</strong> 
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, marginLeft: 8 }}>{dC}</span>
                                    {gap > 0.01 && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-yellow)', fontWeight: 600 }}>Delta Original: R$ {gap.toFixed(2)}</span>}
                                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{dcC}</div>
                                  </div>
                                  <button className={selected ? "btn btn-secondary" : "btn btn-primary"} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => handleApprove(sugg.a.id, cand)}>
                                    {selected ? 'Remover' : 'Ligar (1:N)'}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                       ) : null}
                     </div>
                   </div>
                 );
               })}
               {results.suggested?.length === 0 && <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>Nenhum registro ambíguo para revisar.</div>}
             </div>
           </div>
        )}

        {tab === 'orphans' && (
           <div className="fade-in">
             <div style={{ marginBottom: 24, padding: 16, background: 'rgba(248, 113, 113, 0.05)', borderRadius: 12, border: '1px solid rgba(248, 113, 113, 0.2)' }}>
               <h4 style={{ color: 'var(--color-red)', margin: 0, fontWeight: 700, fontSize: 15 }}>❌ Sem Correspondência (Orfãos)</h4>
               <p style={{ fontSize: 13, marginTop: 6, opacity: 0.8, lineHeight: 1.5 }}>
                 Estes itens não encontraram nenhuma combinação plausível de ponta a ponta. Você poderá pesquisar e forçar o vinculo manualmente.
               </p>
             </div>
             
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
               <div>
                  <h5 style={{ marginBottom: 16, borderBottom: '2px solid var(--color-border)', paddingBottom: 12, fontSize: 14 }}>Orfãos Fonte A</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredOrphansA.map((o, idx) => {
                      const dA = extractField(o, results.rules?.mapA?.dateKey);
                      const vA = extractField(o, results.rules?.mapA?.valueKey);
                      const dcA = extractField(o, results.rules?.mapA?.descKey);
                      const isSelected = cartA.find(x => x.id === o.id);
                      return (
                        <div key={idx} onClick={() => toggleCartA(o)} style={{ padding: 12, background: isSelected ? 'rgba(52,211,153,0.1)' : 'var(--color-bg-secondary)', borderRadius: 8, border: isSelected ? '2px solid var(--color-green)' : '1px solid var(--color-border)', fontSize: 13, cursor: 'pointer', transition: 'all 0.1s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>{dA}</span>
                            <strong style={{ color: 'var(--color-primary)' }}>R$ {Number(vA||0).toFixed(2)}</strong>
                          </div>
                          <div style={{ opacity: 0.8, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dcA}</div>
                        </div>
                      );
                    })}
                    {filteredOrphansA.length === 0 && <p style={{ textAlign: 'center', padding: 24, opacity: 0.5, fontSize: 13, background: 'var(--color-bg-hover)', borderRadius: 8 }}>0 Orfãos</p>}
                  </div>
               </div>
               <div>
                  <h5 style={{ marginBottom: 16, borderBottom: '2px solid var(--color-border)', paddingBottom: 12, fontSize: 14 }}>Orfãos Fonte B</h5>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filteredOrphansB.map((o, idx) => {
                      const dB = extractField(o, results.rules?.mapB?.dateKey);
                      const vB = extractField(o, results.rules?.mapB?.valueKey);
                      const dcB = extractField(o, results.rules?.mapB?.descKey);
                      const isSelected = cartB.find(x => x.id === o.id);
                      return (
                        <div key={idx} onClick={() => toggleCartB(o)} style={{ padding: 12, background: isSelected ? 'rgba(52,211,153,0.1)' : 'var(--color-bg-secondary)', borderRadius: 8, border: isSelected ? '2px solid var(--color-green)' : '1px solid var(--color-border)', fontSize: 13, cursor: 'pointer', transition: 'all 0.1s' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>{dB}</span>
                            <strong style={{ color: 'var(--color-green)' }}>R$ {Number(vB||0).toFixed(2)}</strong>
                          </div>
                          <div style={{ opacity: 0.8, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dcB}</div>
                        </div>
                      );
                    })}
                    {filteredOrphansB.length === 0 && <p style={{ textAlign: 'center', padding: 24, opacity: 0.5, fontSize: 13, background: 'var(--color-bg-hover)', borderRadius: 8 }}>0 Orfãos</p>}
                  </div>
               </div>
             </div>
           </div>
        )}

      </div>

      {/* ── FOOTER ACTIONS ── */}
      <div style={{ padding: '20px 32px', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
        <button 
          className="btn btn-secondary" 
          onClick={onCancel} 
          style={{ fontSize: 14, padding: '10px 24px' }}
        >
          Descartar Ajustes
        </button>
        <button 
          className="btn btn-primary" 
          onClick={() => {
            const finalAuto = results.auto || [];
            
            // Format suggested 1:N
            const finalApproved = Object.keys(approvedSuggestions).reduce((acc, aId) => {
               const sugg = results.suggested.find(s => s.a.id === aId);
               const candsArray = Array.isArray(approvedSuggestions[aId]) ? approvedSuggestions[aId] : [approvedSuggestions[aId]];
               if (candsArray.length > 0) {
                 acc.push({ a: sugg.a, b: candsArray, confidence: 'manual-1N' });
               }
               return acc;
            }, []);
            
            // Format N:M cart batches
            const finalManual = manualNMMatches.map(m => ({ a: m.a, b: m.b, confidence: 'manual-NM' }));
            
            onCommit([...finalAuto, ...finalApproved, ...finalManual]);
          }}
          style={{ fontSize: 14, padding: '10px 24px', boxShadow: '0 4px 12px rgba(52, 211, 153, 0.4)' }}
        >
          ✅ CONSOLIDAR RECONCILIAÇÃO ({(results.auto?.length || 0) + Object.keys(approvedSuggestions).length + manualNMMatches.length} Matches)
        </button>
      </div>
    </div>
  );
}
