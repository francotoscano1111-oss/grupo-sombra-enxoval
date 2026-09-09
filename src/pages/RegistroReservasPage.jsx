/**
 * RegistroReservasPage.jsx — Reservas & Consumos (HITS)
 *
 * HITS empresas  → Tab 1: Resumo de Conta  |  Tab 2: Consumos Lançados
 * Non-HITS       → Tab 1: Reservas (full CRUD)
 *
 * Backup: RegistroReservasPage.jsx.bak_2026-04-01
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { exportToExcel } from '../utils/exportUtils';
import { useEmpresa } from '../context/EmpresaContext';
import { useHitsResumo }       from '../hooks/useHitsResumo';
import { useHitsConsumos }     from '../hooks/useHitsConsumos';
import { useToast }            from '../context/ToastContext';
import { usePagination }       from '../hooks/usePagination';
import PaginationControls      from '../components/common/PaginationControls';
import HitsAnalysisPanel       from '../components/hits/HitsAnalysisPanel';
import { getStoricoTotals, getArchivePreview } from '../hooks/useHitsArchive';
import { dbEntries, getDB, DB_MODULES }        from '../utils/db';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  // Handle DD/MM/YYYY already formatted
  if (typeof d === 'string' && d.includes('/')) return d.split(' ')[0];
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; }
}

function fmtCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Compact formatter for KPI cards — avoids overflow/ellipsis on large values */
function fmtKPI(v) {
  const n = Number(v || 0);
  if (n >= 1_000_000) {
    return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
  }
  if (n >= 1_000) {
    return `R$ ${(n / 1_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  }
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString('pt-BR');
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon, color, onClick, active }) {
  return (
    <div
      className="kpi-card"
      style={{
        borderTop: `3px solid ${color}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s',
        outline: active ? `2px solid ${color}` : 'none',
        outlineOffset: 2,
        padding: '6px 10px',
        minHeight: '50px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}
      onClick={onClick}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'scale(1.02)'; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <div className="kpi-header" style={{ marginBottom: 2 }}>
        <span className="kpi-label" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="kpi-value" style={{ color, fontSize: 18, lineHeight: 1, fontWeight: 700 }}>{value}</div>
        {sub && <span className="kpi-sub" style={{ fontSize: 9, opacity: 0.6, margin: 0, textTransform: 'lowercase', whiteSpace: 'nowrap' }}>{sub}</span>}
      </div>
    </div>
  );
}

// ── Import Result Banner ───────────────────────────────────────────────────────

function SkippedModal({ rows, label, onClose }) {
  // Detect if rows are from Resumo or Consumos based on keys
  const isResumo = rows[0] && 'global' in rows[0];
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}
        style={{ width: 'min(820px, 96vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-yellow)', flex: 1 }}>
            ⚠️ {rows.length} {label} — Dettaglio
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Questi record sono stati ignorati perché già presenti nella base dati con dati identici (deduplicação automática).
          </p>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr>
              <th>Motivo</th>
              {isResumo ? (
                <>
                  <th>Global</th>
                  <th>Hóspede</th>
                  <th>Check-out</th>
                  <th>Voucher</th>
                </>
              ) : (
                <>
                  <th>Conta</th>
                  <th>Comanda</th>
                  <th>Produto</th>
                  <th>Data Op.</th>
                  <th style={{ textAlign: 'right' }}>Qtd</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </>
              )}
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.15)', color: 'var(--color-yellow)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>
                      {r.motivo}
                    </span>
                  </td>
                  {isResumo ? (
                    <>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent)' }}>{r.global}</td>
                      <td>{r.nomeHospede}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{r.checkout}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{r.voucher}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>{r.conta}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{r.comanda}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.produto}>{r.produto}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{r.dt}</td>
                      <td style={{ textAlign: 'right' }}>{r.qtd}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {Number(r.vlr || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ImportBanner({ result, onClose }) {
  const [showSkipped,  setShowSkipped]  = useState(false);
  const [showFlagged,  setShowFlagged]  = useState(false);
  if (!result) return null;
  const isOk       = result.imported > 0;
  const skippedRows = result.skippedRows  || [];
  const flaggedRows = result.flaggedRows  || [];
  return (
    <>
      <div style={{
        background: isOk ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
        border: `1px solid ${isOk ? 'var(--color-green)' : 'var(--color-yellow)'}`,
        borderRadius: 8, padding: '10px 16px', marginBottom: 16,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, flexWrap: 'wrap', gap: 6,
      }} className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16 }}>{isOk ? '✅' : '⚠️'}</span>
          <span>
            <strong>{result.imported}</strong> registros importados
            {/* Flagged: imported but possibly duplicated */}
            {flaggedRows.length > 0 && (
              <> · <span style={{ color: 'var(--color-yellow)' }}>⚠️ <strong>{flaggedRows.length}</strong> possíveis duplicatas importadas</span>{' '}
                <button onClick={() => setShowFlagged(true)}
                  style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--color-yellow)', border: '1px solid var(--color-yellow)', borderRadius: 4, padding: '1px 7px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                  title="Registros importados mas idênticos a um já existente — verifique se são legítimos">
                  👁 Verificar
                </button>
              </>
            )}
            {/* Hard skipped: empty required fields */}
            {skippedRows.length > 0 && (
              <> · <strong>{skippedRows.length}</strong> ignorados (campos vazios){' '}
                <button onClick={() => setShowSkipped(true)}
                  style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-red)', border: '1px solid var(--color-red)', borderRadius: 4, padding: '1px 7px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  👁 Ver
                </button>
              </>
            )}
          </span>
        </div>
        <button className="btn btn-ghost btn-mini" onClick={onClose} style={{ opacity: 0.6 }}>✕</button>
      </div>
      {showFlagged && flaggedRows.length > 0 && (
        <SkippedModal rows={flaggedRows} label="possíveis duplicatas (já importadas)" onClose={() => setShowFlagged(false)} />
      )}
      {showSkipped && skippedRows.length > 0 && (
        <SkippedModal rows={skippedRows} label="ignorados por campos vazios" onClose={() => setShowSkipped(false)} />
      )}
    </>
  );
}

