/**
 * ContaModal.jsx — Add/Edit modal for Receita or Despesa
 */
import React, { useState } from 'react';
import { todayISO } from '../../utils/dateUtils';

const CATEGORIAS_DESPESAS = [
  'Aluguel', 'Água/Luz/Gás', 'Folha de Pagamento', 'Fornecedores',
  'Manutenção', 'Marketing', 'Impostos', 'Serviços', 'Alimentação',
  'Transporte', 'Telefone/Internet', 'Seguros', 'Outros',
];

export default function ContaModal({ conta, module, statusOptions, onSave, onClose }) {
  const isEdit = !!conta;
  const isDespesa = module === 'despesas';

  const [form, setForm] = useState({
    descricao:  conta?.descricao  || '',
    parceiro:   conta?.parceiro   || '',
    valor:      conta?.valor      || '',
    vencimento: conta?.vencimento || todayISO(),
    emissao:    conta?.emissao    || todayISO(),
    status:     conta?.status     || statusOptions[0] || 'Pendente',
    categoria:  conta?.categoria  || '',
    observacoes:conta?.observacoes|| '',
    nf:         conta?.nf         || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave({ ...form, valor: parseFloat(String(form.valor).replace(',', '.')) || 0 });
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 96vw)' }}>
        <h2 className="modal-title">
          {isEdit
            ? `✏️ Editar ${isDespesa ? 'Despesa' : 'Receita'}`
            : `+ Nova ${isDespesa ? 'Despesa' : 'Receita'}`}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Descrição *</label>
              <input className="form-input" required value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder={isDespesa ? 'Ex: Aluguel sede Janeiro' : 'Ex: Diária Suíte 201'} />
            </div>

            <div className="form-group">
              <label className="form-label">{isDespesa ? 'Fornecedor' : 'Cliente'}</label>
              <input className="form-input" value={form.parceiro} onChange={e => set('parceiro', e.target.value)} placeholder={isDespesa ? 'Nome do fornecedor' : 'Nome do cliente'} />
            </div>

            <div className="form-group">
              <label className="form-label">NF / Documento</label>
              <input className="form-input" value={form.nf} onChange={e => set('nf', e.target.value)} placeholder="Número NF ou doc" />
            </div>

            <div className="form-group">
              <label className="form-label">Valor (R$) *</label>
              <input className="form-input" type="number" step="0.01" min="0" required value={form.valor} onChange={e => set('valor', e.target.value)} placeholder="0,00" />
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Emissão</label>
              <input className="form-input" type="date" value={form.emissao} onChange={e => set('emissao', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Vencimento</label>
              <input className="form-input" type="date" value={form.vencimento} onChange={e => set('vencimento', e.target.value)} />
            </div>

            {isDespesa && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Categoria</label>
                <select className="form-input" value={form.categoria} onChange={e => set('categoria', e.target.value)}>
                  <option value="">Sem categoria</option>
                  {CATEGORIAS_DESPESAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}

            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Observações</label>
              <textarea className="form-input" rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} placeholder="Notas adicionais..." style={{ resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '⏳ Salvando...' : isEdit ? '💾 Salvar' : '+ Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
