/**
 * SkippedDupsModal.jsx — Shows exact-duplicate rows skipped during import.
 * Side-by-side comparison: incoming (skipped) vs existing in DB.
 * User can override and force-import individual rows.
 */
import React, { useState } from 'react';
import { fmtCurrency } from '../../utils/formatters';
import { fmtDate } from '../../utils/dateUtils';

function MovCard({ mov, label, accentColor }) {
  if (!mov) return (
    <div style={{ background: 'var(--color-bg-active)', borderRadius: 8, padding: '8px 10px', opacity: 0.4, minHeight: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>sem dados</span>
    </div>
  );
  const isCredito = Number(mov.valor) >= 0;
  return (
    <div style={{ background: 'var(--color-bg-active)', borderRadius: 8, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: accentColor, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 2 }}>
        {fmtDate(mov.data)}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }} title={mov.descricao}>
        {mov.descricao || '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: isCredito ? 'var(--color-green)' : 'var(--color-red)' }}>
          {isCredito ? '+' : ''}{fmtCurrency(mov.valor)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {(mov.fonte || mov._fonte || 'manual').toUpperCase()}
        </span>
      </div>
    </div>
  );
}

export default function SkippedDupsModal({ skippedRows = [], contaBancaria, onClose, onForceImport }) {
  // Track which rows the user wants to force-import anyway
  const [forceSet, setForceSet] = useState(new Set());
  const [saving, setSaving]     = useState(false);

  const toggle = (i) => setForceSet(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const handleConfirm = async () => {
    const toForce = [...forceSet].map(i => skippedRows[i].incoming);
    if (toForce.length > 0 && onForceImport) {
      setSaving(true);
      await onForceImport(toForce);
      setSaving(false);
    }
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(660px, 96vw)', maxHeight: '90vh' }}>

        {/* Header */}
        <div style={{ marginBottom: 14 }}>
          <h2 className="modal-title" style={{ marginBottom: 4 }}>⚡ Duplicatas Ignoradas no Import</h2>
          {contaBancaria && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '3px 10px', borderRadius: 20, background: contaBancaria.cor + '20', color: contaBancaria.cor, fontSize: 12, fontWeight: 600 }}>
              🏦 {contaBancaria.nome}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--color-yellow-dim)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: 'var(--color-yellow)', marginBottom: 14 }}>
          <strong>{skippedRows.length}</strong> movimento(s) saltados por já existir registro idêntico.
          Marque <strong>"Importar mesmo assim"</strong> nos casos que deseja incluir mesmo assim.
        </div>

        {/* Pairs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto', paddingRight: 2 }}>
          {skippedRows.map((pair, i) => {
            const isForced = forceSet.has(i);
            return (
              <div key={i} style={{
                border: `1px solid ${isForced ? 'rgba(74,222,128,0.35)' : 'var(--color-border-light)'}`,
                borderRadius: 10,
                background: isForced ? 'rgba(74,222,128,0.04)' : 'var(--color-bg-secondary)',
                padding: '10px 12px',
                transition: 'all 0.2s',
              }}>
                {/* Row header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)' }}>#{i + 1}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flex: 1 }}>Data · Valor · Descrição idênticos</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isForced} onChange={() => toggle(i)}
                      style={{ width: 14, height: 14, accentColor: 'var(--color-green)', cursor: 'pointer' }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: isForced ? 'var(--color-green)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {isForced ? '✅ Importar mesmo assim' : 'Importar mesmo assim?'}
                    </span>
                  </label>
                </div>

                {/* Side-by-side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', gap: 6, alignItems: 'center' }}>
                  <MovCard mov={pair.incoming} label="🚫 Do arquivo (ignorado)" accentColor="var(--color-text-muted)" />
                  <div style={{ textAlign: 'center', fontSize: 16, color: 'var(--color-text-muted)' }}>↔</div>
                  <MovCard 
                     mov={pair.existing} 
                     label={pair.existing?._fromSession ? "✅ Já contido neste arquivo" : "✅ Já na base"} 
                     accentColor="var(--color-green)" 
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 14 }}>
          {forceSet.size > 0 && (
            <div style={{ background: 'rgba(74,222,128,0.08)', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'var(--color-green)', marginBottom: 10 }}>
              ➕ <strong>{forceSet.size}</strong> movimento(s) serão importados mesmo assim.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              {forceSet.size === 0 ? 'Fechar' : 'Cancelar'}
            </button>
            {forceSet.size > 0 && (
              <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
                {saving
                  ? <><span className="spinner" style={{ width: 13, height: 13, borderWidth: 2, display: 'inline-block', marginRight: 8 }} />Importando...</>
                  : `✅ Importar ${forceSet.size} selecionado(s)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