// ── Tab Nav ───────────────────────────────────────────────────────────────────

function TabNav({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid var(--color-border)', paddingBottom: 0 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: '8px 18px', fontSize: 13, fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            color: active === t.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
            borderBottom: active === t.id ? '2px solid var(--color-accent)' : '2px solid transparent',
            marginBottom: -2, transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {t.icon} {t.label}
        </button>
      ))}
    </div>
  );
}

// ── HITS Excel Import Helper ──────────────────────────────────────────────────

function useHitsExcelImport({ onImport, label, inputId }) {
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const toast = useToast();

  const trigger = () => fileRef.current?.click();

  const handleFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      const result = await onImport(rows);
      return result;
    } catch (err) {
      toast.error(`Erro ao ler arquivo: ${err.message}`);
      return null;
    } finally {
      setImporting(false);
    }
  }, [onImport, toast]);

  const Input = (
    <input
      id={inputId}
      ref={fileRef}
      type="file"
      accept=".xlsx,.xls"
      style={{ display: 'none' }}
      onChange={handleFile}
    />
  );

  return { trigger, importing, Input };
}

// ── Tab: Resumo de Conta (File 1) ─────────────────────────────────────────────

function ResumoTab({ empresaId }) {
  const toast = useToast();
  const { resumos, loading, importResumos, clearResumos, deleteMultipleResumos } = useHitsResumo(empresaId);
  const [search,       setSearch]       = useState('');
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  
  const [mesFiltro, setMesFiltro] = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) { const d = new Date(); saved = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    return saved;
  });

  const [dataInicio, setDataInicio] = useState(() => {
    const m = localStorage.getItem(FILTER_MONTH_KEY);
    if (!m) { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
    const [y, mo] = m.split('-');
    return `${y}-${mo}-01`;
  });
  
  const [dataFim, setDataFim] = useState(() => {
    const m = localStorage.getItem(FILTER_MONTH_KEY);
    if (!m) { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()}`; }
    const [y, mo] = m.split('-');
    return `${y}-${mo}-${new Date(y, parseInt(mo), 0).getDate()}`;
  });
  
  const [importResult, setImportResult] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleMes = (e) => {
    const val = e.target.value;
    setMesFiltro(val);
    if (!val) { setDataInicio(''); setDataFim(''); return; }
    localStorage.setItem(FILTER_MONTH_KEY, val);
    const [y, m] = val.split('-');
    setDataInicio(`${y}-${m}-01`);
    setDataFim(`${y}-${m}-${new Date(y, parseInt(m), 0).getDate()}`);
  };

  // Convert DD/MM/YYYY (or ISO) to YYYY-MM-DD for accurate date comparison
  const toIso = (dStr) => {
    if (!dStr) return '';
    const s = String(dStr).split(' ')[0];
    if (s.includes('/')) {
      const [d, mo, yr] = s.split('/');
      return `${yr}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return s;
  };


  const rows = useMemo(() => {
    let list = [...resumos];
    if (dataInicio) list = list.filter(r => { const iso = toIso(r.checkout); return iso && iso >= dataInicio; });
    if (dataFim)    list = list.filter(r => { const iso = toIso(r.checkout); return iso && iso <= dataFim; });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.global        || '').toLowerCase().includes(q) ||
        (r.nomeHospede   || '').toLowerCase().includes(q) ||
        (r.empresaAgencia|| '').toLowerCase().includes(q) ||
        (r.voucher       || '').toString().includes(q)
      );
    }

    if (sortConfig.key) {
      list.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'checkout') {
          valA = toIso(valA) || '';
          valB = toIso(valB) || '';
        } else if (sortConfig.key === 'vlDiarias') {
          valA = Number(valA || 0);
          valB = Number(valB || 0);
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [resumos, search, dataInicio, dataFim, sortConfig]);

  const kpis = useMemo(() => ({
    total:      resumos.length,
    filtered:   rows.length,
    vlTotal:    rows.reduce((s, r) => s + (r.vlTotal  || 0), 0),
    vlConsumos: rows.reduce((s, r) => s + (r.vlConsumos || 0), 0),
  }), [resumos.length, rows]);

  const { currentRows, currentPage, totalPages, totalItems, goToPage, nextPage, prevPage } = usePagination(rows, 50);

  const handleImport = useCallback(async (excelRows) => {
    // Read current ISS rate from localStorage (consistent with HitsAnalysisPanel)
    const storedRate = localStorage.getItem(`hits_iss_rate_${empresaId}`);
    const issRate = storedRate ? Number(storedRate) : 10;

    const result = await importResumos(excelRows, issRate);
    setImportResult(result);
    if (result.imported > 0) toast.success(`${result.imported} contas importadas! (ISS: ${issRate}%)`);
    else toast.info(`Nenhuma nova conta — ${result.skipped} duplicatas ignoradas.`);
    return result;
  }, [importResumos, toast, empresaId]);

  const handleClear = () => {
    setSearch('');
    setMesFiltro('');
    setDataInicio('');
    setDataFim('');
    localStorage.removeItem(FILTER_MONTH_KEY);
  };

  const handleDeleteFiltered = async () => {
    if (rows.length === 0) return;
    const n = rows.length;
    if (!window.confirm(`🚨 Cancellare ${n} record filtrati? Questa azione è irreversibile.`)) return;
    await deleteMultipleResumos(rows.map(r => r.id));
    handleClear();
    toast.success(`${n} contas cancellate.`);
  };

  const handleExportExcel = () => {
    const data = rows.map(r => ({
      'Global':           r.global,
      'Hóspede/Empresa':  r.nomeHospede,
      'Apartamento':      r.apartamento,
      'Categoria Apto':   r.categoriaApto,
      'Tarifário':        r.tarifario,
      'Check-in':         r.checkin,
      'Check-out':        r.checkout,
      'Adt':              r.adt,
      'Criança':          r.crianca,
      'Total Diárias':    r.totalDiarias,
      'Vl. Diárias':      r.vlDiarias,
      'Vl. Consumos':     r.vlConsumos,
      'Vl. Eventos':      r.vlEventos,
      'Vl. Taxas':        r.vlTaxas,
      'Total':            r.vlTotal,
      'Crédito':          r.credito,
      'Diária Média':     r.diariasMedia,
      'Empresa/Agência':  r.empresaAgencia,
      'Voucher':          r.voucher,
      'Canal Origem':     r.canalOrigem,
      'Aberto por':       r.abertoPor,
      'Fechado por':      r.fechadoPor,
    }));
    exportToExcel(data, 'hits_resumo_conta', 'Resumo_Conta_HITS');
    toast.success('Excel exportado!');
  };

  const { trigger, importing, Input } = useHitsExcelImport({ onImport: handleImport, label: 'Resumo', inputId: 'import-resumo-input' });

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div>
      {Input}
      <ImportBanner result={importResult} onClose={() => setImportResult(null)} />

      {/* KPIs */}
      <div className="contas-kpis" style={{ marginBottom: 16 }}>
        <KPICard label="Total Contas"   value={kpis.total}               icon="🏨" color="var(--color-accent)"  sub="na base" />
        <KPICard label="Filtrados"      value={kpis.filtered}            icon="🔍" color="var(--color-blue)"    sub="resultado atual" />
        <KPICard label="Total Receita"  value={fmtKPI(kpis.vlTotal)}    icon="💰" color="var(--color-green)"   sub="valor total (filtro)" />
        <KPICard label="Consumos"       value={fmtKPI(kpis.vlConsumos)} icon="🍽️" color="var(--color-purple)"  sub="vl. consumos (filtro)" />
      </div>

      {/* Toolbar */}
      <div className="contas-toolbar card" style={{ marginBottom: 12, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <input className="form-input form-input-sm" style={{ flex: '1 1 150px', minWidth: 120, maxWidth: 220, fontSize: 12 }}
            placeholder="🔍 Global, hóspede, empresa..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ width: 1, height: 20, background: 'var(--color-border)', flexShrink: 0 }} />
          <input type="month" className="form-input form-input-sm" style={{ width: 130, fontSize: 12, flexShrink: 0 }} value={mesFiltro} onChange={handleMes} />
          <div style={{ width: 1, height: 20, background: 'var(--color-border)', flexShrink: 0 }} />
          <input type="date" className="form-input form-input-sm" style={{ width: 110, fontSize: 12, flexShrink: 0 }} value={dataInicio} onChange={e => setDataInicio(e.target.value)} title="Check-out de" />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>até</span>
          <input type="date" className="form-input form-input-sm" style={{ width: 110, fontSize: 12, flexShrink: 0 }} value={dataFim} onChange={e => setDataFim(e.target.value)} title="Check-out até" />
          <div style={{ flex: '1 1 0' }} />
          <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={handleExportExcel} title="Exportar Excel">📊 Excel</button>
          {rows.length > 0 && rows.length < resumos.length && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-red)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, flexShrink: 0 }}
              onClick={handleDeleteFiltered}
              title={`Cancella i ${rows.length} record filtrati`}
            >
              🗑️ Cancella ({rows.length})
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-yellow)', flexShrink: 0 }} onClick={handleClear} title="Limpar Filtros">🧹 Limpar</button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏨</div>
            <div className="empty-state-text">
              {resumos.length === 0 ? 'Nenhum Resumo de Conta importado' : 'Nenhum resultado nos filtros atuais'}
            </div>
            {resumos.length === 0 && (
              <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={trigger}>📥 Importar Excel</button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Global</th>
                <th>Check-in</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('checkout')} title="Ordenar por Check-out">
                  Check-out {sortConfig.key === 'checkout' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th>Hóspede / Empresa</th>
                <th>Empresa/Agência</th>
                <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('vlDiarias')} title="Ordenar por Diárias">
                  Diárias {sortConfig.key === 'vlDiarias' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ textAlign: 'right' }}>Consumos</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Canal</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>{r.global}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.checkin}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.checkout}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.nomeHospede}>
                    {r.nomeHospede || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.empresaAgencia || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCurrency(r.vlDiarias)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-purple)' }}>{fmtCurrency(r.vlConsumos)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-green)' }}>{fmtCurrency(r.vlTotal)}</td>
                  <td style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.canalOrigem || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems}
          nextPage={nextPage} prevPage={prevPage} goToPage={goToPage} />
      </div>
    </div>
  );
}

