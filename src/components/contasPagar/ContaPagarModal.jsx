/**
 * ContaPagarModal.jsx — Add/Edit a single Conta a Pagar
 */
import React, { useState } from 'react';

export default function ContaPagarModal({ conta, onSave, onClose }) {
  const isEdit = !!conta;
  const [form, setForm] = useState({
    fornecedor:     conta?.fornecedor     ?? '',
    cnpjFornecedor: conta?.cnpjFornecedor ?? '',
    emissao:        conta?.emissao        ?? '',
    vencimento:     conta?.vencimento     ?? '',
    previsao:       conta?.previsao       ?? '',
    categoria:      conta?.categoria      ?? '',
    contaCorrente:  conta?.contaCorrente  ?? '',
    notaFiscal:     conta?.notaFiscal     ?? '',
    parcela:        conta?.parcela        ?? '',
    documento:      conta?.documento      ?? '',
    numero:         conta?.numero         ?? '',
    origem:         conta?.origem         ?? '',
    tags:           conta?.tags           ?? '',
    valorConta:     conta?.valorConta     ?? '',
    valorPago:      conta?.valorPago      ?? '',
    aPagar:         conta?.aPagar         ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ ...conta, ...form }); }
    catch (err) { alert('Erro: ' + err.message); }
    finally { setSaving(false); }
  };

  const F = ({ label, k, type = 'text', full = false, opts = {} }) => (
    <div className="form-group" style={full ? { gridColumn: '1/-1' } : {}}>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={form[k]} onChange={e => set(k, e.target.value)} {...opts} />
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(580px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="modal-title">{isEdit ? '✏️ Editar Conta a Pagar' : '💳 Nova Conta a Pagar'}</h2>

        <form onSubmit={handleSubmit}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Fornecedor</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Razão Social"  k="fornecedor"     full opts={{ placeholder: 'Nome do fornecedor' }} />
            <F label="CNPJ/CPF"      k="cnpjFornecedor" opts={{ placeholder: 'xx.xxx.xxx/xxxx-xx' }} />
            <F label="Categoria"     k="categoria"      opts={{ placeholder: 'Ex: Manutenção' }} />
            <F label="Tags"          k="tags"           opts={{ placeholder: 'Ex: Fornecedor' }} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Datas</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <F label="Emissão"     k="emissao"   type="date" />
            <F label="Vencimento"  k="vencimento" type="date" />
            <F label="Previsão"    k="previsao"  type="date" />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Documento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <F label="Nota Fiscal" k="notaFiscal" opts={{ placeholder: '000015426' }} />
            <F label="Parcela"     k="parcela"    opts={{ placeholder: '1/3' }} />
            <F label="Número"      k="numero"     opts={{ placeholder: 'Nº documento' }} />
            <F label="Conta Corrente" k="contaCorrente" opts={{ placeholder: 'Ex: Bradesco' }} />
            <F label="Origem"      k="origem"     opts={{ placeholder: 'Sienge, Manual...' }} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Valores (R$)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <F label="Valor da Conta" k="valorConta" type="number" opts={{ step: '0.01' }} />
            <F label="Valor Pago"     k="valorPago"  type="number" opts={{ step: '0.01', min: 0 }} />
            <F label="A Pagar"        k="aPagar"     type="number" opts={{ step: '0.01' }} />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.fornecedor.trim()}>
              {saving ? '⏳ Salvando...' : isEdit ? '💾 Salvar' : '+ Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
