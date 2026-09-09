/**
 * BookingModal.jsx — Add/Edit a single Booking
 */
import React, { useState } from 'react';

const TIPOS = ['Concluída', 'Cancelada', 'Não comparecimento'];

export default function BookingModal({ booking, onSave, onClose }) {
  const isEdit = !!booking;
  const [form, setForm] = useState({
    nReserva:   booking?.nReserva   ?? '',
    nomHospede: booking?.nomHospede ?? '',
    checkin:    booking?.checkin    ?? '',
    checkout:   booking?.checkout   ?? '',
    tipo:       booking?.tipo       ?? 'Concluída',
    valor:      booking?.valor      ?? '',
    commissao:  booking?.commissao  ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ ...booking, ...form }); }
    catch (err) { alert('Erro: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(480px, 96vw)' }}>
        <h2 className="modal-title">{isEdit ? '✏️ Editar Booking' : '📋 Novo Booking'}</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nº Reserva</label>
              <input className="form-input" value={form.nReserva} onChange={e => set('nReserva', e.target.value)} placeholder="Ex: 5024834433" required />
            </div>

            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome Hóspede</label>
              <input className="form-input" value={form.nomHospede} onChange={e => set('nomHospede', e.target.value)} placeholder="Nome completo" />
            </div>

            <div className="form-group">
              <label className="form-label">Check-in</label>
              <input className="form-input" type="date" value={form.checkin} onChange={e => set('checkin', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Check-out</label>
              <input className="form-input" type="date" value={form.checkout} onChange={e => set('checkout', e.target.value)} />
            </div>

            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Tipo</label>
              <select className="form-input" value={form.tipo} onChange={e => set('tipo', e.target.value)}>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Valor (R$)</label>
              <input className="form-input" type="number" step="0.01" min="0" value={form.valor} onChange={e => set('valor', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">Comissão (R$)</label>
              <input className="form-input" type="number" step="0.01" min="0" value={form.commissao} onChange={e => set('commissao', e.target.value)} />
            </div>

          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.nReserva.trim()}>
              {saving ? '⏳ Salvando...' : isEdit ? '💾 Salvar' : '+ Adicionar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
