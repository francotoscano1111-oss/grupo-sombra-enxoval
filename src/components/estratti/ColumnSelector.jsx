/**
 * ColumnSelector.jsx — Toggle column visibility for the estratti table
 * Persists preferences in localStorage (keyed by empresaId)
 */
import React, { useState, useEffect } from 'react';

export const ALL_COLUMNS = [
  { key: 'data',       label: 'Data',        defaultVisible: true,  fixed: true },
  { key: 'descricao',  label: 'Descrição',   defaultVisible: true,  fixed: true },
  { key: 'tipo',       label: 'Tipo',        defaultVisible: true  },
  { key: 'moduloDestino',label: 'Destino',   defaultVisible: true  },
  { key: 'valor',      label: 'Valor',       defaultVisible: true,  fixed: true },
  { key: 'saldo',      label: 'Saldo',       defaultVisible: true  },
  { key: 'categoria',  label: 'Categoria',   defaultVisible: false },
  { key: 'documento',  label: 'Documento',   defaultVisible: false },
  { key: 'historico',  label: 'Histórico',   defaultVisible: false },
  { key: 'conciliado', label: 'Conciliado',  defaultVisible: true  },
  { key: 'fonte',      label: 'Fonte',       defaultVisible: false },
  { key: 'lote',       label: 'Lote',        defaultVisible: false },
];

function getStorageKey(empresaId) {
  return `sombra_col_extratos_${empresaId}`;
}

export function useColumnVisibility(empresaId) {
  const [visible, setVisible] = useState(() => {
    try {
      const saved = localStorage.getItem(getStorageKey(empresaId));
      if (saved) return JSON.parse(saved);
    } catch {}
    return Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultVisible]));
  });

  useEffect(() => {
    if (!empresaId) return;
    try { localStorage.setItem(getStorageKey(empresaId), JSON.stringify(visible)); } catch {}
  }, [visible, empresaId]);

  const toggle = (key) => {
    const col = ALL_COLUMNS.find(c => c.key === key);
    if (col?.fixed) return; // can't hide fixed columns
    setVisible(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const reset = () => setVisible(Object.fromEntries(ALL_COLUMNS.map(c => [c.key, c.defaultVisible])));

  return { visible, toggle, reset };
}

export default function ColumnSelector({ empresaId, visible, onToggle, onReset, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(360px, 96vw)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>⚙️ Colunas Visíveis</h2>
          <button className="btn btn-ghost btn-sm" onClick={onReset} title="Resetar padrão">↺ Reset</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ALL_COLUMNS.map(col => (
            <label
              key={col.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 12px', borderRadius: 6, cursor: col.fixed ? 'not-allowed' : 'pointer',
                background: visible[col.key] ? 'var(--color-accent-dim)' : 'var(--color-bg-hover)',
                opacity: col.fixed ? 0.5 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={!!visible[col.key]}
                onChange={() => onToggle(col.key)}
                disabled={col.fixed}
                style={{ accentColor: 'var(--color-accent)', width: 15, height: 15 }}
              />
              <span style={{ fontSize: 13, fontWeight: 500, color: visible[col.key] ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                {col.label}
              </span>
              {col.fixed && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-muted)' }}>fixo</span>}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-primary btn-sm" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
