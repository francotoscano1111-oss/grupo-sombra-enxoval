/**
 * NfModal.jsx — Add/Edit a single Nota Fiscal de Serviço Emitida
 */
import React, { useState } from 'react';

const SITUACOES_NOTA     = ['Normal', 'Cancelada', 'Substituto'];
const SITUACOES_PAGAMENTO = ['Quitada', 'Pendente', 'Parcial'];

export default function NfModal({ nf, onSave, onClose }) {
  const isEdit = !!nf;

  const [form, setForm] = useState({
    numero:            nf?.numero            ?? '',
    dataEmissao:       nf?.dataEmissao        ?? '',
    competencia:       nf?.competencia        ?? '',
    situacaoNota:     nf?.situacaoNota       ?? 'Normal',
    situacaoPagamento: nf?.situacaoPagamento  ?? 'Pendente',
    nomeTomador:      nf?.nomeTomador        ?? '',
    cnpjTomador:      nf?.cnpjTomador        ?? '',
    valorServico:     nf?.valorServico       ?? '',
    aliquota:          nf?.aliquota           ?? '',
    issqn:             nf?.issqn              ?? '',
    retencao:          nf?.retencao           ?? '',
    descricao:         nf?.descricao          ?? '',
    localPrestacao:    nf?.localPrestacao     ?? '',
    codigoNfse:        nf?.codigoNfse         ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...nf, ...form });
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const row = (children) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
  );

  const field = (label, key, type = 'text', opts = {}) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        value={form[key]}
        onChange={e => set(key, e.target.value)}
        {...opts}
      />
    </div>
  );

  const select = (label, key, options) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-input" value={form[key]} onChange={e => set(key, e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(620px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="modal-title">{isEdit ? '✏️ Editar NF-e' : '🧾 Nova NF-e Manual'}</h2>

        <form onSubmit={handleSubmit}>
          {/* Identificação */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Identificação</div>
          {row(<>
            {field('Nº NFSe', 'numero', 'text', { placeholder: 'Ex: 1234' })}
            {field('Código NFS-e', 'codigoNfse', 'text', { placeholder: 'Código completo' })}
            {field('Data Emissão', 'dataEmissao', 'date')}
            {field('Competência (mês)', 'competencia', 'month')}
          </>)}

          {/* Status */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Status</div>
          {row(<>
            {select('Situação da Nota',     'situacaoNota',      SITUACOES_NOTA)}
            {select('Situação Pagamento',   'situacaoPagamento', SITUACOES_PAGAMENTO)}
          </>)}

          {/* Tomador */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Tomador</div>
          {row(<>
            {field('Razão Social Tomador', 'nomeTomador',  'text', { style: { gridColumn: '1/-1' }, placeholder: 'Nome do cliente' })}
            {field('CPF/CNPJ Tomador',    'cnpjTomador',  'text', { placeholder: 'xx.xxx.xxx/xxxx-xx' })}
            {field('Local do Tomador',    'localPrestacao','text', { placeholder: 'Cidade - UF' })}
          </>)}

          {/* Valores */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', margin: '16px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Valores</div>
          {row(<>
            {field('Valor do Serviço (R$)', 'valorServico', 'number', { step: '0.01', min: 0 })}
            {field('Alíquota ISSQN (%)',     'aliquota',     'number', { step: '0.01', min: 0 })}
            {field('ISSQN Apurado (R$)',     'issqn',        'number', { step: '0.01', min: 0 })}
            {field('Retenção (R$)',           'retencao',     'number', { step: '0.01', min: 0 })}
          </>)}

          {/* Descrição */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="form-label">Descrição do Serviço</label>
            <textarea
              className="form-input"
              rows={2}
              value={form.descricao}
              onChange={e => set('descricao', e.target.value)}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
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
