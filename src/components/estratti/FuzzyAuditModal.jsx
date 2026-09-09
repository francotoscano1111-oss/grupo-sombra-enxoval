/**
 * FuzzyAuditModal.jsx — Audit existing movements for internal fuzzy duplicates.
 * Click "Deletar" on a card → immediately removes that movement and refreshes the list.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { fmtCurrency } from '../../utils/formatters';
import { fmtDate } from '../../utils/dateUtils';

function simColor(sim) {
  if (sim >= 0.85) return 'var(--color-red)';
  if (sim >= 0.70) return 'var(--color-yellow)';
  return 'var(--color-green)';
}

function SimBar({ similarity }) {
  const pct = Math.round(similarity * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: simColor(similarity) }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: simColor(similarity), minWidth: 34 }}>{pct}%</span>
    </div>
  );
}

export default function FuzzyAuditModal({ contaBancaria, findInternalDups, onDelete, onClose }) {
  const [pairs,    setPairs]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(null); // id being deleted

  const runAudit = useCallback(async () => {
    setLoading(true);
    const result = await findInternalDups(contaBancaria?.id);
    setPairs(result);
    setLoading(false);
  }, [contaBancaria?.id, findInternalDups]);

  useEffect(() => { runAudit(); }, [runAudit]);

  // Immediate delete → remove pair from list
  const handleDelete = async (id, pairIndex) => {
    setDeleting(id);
    await onDelete(id);
    setPairs(prev => prev.filter((_, i) => i !== pairIndex));
    setDeleting(null);
  };

  const simLabel = (sim) => {
    if (sim >= 0.85) return { label: '🔴 Muito provável', color: 'var(--color-red)' };
    if (sim >= 0.70) return { label: '🟡 Possível', color: 'var(--color-yellow)' };
    return { label: '🟢 Suspeito', color: 'var(--color-green)' };
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(740px, 96vw)', maxHeight: '90vh' }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 className="modal-title" style={{ marginBottom: 4 }}>🔍 Auditoria de Duplicatas</h2>
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

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Analisando movimentos...</p>
          </div>
        )}

        {/* No duplicates */}
        {!loading && pairs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
            <p style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 15, marginBottom: 6 }}>
              Nenhuma duplicata encontrada!
            </p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              Todos os movimentos de <strong>{contaBancaria?.nome}</strong> parecem únicos.
            </p>
            <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={onClose}>Fechar</button>
          </div>
        )}

        {/* Pairs list */}
        {!loading && pairs.length > 0 && (
          <>
            <div style={{ marginBottom: 14 }}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, margin: '0 0 4px' }}>
                Encontramos <strong style={{ color: 'var(--color-yellow)' }}>{pairs.length}</strong> par(es) suspeito(s).
              </p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 12, margin: 0 }}>
                Clique em <strong>🗑 Deletar</strong> no movimento que deseja remover — será eliminado imediatamente.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 440, overflowY: 'auto', paddingRight: 2 }}>
              {pairs.map((pair, i) => {
                const { movA, movB, similarity } = pair;
                const badge = simLabel(similarity);

                return (
                  <div key={`${movA.id}-${movB.id}`} style={{
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 10,
                    background: 'var(--color-bg-secondary)',
                    padding: '10px 14px',
                  }}>
                    {/* Top: index + similarity */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', minWidth: 28 }}>#{i + 1}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: badge.color }}>{badge.label}</span>
                      <div style={{ flex: 1 }}><SimBar similarity={similarity} /></div>
                    </div>

                    {/* Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[{ mov: movA }, { mov: movB }].map(({ mov }) => (
                        <div key={mov.id} style={{
                          borderRadius: 8, padding: '8px 10px',
                          background: 'var(--color-bg-active)',
                          border: '1px solid transparent',
                          opacity: deleting === mov.id ? 0.5 : 1,
                          transition: 'opacity 0.2s',
                        }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>
                            {fmtDate(mov.data)}
                          </div>
                          <div
                            style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}
                            title={mov.descricao}
                          >
                            {mov.descricao || '—'}
                          </div>
                          <div style={{
                            fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)',
                            color: Number(mov.valor) >= 0 ? 'var(--color-green)' : 'var(--color-red)',
                            marginBottom: 6,
                          }}>
                            {Number(mov.valor) >= 0 ? '+' : ''}{fmtCurrency(mov.valor)}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flex: 1 }}>
                              {mov.fonte?.toUpperCase()} · {mov.lote ? `lote ${mov.lote.slice(0, 6)}…` : 'manual'}
                            </span>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11, padding: '2px 8px', color: 'var(--color-red)', fontWeight: 600 }}
                              onClick={() => handleDelete(mov.id, i)}
                              disabled={deleting !== null}
                              title="Deletar este movimento permanentemente"
                            >
                              {deleting === mov.id
                                ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2, display: 'inline-block' }} />
                                : '🗑 Deletar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
