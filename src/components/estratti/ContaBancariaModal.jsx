/**
 * ContaBancariaModal.jsx — Add/Edit bank account (conta bancária)
 */
import React, { useState } from 'react';

const TIPOS = ['Conta Corrente', 'Conta Poupança', 'Conta Pagamento', 'Conta Investimento'];
const MOEDAS = ['BRL', 'USD', 'EUR'];

const COLOR_PRESETS = [
  '#5d7cf2', '#34d399', '#f59e0b', '#f87171', '#a78bfa',
  '#60a5fa', '#fb923c', '#e879f9', '#2dd4bf', '#94a3b8',
];

const BANCOS_COMUNS = [
  'Banco do Brasil', 'Caixa Econômica', 'Itaú', 'Bradesco',
  'Santander', 'Nubank', 'BTG Pactual', 'Sicoob', 'Sicredi', 'Inter',
];

export default function ContaBancariaModal({ conta, onSave, onClose }) {
  const isEdit = !!conta;
  const [form, setForm] = useState({
    nome:    conta?.nome    || '',
    agencia: conta?.agencia || '',
    conta:   conta?.conta   || '',
    tipo:    conta?.tipo    || 'Conta Corrente',
    moeda:   conta?.moeda   || 'BRL',
    cor:     conta?.cor     || '#5d7cf2',
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) {
      console.error('[ContaBancariaModal] save error:', err);
      alert('Erro ao salvar: ' + (err?.message || 'verifique o console.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(480px, 96vw)' }}>
        <h2 className="modal-title">{isEdit ? '✏️ Editar Conta Bancária' : '🏦 Nova Conta Bancária'}</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>

            {/* Nome banco — com sugestões */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Nome do Banco *</label>
              <input
                className="form-input"
                list="bancos-list"
                value={form.nome}
                onChange={e => set('nome', e.target.value)}
                placeholder="Ex: Banco do Brasil"
                required
                autoFocus
                id="input-banco-nome"
              />
              <datalist id="bancos-list">
                {BANCOS_COMUNS.map(b => <option key={b} value={b} />)}
              </datalist>
            </div>

            <div className="form-group">
              <label className="form-label">Agência</label>
              <input className="form-input" value={form.agencia} onChange={e => set('agencia', e.target.value)} placeholder="Ex: 1234-5" />
            </div>

            <div className="form-group">
              <label className="form-label">Conta</label>
              <input className="form-input" value={form.conta} onChange={e => set('conta', e.target.value)} placeholder="Ex: 98765-0" />
            </div>

            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-input" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Moeda</label>
              <select className="form-input" value={form.moeda} onChange={e => set('moeda', e.target.value)}>
                {MOEDAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Color */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Cor de identificação</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c} type="button" onClick={() => set('cor', c)}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', background: c, border: 'none',
                      cursor: 'pointer', outline: form.cor === c ? `3px solid ${c}` : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
                {/* Custom color picker button */}
                <label
                  title="Cor personalizada"
                  style={{
                    width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                    background: 'var(--color-bg-hover)', border: '2px dashed var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, flexShrink: 0, position: 'relative', overflow: 'hidden',
                  }}
                >
                  🎨
                  <input type="color" value={form.cor} onChange={e => set('cor', e.target.value)}
                    style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
                </label>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
            background: 'var(--color-bg-secondary)', borderRadius: 8, marginBottom: 20,
            borderLeft: `4px solid ${form.cor}`
          }}>
            <span style={{ fontSize: 22 }}>🏦</span>
            <div>
              <div style={{ fontWeight: 700, color: form.cor }}>{form.nome || 'Nome do banco'}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {[form.agencia && `Ag: ${form.agencia}`, form.conta && `Cc: ${form.conta}`, form.tipo].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" id="btn-save-banco" disabled={saving || !form.nome.trim()}>
              {saving ? '⏳ Salvando...' : isEdit ? '💾 Salvar' : '+ Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
