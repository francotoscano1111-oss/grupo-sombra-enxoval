/**
 * MovimentoModal.jsx — Edit a single bank statement movement
 */
import React, { useState } from 'react';
import { fmtCurrency } from '../../utils/formatters';

const CATEGORIAS = [
  'Receita de Hóspedes', 'Fornecedores', 'Folha de Pagamento', 'Impostos',
  'Aluguel', 'Utilities', 'Marketing', 'Transferência', 'Tarifa Bancária',
  'Investimento', 'Estorno', 'Outros',
];

export default function MovimentoModal({ movimento, onSave, onClose }) {
  const [form, setForm] = useState({
    descricao:  movimento?.descricao  || '',
    categoria:  movimento?.categoria  || '',
    historico:  movimento?.historico  || '',
    documento:  movimento?.documento  || '',
    moduloDestino: movimento?.moduloDestino || (Number(movimento?.valor) >= 0 || movimento?.tipo === 'crédito' ? 'receitas' : 'despesas'),
    conciliado: movimento?.conciliado || false,
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const isCredito = Number(movimento?.valor) >= 0 || movimento?.tipo === 'crédito';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(500px, 96vw)' }}>
        <h2 className="modal-title">✏️ Editar Movimento</h2>

        {/* Read-only summary */}
        <div style={{
          background: 'var(--color-bg-secondary)',
          borderRadius: 8, padding: '12px 16px',
          marginBottom: 20,
          borderLeft: `4px solid ${isCredito ? 'var(--color-green)' : 'var(--color-red)'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{movimento?.data}</div>
            <div style={{ fontWeight: 600 }}>{movimento?.descricao}</div>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18,
            color: isCredito ? 'var(--color-green)' : 'var(--color-red)'
          }}>
            {isCredito ? '+' : '-'}{fmtCurrency(Math.abs(Number(movimento?.valor)))}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input className="form-input" value={form.descricao} onChange={e => set('descricao', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Centro de Custo (Destino)</label>
            <select className="form-input" value={form.moduloDestino} onChange={e => set('moduloDestino', e.target.value)}>
              <option value="receitas">Receitas (A Receber)</option>
              <option value="despesas">Despesas (Saídas)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-input" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
              <option value="">Sem categoria</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Histórico / Complemento</label>
            <input className="form-input" value={form.historico} onChange={e => set('historico', e.target.value)} placeholder="Informações adicionais" />
          </div>

          <div className="form-group">
            <label className="form-label">Documento / Nº Referência</label>
            <input className="form-input" value={form.documento} onChange={e => set('documento', e.target.value)} placeholder="Nº cheque, NF, etc." />
          </div>

          <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox" id="chk-conciliado"
              checked={form.conciliado}
              onChange={e => set('conciliado', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--color-green)' }}
            />
            <label htmlFor="chk-conciliado" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
              Marcar como conciliado manualmente
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '⏳ Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
