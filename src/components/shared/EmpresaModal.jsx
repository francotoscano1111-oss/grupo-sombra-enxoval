/**
 * EmpresaModal.jsx — Modal for adding or editing an empresa
 */
import React, { useState } from 'react';

const COLOR_PRESETS = [
  '#5d7cf2', '#34d399', '#f59e0b', '#f87171', '#a78bfa',
  '#60a5fa', '#fb923c', '#e879f9', '#2dd4bf', '#94a3b8',
];

export default function EmpresaModal({ empresa, onSave, onClose }) {
  const [name,            setName]            = useState(empresa?.name            || '');
  const [cnpj,            setCnpj]            = useState(empresa?.cnpj            || '');
  const [color,           setColor]           = useState(empresa?.color           || '#5d7cf2');
  const [sistemaFrontend, setSistemaFrontend] = useState(empresa?.sistemaFrontend || '');
  const [saving, setSaving] = useState(false);
  const isEdit = !!empresa;

  const formatCnpj = (val) => {
    const raw = val.replace(/\D/g, '').slice(0, 14);
    if (raw.length <= 2)  return raw;
    if (raw.length <= 5)  return `${raw.slice(0, 2)}.${raw.slice(2)}`;
    if (raw.length <= 8)  return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5)}`;
    if (raw.length <= 12) return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8)}`;
    return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8, 12)}-${raw.slice(12)}`;
  };

  const handleCnpjChange = (e) => setCnpj(formatCnpj(e.target.value));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ ...empresa, name, cnpj, color, sistemaFrontend: sistemaFrontend || null });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(420px, 95vw)' }}>
        <h2 className="modal-title">{isEdit ? '✏️ Editar Empresa' : '🏢 Nova Empresa'}</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nome da Empresa *</label>
            <input
              id="input-empresa-name"
              className="form-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Hotel Sombra Norte"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">CNPJ</label>
            <input
              id="input-empresa-cnpj"
              className="form-input"
              type="text"
              value={cnpj}
              onChange={handleCnpjChange}
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Cor de identificação</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: c, border: color === c ? '3px solid white' : '2px solid transparent',
                    cursor: 'pointer', flexShrink: 0,
                    outline: color === c ? `2px solid ${c}` : 'none',
                  }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                style={{ width: 32, height: 32, border: 'none', cursor: 'pointer', borderRadius: 4, background: 'none' }}
                title="Escolher cor personalizada"
              />
            </div>

          <div className="form-group">
            <label className="form-label">Sistema Front-End (PMS)</label>
            <select
              id="select-sistema-frontend"
              className="form-input"
              value={sistemaFrontend}
              onChange={e => setSistemaFrontend(e.target.value)}
            >
              <option value="">— Padrão (sem sistema específico) —</option>
              <option value="hits">🏨 HITS (ArcoIris)</option>
            </select>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Ativa módulos exclusivos para o sistema selecionado (ex: Resumo de Conta e Consumos para HITS).
            </div>
          </div>
          </div>

          {/* Preview */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--color-bg-secondary)', borderRadius: 8, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 6, background: color + '20', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>
              {(name || 'E').charAt(0).toUpperCase()}
            </div>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{name || 'Nome da empresa'}</span>
            <span style={{ marginLeft: 'auto', padding: '2px 8px', background: color + '20', color, borderRadius: 20, fontSize: 11, fontWeight: 700 }}>●</span>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" id="btn-save-empresa" disabled={saving || !name.trim()}>
              {saving ? '⏳ Salvando...' : isEdit ? '💾 Salvar' : '+ Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
