/**
 * ReservaModal.jsx — Add/Edit a single Reserva (HIT)
 */
import React, { useState } from 'react';

const STATUSES   = ['Realizada', 'Cancelada', 'No-Show', 'Pendente'];
const CATEGORIAS = ['EX', 'EP', 'ST', 'SU', 'PH'];
const TARIFAS    = ['BL', 'BB', 'HB', 'FB', 'RO'];
const CREDITOS   = ['N', 'T', 'C', 'D'];

export default function ReservaModal({ reserva, onSave, onClose }) {
  const isEdit = !!reserva;
  const [form, setForm] = useState({
    voucher:      reserva?.voucher      ?? '',
    inclusao:     reserva?.inclusao     ?? '',
    checkin:      reserva?.checkin      ?? '',
    checkout:     reserva?.checkout     ?? '',
    rn:           reserva?.rn           ?? '',
    pax:          reserva?.pax          ?? '',
    diarias:      reserva?.diarias      ?? '',
    valorReserva: reserva?.valorReserva ?? '',
    hospede:      reserva?.hospede      ?? '',
    empresa:      reserva?.empresa      ?? '',
    apto:         reserva?.apto         ?? '',
    categoria:    reserva?.categoria    ?? '',
    tarifa:       reserva?.tarifa       ?? '',
    credito:      reserva?.credito      ?? '',
    status:       reserva?.status       ?? 'Realizada',
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ ...reserva, ...form }); }
    catch (err) { alert('Erro: ' + err.message); }
    finally { setSaving(false); }
  };

  const F = ({ label, k, type = 'text', full = false, opts = {} }) => (
    <div className="form-group" style={full ? { gridColumn: '1/-1' } : {}}>
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={form[k]} onChange={e => set(k, e.target.value)} {...opts} />
    </div>
  );

  const S = ({ label, k, opts }) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-input" value={form[k]} onChange={e => set(k, e.target.value)}>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(580px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="modal-title">{isEdit ? '✏️ Editar Reserva (HIT)' : '🏨 Nova Reserva (HIT)'}</h2>

        <form onSubmit={handleSubmit}>
          {/* Identificação */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Identificação</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Voucher" k="voucher" opts={{ placeholder: '#10511' }} />
            <F label="Data Inclusão" k="inclusao" type="date" />
          </div>

          {/* Check-in / Check-out */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Período</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <F label="Check-in"  k="checkin"  type="date" />
            <F label="Check-out" k="checkout" type="date" />
            <F label="RN"        k="rn"        type="number" opts={{ min: 0 }} />
            <F label="Pax (ad/cr)" k="pax"    opts={{ placeholder: '2/0' }} />
          </div>

          {/* Hóspede */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Hóspede / Empresa</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Hóspede" k="hospede" full opts={{ placeholder: 'Nome completo' }} />
            <F label="Empresa / OTA" k="empresa" opts={{ placeholder: 'CVC, Booking...' }} />
            <F label="Apartamento" k="apto" opts={{ placeholder: 'F1, D1, S2...' }} />
          </div>

          {/* Valores */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Valores</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Valor Diárias (R$)" k="diarias"      type="number" opts={{ step: '0.01', min: 0 }} />
            <F label="Valor Reserva (R$)" k="valorReserva" type="number" opts={{ step: '0.01', min: 0 }} />
          </div>

          {/* Config */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '14px 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Tarifas / Status</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <S label="Categoria" k="categoria" opts={CATEGORIAS} />
            <S label="Tarifa"    k="tarifa"    opts={TARIFAS} />
            <S label="Crédito"   k="credito"   opts={CREDITOS} />
            <S label="Status"    k="status"    opts={STATUSES} />
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