// ── Tab: Consumos Lançados (File 2) ───────────────────────────────────────────

function ConsumosTab({ empresaId }) {
  const toast = useToast();
  const { consumos, loading, importConsumos, clearConsumos, deleteMultipleConsumos } = useHitsConsumos(empresaId);
  const [search,       setSearch]       = useState('');
  const [filterConta,  setFilterConta]  = useState('');
  const [filterDepto,  setFilterDepto]  = useState('');
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  
  const [mesFiltro, setMesFiltro] = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) { const d = new Date(); saved = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    return saved;
  });

  const [dataInicio, setDataInicio] = useState(() => {
    const m = localStorage.getItem(FILTER_MONTH_KEY);
    if (!m) { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }
    const [y, mo] = m.split('-');
    return `${y}-${mo}-01`;
  });
  
  const [dataFim, setDataFim] = useState(() => {
    const m = localStorage.getItem(FILTER_MONTH_KEY);
    if (!m) { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()}`; }
    const [y, mo] = m.split('-');
    return `${y}-${mo}-${new Date(y, parseInt(mo), 0).getDate()}`;
  });
  
  const [importResult, setImportResult] = useState(null);

  const handleMes = (e) => {
    const val = e.target.value;
    setMesFiltro(val);
    if (!val) { setDataInicio(''); setDataFim(''); return; }
    localStorage.setItem(FILTER_MONTH_KEY, val);
    const [y, m] = val.split('-');
    setDataInicio(`${y}-${m}-01`);
    setDataFim(`${y}-${m}-${new Date(y, parseInt(m), 0).getDate()}`);
  };

  // Convert dataOperacao (DD/MM/YYYY or similar) to ISO for comparison
  const toIso = (dStr) => {
    if (!dStr) return '';
    const s = String(dStr).split(' ')[0];
    if (s.includes('/')) {
      const [d, mo, yr] = s.split('/');
      return `${yr}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return s; // already ISO
  };

  const contaOpts = useMemo(() => [...new Set(consumos.map(c => c.conta).filter(Boolean))].sort(), [consumos]);
  const deptoOpts = useMemo(() => [...new Set(consumos.map(c => c.departamento).filter(Boolean))].sort(), [consumos]);

  const rows = useMemo(() => {
    let list = [...consumos];
    if (filterConta) list = list.filter(c => c.conta === filterConta);
    if (filterDepto) list = list.filter(c => c.departamento === filterDepto);
    if (dataInicio)  list = list.filter(c => { const iso = toIso(c.dataOperacao || c.data); return iso && iso >= dataInicio; });
    if (dataFim)     list = list.filter(c => { const iso = toIso(c.dataOperacao || c.data); return iso && iso <= dataFim; });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.conta     || '').toLowerCase().includes(q) ||
        (c.produto   || '').toLowerCase().includes(q) ||
        (c.hospede   || '').toLowerCase().includes(q) ||
        (c.comanda   || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [consumos, search, filterConta, filterDepto, dataInicio, dataFim]);

  const kpis = useMemo(() => ({
    total:    consumos.length,
    filtered: rows.length,
    vlTotal:  rows.reduce((s, c) => s + (c.total || 0), 0),
    contas:   new Set(rows.map(c => c.conta)).size,
  }), [consumos.length, rows]);

  const { currentRows, currentPage, totalPages, totalItems, goToPage, nextPage, prevPage } = usePagination(rows, 100);

  const handleImport = useCallback(async (excelRows) => {
    const result = await importConsumos(excelRows);
    setImportResult(result);
    if (result.imported > 0) toast.success(`${result.imported} consumos importados!`);
    else toast.info(`Nenhum novo consumo — ${result.skipped} duplicatas ignoradas.`);
    return result;
  }, [importConsumos, toast]);

  const handleClear = () => {
    setSearch('');
    setFilterConta('');
    setFilterDepto('');
    setMesFiltro('');
    setDataInicio('');
    setDataFim('');
    localStorage.removeItem(FILTER_MONTH_KEY);
  };

  const handleDeleteFiltered = async () => {
    if (rows.length === 0) return;
    const n = rows.length;
    if (!window.confirm(`🚨 Cancellare ${n} consumos filtrati? Questa azione è irreversibile.`)) return;
    await deleteMultipleConsumos(rows.map(c => c.id));
    handleClear();
    toast.success(`${n} consumos cancellati.`);
  };

  const handleExportExcel = () => {
    const data = rows.map(c => ({
      'Conta':            c.conta,
      'Comanda':          c.comanda,
      'Produto':          c.produto,
      'Data':             c.data,
      'Data de Operação': c.dataOperacao,
      'Operação':         c.operacao,
      'Categoria':        c.categoria,
      'Departamento':     c.departamento,
      'Família':          c.familia,
      'Quantidade':       c.quantidade,
      'Valor Unit.':      c.valor,
      'Total':            c.total,
      'Apartamento':      c.apartamento,
      'Ponto de Venda':   c.pontoVenda,
      'Subconta':         c.subconta,
      'Hóspede':          c.hospede,
      'Empresa':          c.empresa,
      'Usuário':          c.usuario,
      'Hóspede Origem':   c.hospedeOrigem,
    }));
    exportToExcel(data, 'hits_consumos', 'Consumos_HITS');
    toast.success('Excel exportado!');
  };

  const { trigger, importing, Input } = useHitsExcelImport({ onImport: handleImport, label: 'Consumos', inputId: 'import-consumos-input' });

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div>
      {Input}
      <ImportBanner result={importResult} onClose={() => setImportResult(null)} />

      {/* KPIs */}
      <div className="contas-kpis" style={{ marginBottom: 16 }}>
        <KPICard label="Total Consumos" value={fmtNum(kpis.total)}      icon="🍽️" color="var(--color-purple)" sub="na base" />
        <KPICard label="Filtrados"      value={fmtNum(kpis.filtered)}   icon="🔍" color="var(--color-blue)"   sub="resultado atual" />
        <KPICard label="Contas Únicas"  value={kpis.contas}             icon="🏨" color="var(--color-accent)" sub="no filtro" />
        <KPICard label="Total"          value={fmtKPI(kpis.vlTotal)}   icon="💰" color="var(--color-green)"  sub="valor consumos (filtro)" />
      </div>

      {/* Analysis Buttons — Consumos A&B | Serviços SPA | Taxa Preservação */}
      <HitsAnalysisPanel empresaId={empresaId} consumos={consumos} />

      {/* Toolbar */}
      <div className="contas-toolbar card" style={{ marginBottom: 12, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <input className="form-input form-input-sm" style={{ flex: '1 1 150px', minWidth: 120, maxWidth: 220, fontSize: 12 }}
            placeholder="🔍 Conta, produto, hóspede..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-input form-input-sm" style={{ width: 110, fontSize: 12, flexShrink: 0 }} value={filterConta} onChange={e => setFilterConta(e.target.value)}>
            <option value="">Todas contas</option>
            {contaOpts.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input form-input-sm" style={{ width: 110, fontSize: 12, flexShrink: 0 }} value={filterDepto} onChange={e => setFilterDepto(e.target.value)}>
            <option value="">Todos depto.</option>
            {deptoOpts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <div style={{ width: 1, height: 20, background: 'var(--color-border)', flexShrink: 0 }} />
          <input type="month" className="form-input form-input-sm" style={{ width: 130, fontSize: 12, flexShrink: 0 }} value={mesFiltro} onChange={handleMes} />
          <div style={{ width: 1, height: 20, background: 'var(--color-border)', flexShrink: 0 }} />
          <input type="date" className="form-input form-input-sm" style={{ width: 110, fontSize: 12, flexShrink: 0 }} value={dataInicio} onChange={e => setDataInicio(e.target.value)} title="Data de" />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>até</span>
          <input type="date" className="form-input form-input-sm" style={{ width: 110, fontSize: 12, flexShrink: 0 }} value={dataFim} onChange={e => setDataFim(e.target.value)} title="Data até" />
          <div style={{ flex: '1 1 0' }} />
          <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={handleExportExcel} title="Exportar Excel">📊 Excel</button>
          {rows.length > 0 && rows.length < consumos.length && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-red)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, flexShrink: 0 }}
              onClick={handleDeleteFiltered}
              title={`Cancella i ${rows.length} consumos filtrati`}
            >
              🗑️ Cancella ({rows.length})
            </button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-yellow)', flexShrink: 0 }} onClick={handleClear} title="Limpar Filtros">🧹 Limpar</button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🍽️</div>
            <div className="empty-state-text">
              {consumos.length === 0 ? 'Nenhum Consumo importado' : 'Nenhum resultado nos filtros atuais'}
            </div>
            {consumos.length === 0 && (
              <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={trigger}>📥 Importar Excel</button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Data de Operação</th>
                <th>Comanda</th>
                <th>Produto</th>
                <th>Departamento</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'center' }}>Qtd</th>
                <th style={{ textAlign: 'right' }}>Valor Unit.</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Hóspede</th>
                <th>Ponto de Venda</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>{c.conta}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.dataOperacao || c.data || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.comanda}</td>
                  <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.produto}>
                    {c.produto}
                  </td>
                  <td style={{ fontSize: 12 }}>{c.departamento || '—'}</td>
                  <td>
                    {c.categoria && <span className="badge badge-accent" style={{ fontSize: 10 }}>{c.categoria}</span>}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{c.quantidade}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmtCurrency(c.valor)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-green)' }}>{fmtCurrency(c.total)}</td>
                  <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.hospede}>{c.hospede || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{c.pontoVenda || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems}
          nextPage={nextPage} prevPage={prevPage} goToPage={goToPage} />
      </div>
    </div>
  );
}

