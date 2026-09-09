/**
 * BookingsPage.jsx — Bookings (Booking.com)
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useBookings } from '../hooks/useBookings';
import { useToast } from '../context/ToastContext';
import BookingModal from '../components/bookings/BookingModal';
import ImportBookingsModal from '../components/bookings/ImportBookingsModal';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; }
}

function fmtCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TIPO_BADGE = {
  'Concluída':           'badge-green',
  'Cancelada':           'badge-red',
  'Não comparecimento':  'badge-yellow',
};

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon, color, onClick, active }) {
  return (
    <div className="kpi-card"
      style={{ borderTop: `3px solid ${color}`, cursor: onClick ? 'pointer' : 'default',
               transition: 'transform 0.15s', outline: active ? `2px solid ${color}` : 'none', outlineOffset: 2,
               padding: '6px 10px', minHeight: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, background: 'var(--color-bg-secondary)', borderRadius: 8, border: '1px solid var(--color-border)' }}
      onClick={onClick}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'scale(1.02)'; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = 'scale(1)'; }}
      title={onClick ? 'Clique para filtrar' : undefined}
    >
      <div className="kpi-header" style={{ marginBottom: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="kpi-label" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{label}</span>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div className="kpi-value" style={{ color, fontSize: 18, lineHeight: 1, fontWeight: 700 }}>{value}</div>
      {sub && <div className="kpi-sub" style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BookingsPage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { bookings, loading, saveBooking, deleteBooking, importBookings, checkDuplicates } = useBookings(empresaId);

  const [editing,    setEditing]    = useState(null);
  const [showModal,  setShowModal]  = useState(false);
  const [showImport, setShowImport] = useState(false);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,         setSearch]         = useState('');
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  
  const [mesFiltro, setMesFiltro] = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) { const d = new Date(); saved = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    return saved;
  });

  const [checkinDe, setCheckinDe] = useState(() => {
    const m = localStorage.getItem(FILTER_MONTH_KEY);
    if (!m) { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
    const [y, mo] = m.split('-'); return `${y}-${mo}-01`;
  });
  const [checkinAte, setCheckinAte] = useState(() => {
    const m = localStorage.getItem(FILTER_MONTH_KEY);
    if (!m) { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()}`; }
    const [y, mo] = m.split('-'); return `${y}-${mo}-${new Date(y, parseInt(mo), 0).getDate()}`;
  });

  const handleMes = (e) => {
    const val = e.target.value;
    setMesFiltro(val);
    if (!val) { setCheckinDe(''); setCheckinAte(''); return; }
    localStorage.setItem(FILTER_MONTH_KEY, val);
    const [y, m] = val.split('-');
    setCheckinDe(`${y}-${m}-01`);
    setCheckinAte(`${y}-${m}-${new Date(y, parseInt(m), 0).getDate()}`);
  };
  const [filtroTipo,     setFiltroTipo]     = useState('');
  const [filtroCanceladas, setFiltroCanceladas] = useState(false);

  const resetFilters = () => {
    setSearch(''); setCheckinDe(''); setCheckinAte(''); setMesFiltro('');
    setFiltroTipo(''); setFiltroCanceladas(false);
  };

  const hasFilters = search || checkinDe || checkinAte || filtroTipo || filtroCanceladas;

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    let list = [...bookings];
    if (filtroCanceladas)   list = list.filter(b => b.tipo === 'Cancelada');
    else if (filtroTipo)    list = list.filter(b => b.tipo === filtroTipo);
    if (checkinDe)          list = list.filter(b => b.checkin >= checkinDe);
    if (checkinAte)         list = list.filter(b => b.checkin <= checkinAte);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        (b.nomHospede || '').toLowerCase().includes(q) ||
        (b.nReserva   || '').toString().includes(q)
      );
    }
    return list;
  }, [bookings, search, checkinDe, checkinAte, filtroTipo, filtroCanceladas]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    count:       rows.length,
    totalValor:  rows.reduce((s, b) => s + (b.valor || 0), 0),
    totalComm:   rows.reduce((s, b) => s + (b.commissao || 0), 0),
    canceladas:  rows.filter(b => b.tipo === 'Cancelada').length,
    concluidas:  rows.filter(b => b.tipo === 'Concluída').length,
  }), [rows]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSave = async (data) => {
    await saveBooking(data);
    toast.success(data.id ? 'Booking atualizado!' : 'Booking adicionado!');
    setShowModal(false); setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar este booking?')) return;
    await deleteBooking(id);
    toast.info('Booking removido.');
  };

  const handleImport = async (rows) => {
    const count = await importBookings(rows);
    return count;
  };

  // ── Export Excel ───────────────────────────────────────────────────────────
  const handleExportExcel = useCallback(() => {
    const data = rows.map(b => ({
      'Nº Reserva': b.nReserva,
      'Hóspede':    b.nomHospede,
      'Check-in':   b.checkin,
      'Check-out':  b.checkout,
      'Tipo':       b.tipo,
      'Valor':      b.valor,
      'Comissão':   b.commissao,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
    XLSX.writeFile(wb, `bookings_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel exportado!');
  }, [rows, toast]);

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    const html = `<html><head><title>Bookings</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:10px}
      h2{margin-bottom:4px} .info{color:#666;margin-bottom:10px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:3px 5px;text-align:left}
      th{background:#f0f0f0;font-weight:bold} tr:nth-child(even){background:#f9f9f9}
      .right{text-align:right} .total{font-weight:bold;background:#e8f4e8}
      .cancel{opacity:0.5}
    </style></head><body>
    <h2>Bookings (Booking.com) — ${rows.length} reservas</h2>
    <div class="info">
      Valor total: ${fmtCurrency(kpis.totalValor)} | Comissão: ${fmtCurrency(kpis.totalComm)} |
      Concluídas: ${kpis.concluidas} | Canceladas: ${kpis.canceladas} | Gerado: ${new Date().toLocaleString('pt-BR')}
    </div>
    <table><thead><tr>
      <th>Nº Reserva</th><th>Hóspede</th><th>Check-in</th><th>Check-out</th>
      <th>Tipo</th><th class="right">Valor</th><th class="right">Comissão</th>
    </tr></thead><tbody>
    ${rows.map(b => `<tr class="${b.tipo==='Cancelada'?'cancel':''}">
      <td>${b.nReserva}</td><td>${b.nomHospede||'—'}</td>
      <td>${b.checkin}</td><td>${b.checkout}</td><td>${b.tipo}</td>
      <td class="right">${fmtCurrency(b.valor)}</td>
      <td class="right">${fmtCurrency(b.commissao)}</td>
    </tr>`).join('')}
    <tr class="total"><td colspan="5"><strong>TOTAL</strong></td>
      <td class="right"><strong>${fmtCurrency(kpis.totalValor)}</strong></td>
      <td class="right"><strong>${fmtCurrency(kpis.totalComm)}</strong></td>
    </tr></tbody></table></body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.print();
  }, [rows, kpis]);

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div className="contas-page">
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content' }}>← Voltar</button>
      </div>
      {/* KPIs */}
      <div className="contas-kpis">
        <KPICard label="Bookings"     value={kpis.count}                   icon="📋" color="var(--color-accent)"  sub={`${kpis.concluidas} concluídas`}
          onClick={hasFilters ? resetFilters : undefined} />
        <KPICard label="Valor Total"  value={fmtCurrency(kpis.totalValor)} icon="💰" color="var(--color-green)"   sub="receita bruta" />
        <KPICard label="Comissão"     value={fmtCurrency(kpis.totalComm)}  icon="💸" color="var(--color-yellow)"  sub="taxa Booking.com" />
        <KPICard label="Canceladas"   value={kpis.canceladas}              icon="❌" color="var(--color-red)"
          active={filtroCanceladas}
          onClick={() => { setFiltroCanceladas(f => !f); setFiltroTipo(''); }}
        />
      </div>

      {/* Toolbar */}
      <div className="contas-toolbar card">
        <div className="contas-toolbar-row" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <input className="form-input" style={{ flex: 1, minWidth: 140, maxWidth: 300 }}
              placeholder="🔍 Nº reserva, hóspede..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input" style={{ width: 175, flexShrink: 0 }}
              value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setFiltroCanceladas(false); }}>
              <option value="">Todos os tipos</option>
              {['Concluída','Cancelada','Não comparecimento'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {hasFilters && <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ color: 'var(--color-yellow)', flexShrink: 0 }}>✕ Limpar</button>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={handleExportExcel}>📊 Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={handleExportPdf}>🖨️ PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>📥 Importar</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowModal(true); }}>+ Manual</button>
          </div>
        </div>

        {/* Date filters */}
        <div className="contas-toolbar-row" style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Mês:</label>
          <input type="month" className="form-input" style={{ width: 130 }} value={mesFiltro} onChange={handleMes} />
          <div style={{ width: 1, background: 'var(--color-border)', margin: '0 8px', alignSelf: 'stretch' }} />
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Check-in de:</label>
          <input type="date" className="form-input" style={{ width: 145 }} value={checkinDe}  onChange={e => setCheckinDe(e.target.value)} />
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>até:</label>
          <input type="date" className="form-input" style={{ width: 145 }} value={checkinAte} onChange={e => setCheckinAte(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto', padding: 0 }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-card)', boxShadow: '0 1px 0 var(--color-border)' }}>
            <tr>
              <th>Nº Reserva</th>
              <th>Hóspede</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th style={{ textAlign: 'center' }}>RN</th>
              <th>Tipo</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
              <th style={{ textAlign: 'right' }}>Comissão</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(b => {
              // compute room nights
              const rn = (b.checkin && b.checkout)
                ? Math.round((new Date(b.checkout) - new Date(b.checkin)) / 86400000)
                : '—';
              return (
                <tr key={b.id} style={{ opacity: b.tipo === 'Cancelada' ? 0.55 : 1 }}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{b.nReserva}</td>
                  <td style={{ maxWidth: 200 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.nomHospede}>
                      {b.nomHospede || '—'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDate(b.checkin)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDate(b.checkout)}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{rn}</td>
                  <td><span className={`badge ${TIPO_BADGE[b.tipo] || 'badge-accent'}`}>{b.tipo}</span></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-green)' }}>
                    {fmtCurrency(b.valor)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-yellow)' }}>
                    {fmtCurrency(b.commissao)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(b); setShowModal(true); }}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => handleDelete(b.id)}>×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                  {bookings.length === 0 ? 'Nenhum booking cadastrado — 📥 Importar para começar' : 'Nenhum booking nos filtros atuais'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <BookingModal booking={editing} onSave={handleSave} onClose={() => { setShowModal(false); setEditing(null); }} />
      )}
      {showImport && (
        <ImportBookingsModal onImport={handleImport} checkDuplicates={checkDuplicates}
          onClose={(count) => { setShowImport(false); if (count > 0) toast.success(`${count} bookings importados!`); }} />
      )}
    </div>
  );
}