// ── Tab: Storico (dati archiviati, sola lettura) ────────────────────────────────────────────────────

function StoricoTab({ empresaId }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filterType, setFilterType] = useState(''); // '' | 'resumo' | 'consumo'
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim,    setDataFim]    = useState('');
  const toast = useToast();

  // Load both storico stores
  useEffect(() => {
    if (!empresaId) return;
    setLoading(true);
    (async () => {
      try {
        const rDb = getDB(empresaId, DB_MODULES.HITS_RESUMO_STORICO);
        const cDb = getDB(empresaId, DB_MODULES.HITS_CONSUMOS_STORICO);
        const [rEntries, cEntries] = await Promise.all([
          dbEntries(rDb).catch(() => []),
          dbEntries(cDb).catch(() => []),
        ]);
        const resumos  = rEntries.map(([, v]) => ({ ...v, _tipo: 'Reserva' }));
        const consumos = cEntries.map(([, v]) => ({ ...v, _tipo: 'Consumo' }));
        // Sort by date desc
        const all = [...resumos, ...consumos].sort((a, b) => {
          const da = a.checkout || a.dataOperacao || a.data || '';
          const db_ = b.checkout || b.dataOperacao || b.data || '';
          return db_.localeCompare(da);
        });
        setRows(all);
      } catch (e) {
        console.warn('[StoricoTab] load error:', e);
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [empresaId]);

  // toIso helper
  const toIso = (dStr) => {
    if (!dStr) return '';
    const s = String(dStr).split(' ')[0];
    if (s.includes('/')) {
      const [d, m, y] = s.split('/');
      return `${y}-${m?.padStart(2,'0')}-${d?.padStart(2,'0')}`;
    }
    return s;
  };

  const filtered = useMemo(() => {
    let list = [...rows];
    if (filterType) list = list.filter(r => r._tipo === filterType);
    if (dataInicio) list = list.filter(r => {
      const iso = toIso(r.checkout || r.dataOperacao || r.data);
      return !iso || iso >= dataInicio;
    });
    if (dataFim) list = list.filter(r => {
      const iso = toIso(r.checkout || r.dataOperacao || r.data);
      return !iso || iso <= dataFim;
    });
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.global        || '').toLowerCase().includes(q) ||
        (r.nomeHospede   || '').toLowerCase().includes(q) ||
        (r.empresaAgencia|| '').toLowerCase().includes(q) ||
        (r.conta         || '').toLowerCase().includes(q) ||
        (r.produto       || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filterType, search, dataInicio, dataFim]);

  const { currentRows, currentPage, totalPages, totalItems, goToPage, nextPage, prevPage } = usePagination(filtered, 50);

  const handleExportExcel = useCallback(() => {
    const data = filtered.map(r => ({
      'Tipo':       r._tipo,
      'Global/Conta': r.global || r.conta || '—',
      'Data':       r.checkout || r.dataOperacao || r.data || '—',
      'Hóspede/Produto': r.nomeHospede || r.produto || '—',
      'Empresa/Agência': r.empresaAgencia || r.departamento || '—',
      'Valor Diárias': r.vlDiarias ?? '',
      'Valor Consumos': r.vlConsumos ?? r.valor ?? '',
      'Total': r.vlTotal ?? '',
    }));
    exportToExcel(data, 'storico_hits', `Storico_${empresaId}`);
    toast.success('Excel storico exportado!');
  }, [filtered, empresaId, toast]);

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  const resumoCount  = rows.filter(r => r._tipo === 'Reserva').length;
  const consumoCount = rows.filter(r => r._tipo === 'Consumo').length;

  return (
    <div style={{ marginTop: 8 }}>

      {/* KPIs */}
      <div className="contas-kpis">
        <KPICard label="Totale Storico" value={rows.length}       icon="🗄️" color="var(--color-accent)" sub="record archiviati" />
        <KPICard label="Reservas"       value={resumoCount}       icon="🏨" color="var(--color-blue)"   sub="nel storico" />
        <KPICard label="Consumos"       value={consumoCount}      icon="🍽️" color="var(--color-purple)" sub="nel storico" />
        <KPICard label="Filtrati"       value={filtered.length}   icon="🔍" color="var(--color-green)"  sub="risultato attuale" />
      </div>

      {/* Toolbar */}
      <div className="contas-toolbar card" style={{ marginBottom: 12, padding: '10px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>
          <input className="form-input form-input-sm" style={{ flex: '1 1 150px', minWidth: 120, maxWidth: 220, fontSize: 12 }}
            placeholder="🔍 Global, hóspede, conta..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <select className="form-input form-input-sm" style={{ width: 120, fontSize: 12, flexShrink: 0 }}
            value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Tutti i tipi</option>
            <option value="Reserva">🏨 Reservas</option>
            <option value="Consumo">🍽️ Consumos</option>
          </select>
          <div style={{ width: 1, height: 20, background: 'var(--color-border)', flexShrink: 0 }} />
          <input type="date" className="form-input form-input-sm" style={{ width: 110, fontSize: 12, flexShrink: 0 }}
            value={dataInicio} onChange={e => setDataInicio(e.target.value)} title="Da" />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>até</span>
          <input type="date" className="form-input form-input-sm" style={{ width: 110, fontSize: 12, flexShrink: 0 }}
            value={dataFim} onChange={e => setDataFim(e.target.value)} title="Até" />
          <div style={{ flex: '1 1 0' }} />
          <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={handleExportExcel}>📊 Excel</button>
          <button className="btn btn-ghost btn-sm"
            style={{ color: 'var(--color-yellow)', flexShrink: 0 }}
            onClick={() => { setSearch(''); setFilterType(''); setDataInicio(''); setDataFim(''); }}>
            🧹 Limpar
          </button>
        </div>
      </div>

      {/* Read-only badge */}
      <div style={{
        marginBottom: 8, padding: '6px 12px', borderRadius: 6, display: 'inline-flex',
        alignItems: 'center', gap: 6, fontSize: 12,
        background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
        color: 'var(--color-yellow)',
      }}>
        🗄️ Dati archiviati — <strong>sola lettura</strong>.
        Per archiviare altri dati vai in <strong>Configurações → Archivio Storico</strong>.
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🗄️</div>
            <div className="empty-state-text">
              {rows.length === 0
                ? 'Nessun dato archiviato per questa empresa'
                : 'Nessun risultato nei filtri attuali'}
            </div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Global / Conta</th>
                <th>Data</th>
                <th>Hóspede / Produto</th>
                <th>Empresa / Agência</th>
                <th style={{ textAlign: 'right' }}>Diárias</th>
                <th style={{ textAlign: 'right' }}>Consumos</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((r, i) => (
                <tr key={r.id || r.global || i}>
                  <td>
                    <span className={`badge ${r._tipo === 'Reserva' ? 'badge-accent' : 'badge-purple'}`}
                      style={{ fontSize: 10 }}>
                      {r._tipo === 'Reserva' ? '🏨' : '🍽️'} {r._tipo}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)' }}>
                    {r.global || r.conta || '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {r.checkout || r.dataOperacao || r.data || '—'}
                  </td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={r.nomeHospede || r.produto}>
                    {r.nomeHospede || r.produto || '—'}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {r.empresaAgencia || r.departamento || '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {r.vlDiarias != null ? fmtCurrency(r.vlDiarias) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-purple)' }}>
                    {r.vlConsumos != null ? fmtCurrency(r.vlConsumos) : (r.valor != null ? fmtCurrency(r.valor) : '—')}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-green)' }}>
                    {r.vlTotal != null ? fmtCurrency(r.vlTotal) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <PaginationControls currentPage={currentPage} totalPages={totalPages} totalItems={totalItems}
          nextPage={nextPage} prevPage={prevPage} goToPage={goToPage} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RegistroReservasPage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const { empresas, activeEmpresa } = useEmpresa();
  const empresaCtx = empresas.find(e => e.id === empresaId) || activeEmpresa;

  const pageLabel = empresaCtx?.name
    ? `Reservas & Consumos — ${empresaCtx.name}`
    : 'Reservas & Consumos';

  const [activeTab,   setActiveTab]   = useState('resumo');
  const [hasStorico,  setHasStorico]  = useState(false);

  // Check storico on mount / empresa change — show tab only if data exists
  useEffect(() => {
    if (!empresaId) return;
    getStoricoTotals(empresaId).then(totals => {
      setHasStorico(totals.resumos > 0 || totals.consumos > 0);
    });
  }, [empresaId]);

  const tabs = useMemo(() => [
    { id: 'resumo',   icon: '🏨', label: 'Reservas' },
    { id: 'consumos', icon: '🍽️', label: 'Consumos Lançados' },
    ...(hasStorico ? [{ id: 'storico', icon: '🗄️', label: 'Storico' }] : []),
  ], [hasStorico]);

  // Wait for empresa context before rendering
  if (!empresaCtx) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div className="contas-page">
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <button onClick={() => navigate(-1)} className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content', marginBottom: 12 }}>
            ← Voltar
          </button>
          <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>🏩</span> {pageLabel}
          </h2>
        </div>

        {/* Import button hidden on storico tab (read-only) */}
        {activeTab !== 'storico' && (
          <button
            className="btn"
            onClick={() => document.getElementById(`import-${activeTab}-input`)?.click()}
            style={{
              background: 'var(--color-green, #22c55e)',
              color: '#fff',
              border: 'none',
              padding: '10px 24px',
              fontSize: 15,
              fontWeight: 700,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
              borderRadius: 8
            }}
          >
            📥 Importar Excel
          </button>
        )}
      </div>

      {/* Tab nav */}
      <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === 'resumo'   && <ResumoTab   empresaId={empresaId} />}
      {activeTab === 'consumos' && <ConsumosTab empresaId={empresaId} />}
      {activeTab === 'storico'  && <StoricoTab  empresaId={empresaId} />}
    </div>
  );
}
