/**
 * NfsEmitidasPage.jsx — Notas Fiscais de Serviços Emitidas
 *
 * Tab “Serviços” — NFs emitidas (OMIE/TINUS import), tutti le aziende
 * Tab “Consumos” — NFs Emitidas Consumos (Tinus export, formato Global|Tipo|Num.)
 *                 Visibile solo se sistemaFrontend === 'hits'
 */
import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { exportToExcel, exportToPdf } from '../utils/exportUtils';
import { useNfsEmitidas }  from '../hooks/useNfsEmitidas';
import { useNfsConsumos }  from '../hooks/useNfsConsumos';
import { useEmpresa }      from '../context/EmpresaContext';
import { useToast } from '../context/ToastContext';
import NfModal from '../components/nfs/NfModal';
import ImportNfsModal from '../components/nfs/ImportNfsModal';
import { usePagination } from '../hooks/usePagination';
import PaginationControls from '../components/common/PaginationControls';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; }
}

function fmtMonth(m) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const names = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${names[Number(mo) - 1]} ${y}`;
}

function fmtCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString('pt-BR');
}

const badge = (s) => ({
  'Normal':    'badge-green',
  'Cancelada': 'badge-red',
  'Quitada':   'badge-green',
  'Pendente':  'badge-yellow',
  'Parcial':   'badge-blue',
}[s] || 'badge-accent');

// ── KPI card ─────────────────────────────────────────────────────────────────

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
      title={onClick ? 'Clique para filtrar' : undefined}
    >
      <div className="kpi-header" style={{ marginBottom: 2 }}>
        <span className="kpi-label" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div className="kpi-value" style={{ color, fontSize: 18, lineHeight: 1, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
        {sub && <span className="kpi-sub" style={{ fontSize: 9, opacity: 0.6, margin: 0, textTransform: 'lowercase', whiteSpace: 'nowrap' }}>{sub}</span>}
      </div>
    </div>
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

// ── Import banner ─────────────────────────────────────────────────────────────

function ImportBanner({ result, onClose }) {
  if (!result) return null;
  return (
    <div style={{
      background: result.imported > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
      border: `1px solid ${result.imported > 0 ? 'var(--color-green)' : 'var(--color-yellow)'}`,
      borderRadius: 8, padding: '10px 16px', marginBottom: 12,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
    }} className="fade-in">
      <span>
        ✅ <strong>{result.imported}</strong> registros importados
        {result.skipped > 0 && <> · <strong>{result.skipped}</strong> duplicatas ignoradas</>}
      </span>
      <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
    </div>
  );
}

// ── Excel Import helper (header-safe) ────────────────────────────────────────
// Some Excel files have empty rows above the real header row. Using header:1
// (array mode) we find the first non-empty row, use it as the true header, and
// map the remaining rows to objects — regardless of where in the sheet the
// headers actually live.

function useExcelImport({ onImport, inputId }) {
  const [importing, setImporting] = useState(false);
  const toast = useToast();
  const fileRef = useRef(null);

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

      // Read as raw arrays so we can find the real header row ourselves
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

      // Find first row that has at least one non-null, non-empty cell
      const headerIdx = allRows.findIndex(r =>
        Array.isArray(r) && r.some(c => c !== null && c !== undefined && c !== '')
      );
      if (headerIdx < 0) { toast.error('Arquivo vazio ou sem cabeçalho.'); return; }

      const headers = allRows[headerIdx].map(h => (h != null ? String(h).trim() : ''));

      // Build objects for every data row after the header
      const rows = allRows
        .slice(headerIdx + 1)
        .filter(r => Array.isArray(r) && r.some(c => c !== null && c !== undefined && c !== ''))
        .map(r => {
          const obj = {};
          headers.forEach((h, i) => { if (h) obj[h] = r[i] ?? null; });
          return obj;
        });

      await onImport(rows);
    } catch (err) {
      toast.error(`Erro ao ler arquivo: ${err.message}`);
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

// ── Tab: Consumos (NFs Emitidas Consumos — Tinus format) ──────────────────────

function ConsumosTab({ empresaId }) {
  const toast = useToast();
  const { nfsConsumos, loading, importNfsConsumos, clearNfsConsumos } = useNfsConsumos(empresaId);
  const [search,        setSearch]        = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterTipo,    setFilterTipo]    = useState('');
  const [dataInicio,    setDataInicio]    = useState('');
  const [dataFim,       setDataFim]       = useState('');
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  const [mesFiltro,     setMesFiltro]     = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) { const d = new Date(); saved = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    return saved;
  });
  const [importResult,  setImportResult]  = useState(null);

  const hasFilters = search || filterStatus || filterTipo || dataInicio || dataFim || mesFiltro;

  const resetFilters = () => {
    setSearch(''); setFilterStatus(''); setFilterTipo('');
    setDataInicio(''); setDataFim(''); setMesFiltro('');
  };

  const statusOpts = useMemo(() => [...new Set(nfsConsumos.map(c => c.status).filter(Boolean))].sort(), [nfsConsumos]);
  const tipoOpts   = useMemo(() => [...new Set(nfsConsumos.map(c => c.tipo).filter(Boolean))].sort(), [nfsConsumos]);

  const rows = useMemo(() => {
    let list = [...nfsConsumos];
    if (filterStatus) list = list.filter(c => c.status === filterStatus);
    if (filterTipo)   list = list.filter(c => c.tipo   === filterTipo);
    // Data filter: the 'data' field is a PT-BR string (DD/MM/YYYY) — compare via ISO raw
    // The record stores 'dataRaw' as serialized Excel date converted to PT-BR string.
    // We normalise to YYYY-MM-DD for comparison if user picks a date.
    if (dataInicio || dataFim || mesFiltro) {
      list = list.filter(c => {
        const parts = (c.data || '').split('/');
        if (parts.length < 3) return true;
        const iso = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
        if (dataInicio && iso < dataInicio) return false;
        if (dataFim   && iso > dataFim)    return false;
        // Month filter: compare YYYY-MM prefix
        if (mesFiltro && `${parts[2]}-${parts[1]}` !== mesFiltro) return false;
        return true;
      });
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.global         || '').toLowerCase().includes(q) ||
        (c.empresaHospede || '').toLowerCase().includes(q) ||
        (c.numero         || '').toLowerCase().includes(q) ||
        (c.comanda        || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [nfsConsumos, search, filterStatus, filterTipo, dataInicio, dataFim, mesFiltro]);

  const kpis = useMemo(() => ({
    total:    nfsConsumos.length,
    filtered: rows.length,
    vlTotal:  rows.reduce((s, c) => s + (c.vlPagto || 0), 0),
    autorizados: rows.filter(c => c.status === 'Autorizado').length,
  }), [nfsConsumos.length, rows]);

  const { currentRows, currentPage, totalPages, totalItems, goToPage, nextPage, prevPage } = usePagination(rows, 100);

  const handleImport = useCallback(async (excelRows) => {
    const result = await importNfsConsumos(excelRows);
    setImportResult(result);
    if (result.imported > 0) toast.success(`${result.imported} consumos importados!`);
    else toast.info(`Nenhum novo consumo — ${result.skipped} duplicatas ignoradas.`);
  }, [importNfsConsumos, toast]);

  const handleClear = async () => {
    if (!window.confirm('🚨 Apagar TODOS os dados de Consumos desta empresa?')) return;
    await clearNfsConsumos();
    setImportResult(null);
    toast.info('Base de dados Consumos esvaziada.');
  };

  const handleExportExcel = useCallback(() => {
    const data = rows.map(c => ({
      'Global':           c.global,
      'Tipo':             c.tipo,
      'Série':            c.serie,
      'Num.':             c.numero,
      'Pedido':           c.pedido,
      'Out':              c.out,
      'Data':             c.data,
      'Cancelamento':     c.cancelamento ?? '',
      'Empresa/Hóspede':  c.empresaHospede,
      'Documento':        c.documento,
      'Vl Pagto. (R$)':   c.vlPagto,
      'Comanda':          c.comanda,
      'Status':           c.status,
    }));
    exportToExcel(data, 'nfs_consumos', 'NFs_Consumos');
    toast.success('Excel exportado!');
  }, [rows, toast]);

  const { trigger, importing, Input } = useExcelImport({ onImport: handleImport, inputId: 'nfs-consumos-import' });

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div>
      {Input}
      <ImportBanner result={importResult} onClose={() => setImportResult(null)} />

      {/* KPIs */}
      <div className="contas-kpis" style={{ marginBottom: 16 }}>
        <KPICard label="Total Consumos"  value={fmtNum(kpis.total)}          icon="🧾" color="var(--color-purple)" sub="na base" />
        <KPICard label="Filtrados"       value={fmtNum(kpis.filtered)}       icon="🔍" color="var(--color-blue)"   sub="resultado atual" />
        <KPICard label="Autorizados"     value={fmtNum(kpis.autorizados)}    icon="✅" color="var(--color-green)"  sub="no filtro" />
        <KPICard label="Total Recebido" value={fmtCurrency(kpis.vlTotal)}   icon="💰" color="var(--color-accent)" sub="vl. pagto. (filtro)" />
      </div>

      {/* Toolbar */}
      <div className="contas-toolbar card" style={{ marginBottom: 12 }}>
        <div className="contas-toolbar-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '1 1 auto', alignItems: 'center' }}>
            <input className="form-input form-input-sm" style={{ flex: 1, minWidth: 160, maxWidth: 220 }}
              placeholder="🔍 Global, hóspede, comanda..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input form-input-sm" style={{ width: 120 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
              <option value="">Tipo</option>
              {tipoOpts.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="form-input form-input-sm" style={{ width: 120 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Status</option>
              {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div title="Data de Inicio/Fim" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="date" className="form-input form-input-sm" style={{ width: 110 }} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              <input type="date" className="form-input form-input-sm" style={{ width: 110 }} value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <div title="Mês de Competência">
              <input type="month" className="form-input form-input-sm" style={{ width: 140 }} value={mesFiltro} onChange={e => { setMesFiltro(e.target.value); if(e.target.value) localStorage.setItem(FILTER_MONTH_KEY, e.target.value); }} />
            </div>


            {hasFilters && (
              <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ color: 'var(--color-yellow)' }}>✕</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
            <button className="btn btn-ghost btn-sm" onClick={handleExportExcel} title="Exportar Excel">📊</button>
            <div style={{ width: 1, height: 16, background: 'var(--color-border)' }} />
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }} onClick={handleClear} title="Limpar Base">🗑️</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-text">
              {nfsConsumos.length === 0 ? 'Nenhum Consumo importado' : 'Nenhum resultado nos filtros atuais'}
            </div>
            {nfsConsumos.length === 0 && (
              <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={trigger}>📥 Importar Excel</button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Global</th>
                <th>Tipo</th>
                <th>Num.</th>
                <th>Data</th>
                <th>Out</th>
                <th>Empresa/Hóspede</th>
                <th>Documento</th>
                <th>Comanda</th>
                <th style={{ textAlign: 'right' }}>Vl Pagto.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>{c.global}</td>
                  <td><span className="badge badge-accent" style={{ fontSize: 10 }}>{c.tipo}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.numero}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.data || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.out || '—'}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.empresaHospede}>{c.empresaHospede || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.documento || '—'}</td>
                  <td style={{ fontSize: 12 }}>{c.comanda || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-green)' }}>{fmtCurrency(c.vlPagto)}</td>
                  <td>
                    <span className={`badge ${c.status === 'Autorizado' ? 'badge-green' : c.status === 'Cancelado' ? 'badge-red' : 'badge-yellow'}`}>
                      {c.status}
                    </span>
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function NfsEmitidasPage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { empresas, activeEmpresa } = useEmpresa();
  const empresaCtx = empresas.find(e => e.id === empresaId) || activeEmpresa;
  const isHits = empresaCtx?.sistemaFrontend === 'hits';

  const { nfs, loading, saveNf, deleteNf, deleteMultipleNfs, importNfs, checkDuplicates } = useNfsEmitidas(empresaId);

  const [activeTab,   setActiveTab]   = useState('servicos');
  const [editing,     setEditing]     = useState(null);
  const [showModal,   setShowModal]   = useState(false);
  const [showImport,  setShowImport]  = useState(false);

  // ── Filters (Serviços tab only) ────────────────────────────────────────────
  const [search,           setSearch]           = useState('');
  const [dataInicio,       setDataInicio]       = useState('');
  const [dataFim,          setDataFim]          = useState('');
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  const [compMes,          setCompMes]          = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) { const d = new Date(); saved = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    return saved;
  });
  const [filtroSituacaoNota,     setFiltroSituacaoNota]     = useState('');
  const [filtroSituacaoPagamento,setFiltroSituacaoPagamento] = useState('');
  const [filtroAguardando,       setFiltroAguardando]       = useState(false);
  const [sortConfig,             setSortConfig]             = useState({ key: 'dataEmissao', asc: false });

  const resetFilters = () => {
    setSearch(''); setDataInicio(''); setDataFim('');
    setCompMes('');
    setFiltroSituacaoNota(''); setFiltroSituacaoPagamento('');
    setFiltroAguardando(false);
  };

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev?.key === key) return { key, asc: !prev.asc };
      return { key, asc: false };
    });
  };

  const hasFilters = search || dataInicio || dataFim || compMes || filtroSituacaoNota || filtroSituacaoPagamento || filtroAguardando;

  // ── Filtered rows (Serviços tab) ───────────────────────────────────────────
  const rows = useMemo(() => {
    const capitalize = s => {
      if (!s) return '';
      s = s.trim();
      return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    };

    let list = nfs.map(n => ({
      ...n,
      situacaoNota: capitalize(n.situacaoNota) || 'Normal',
      situacaoPagamento: capitalize(n.situacaoPagamento) || 'Pendente'
    }));

    if (filtroSituacaoNota)      list = list.filter(n => n.situacaoNota      === filtroSituacaoNota);
    if (filtroAguardando)        list = list.filter(n => n.situacaoPagamento !== 'Quitada');
    else if (filtroSituacaoPagamento) list = list.filter(n => n.situacaoPagamento === filtroSituacaoPagamento);
    if (dataInicio)   list = list.filter(n => n.dataEmissao >= dataInicio);
    if (dataFim)      list = list.filter(n => n.dataEmissao <= dataFim);
    // Competência: single month filter (YYYY-MM exact match)
    if (compMes)      list = list.filter(n => n.competencia === compMes);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        (n.nomeTomador || '').toLowerCase().includes(q) ||
        (n.numero      || '').toString().includes(q)    ||
        (n.descricao   || '').toLowerCase().includes(q)
      );
    }

    if (sortConfig) {
      list.sort((a, b) => {
        if (sortConfig.key === 'valorServico') {
          const vA = Number(a.valorServico || 0);
          const vB = Number(b.valorServico || 0);
          return sortConfig.asc ? vA - vB : vB - vA;
        }
        if (sortConfig.key === 'dataEmissao') {
          const dA = a.dataEmissao || '';
          const dB = b.dataEmissao || '';
          return sortConfig.asc ? dA.localeCompare(dB) : dB.localeCompare(dA);
        }
        return 0;
      });
    }

    return list;
  }, [nfs, search, dataInicio, dataFim, compMes, filtroSituacaoNota, filtroSituacaoPagamento, filtroAguardando, sortConfig]);

  // ── KPIs (Serviços tab) ────────────────────────────────────────────────────
  const kpis = useMemo(() => ({
    count:        rows.length,
    valorTotal:   rows.reduce((s, n) => s + (n.valorServico || 0), 0),
    issqnTotal:   rows.reduce((s, n) => s + (n.issqn        || 0), 0),
    pendentes:    rows.filter(n => n.situacaoPagamento !== 'Quitada').length,
    canceladas:   rows.filter(n => n.situacaoNota      === 'Cancelada').length,
  }), [rows]);

  // ── Pagination (Serviços tab) ──────────────────────────────────────────────
  const { currentRows, currentPage, totalPages, totalItems, goToPage, nextPage, prevPage } = usePagination(rows, 50);

  // ── Actions (Serviços tab) ─────────────────────────────────────────────────
  const handleSaveNf = async (data) => {
    await saveNf(data);
    toast.success(data.id ? 'NF atualizada!' : 'NF adicionada!');
    setShowModal(false);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar esta NF?')) return;
    await deleteNf(id);
    toast.info('NF removida.');
  };

  const handleImport = async (importedRows) => {
    const count = await importNfs(importedRows);
    toast.success(`${count} NFs importadas com sucesso!`);
    return count;
  };

  const handleExportExcel = useCallback(() => {
    const data = rows.map(n => ({
      'Nº NFSe':              n.numero || '—',
      'Data Emissão':         fmtDate(n.dataEmissao),
      'Competência':          fmtMonth(n.competencia),
      'Situação Nota':        n.situacaoNota,
      'Situação Pagamento':   n.situacaoPagamento,
      'Tomador':              n.nomeTomador || '—',
      'CPF/CNPJ Tomador':     n.cnpjTomador || '',
      'Valor Serviço (R$)':   n.valorServico,
      'Alíquota (%)':         n.aliquota,
      'ISSQN Apurado (R$)':   n.issqn,
      'Descrição':            n.descricao || ''
    }));
    exportToExcel(data, 'nfs_emitidas', 'NFs');
    toast.success('Excel exportado!');
  }, [rows, toast]);

  const handleExportPdf = useCallback(() => {
    const cols = [
      { label: 'Nº', getValue: n => n.numero || '—' },
      { label: 'Emissão', getValue: n => fmtDate(n.dataEmissao) },
      { label: 'Comp.', getValue: n => fmtMonth(n.competencia) },
      { label: 'Tomador', getValue: n => n.nomeTomador || '—' },
      { label: 'Valor Serv.', getValue: n => fmtCurrency(n.valorServico) },
      { label: 'ISSQN', getValue: n => fmtCurrency(n.issqn) },
      { label: 'Nota', getValue: n => n.situacaoNota },
      { label: 'Pagamento', getValue: n => n.situacaoPagamento }
    ];
    exportToPdf('NFs Emitidas', cols, rows);
  }, [rows]);

  // ── Tab definitions ────────────────────────────────────────────────────────
  const tabs = [
    { id: 'servicos', icon: '🧾', label: 'Serviços' },
    ...(isHits ? [{ id: 'consumos', icon: '🍽️', label: 'Consumos' }] : []),
  ];

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div className="contas-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)' }}>← Voltar</button>
        </div>

        <button
          className="btn"
          onClick={() => {
            if (activeTab === 'servicos') setShowImport(true);
            else {
              const ipt = document.getElementById('nfs-consumos-import');
              if (ipt) ipt.click();
            }
          }}
          style={{
            background: 'var(--color-green, #22c55e)',
            color: '#fff',
            border: 'none',
            padding: '8px 20px',
            fontSize: 14,
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
      </div>

      {/* Tab navigation (only if HITS empresa) */}
      {tabs.length > 1 && (
        <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />
      )}

      {/* ── Tab: Serviços ──────────────────────────────────────────────────── */}
      {activeTab === 'servicos' && (
        <>
          {/* KPIs */}
          <div className="contas-kpis">
            <KPICard label="NFs Emitidas"    value={kpis.count}                  icon="🧾" color="var(--color-accent)"  sub="na seleção atual"
              onClick={hasFilters ? resetFilters : undefined}
              active={false}
            />
            <KPICard label="Valor Total"     value={fmtCurrency(kpis.valorTotal)} icon="💰" color="var(--color-green)"  sub="serviços prestados" />
            <KPICard label="ISSQN Total"     value={fmtCurrency(kpis.issqnTotal)} icon="🏛️" color="var(--color-yellow)" sub="imposto apurado" />
            <KPICard label="Aguardando Pag." value={kpis.pendentes}               icon="⏳" color="var(--color-red)"    sub={`${kpis.canceladas} canceladas`}
              active={filtroAguardando}
              onClick={() => { setFiltroAguardando(f => !f); setFiltroSituacaoPagamento(''); }}
            />
          </div>

          {/* Toolbar */}
          <div className="contas-toolbar card" style={{ marginBottom: 12 }}>
            <div className="contas-toolbar-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '1 1 auto', alignItems: 'center' }}>
                <input
                  className="form-input form-input-sm"
                  style={{ flex: 1, minWidth: 140, maxWidth: 220 }}
                  placeholder="🔍 Pesquisar nº, tomador..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <select className="form-input form-input-sm" style={{ width: 110 }} value={filtroSituacaoNota} onChange={e => setFiltroSituacaoNota(e.target.value)}>
                  <option value="">Status NF</option>
                  {['Normal','Cancelada','Substituto'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="form-input form-input-sm" style={{ width: 110 }} value={filtroSituacaoPagamento} onChange={e => setFiltroSituacaoPagamento(e.target.value)}>
                  <option value="">Status Pag.</option>
                  {['Quitada','Pendente','Parcial'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                
                <div title="Data de Emissão (Inicio/Fim)" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="date" className="form-input form-input-sm" style={{ width: 110 }} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
                  <input type="date" className="form-input form-input-sm" style={{ width: 110 }} value={dataFim} onChange={e => setDataFim(e.target.value)} />
                </div>
                <div title="Mês de Competência">
                  <input type="month" className="form-input form-input-sm" style={{ width: 140 }} value={compMes} onChange={e => { setCompMes(e.target.value); if(e.target.value) localStorage.setItem(FILTER_MONTH_KEY, e.target.value); }} />
                </div>


                {hasFilters && (
                  <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ color: 'var(--color-yellow)', flexShrink: 0 }}>✕</button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ color: 'var(--color-red)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  disabled={rows.length === 0}
                  title="Esvaziar Tabela"
                  onClick={() => {
                    if (window.confirm(`Tem certeza que deseja EXCLUIR DEFINITIVAMENTE as ${rows.length} notas fiscais listadas atualmente?`)) {
                       deleteMultipleNfs(rows.map(r => r.id));
                       toast.info(`${rows.length} NFs apagadas.`);
                    }
                  }}
                >
                  🗑️ {rows.length > 0 ? `(${rows.length})` : ''}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleExportExcel} title="Exportar Excel">📊</button>
                <button className="btn btn-ghost btn-sm" onClick={handleExportPdf}   title="Exportar PDF">🖨️</button>
                <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 4px' }} />
                <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowModal(true); }}>+ NF Manual</button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="card" style={{ overflow: 'auto' }}>
            {rows.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🧾</div>
                <div className="empty-state-text">
                  {nfs.length === 0 ? 'Nenhuma NF cadastrada' : 'Nenhuma NF nos filtros atuais'}
                </div>
                {nfs.length === 0 && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setShowImport(true)}>📥 Importar Excel</button>
                    <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>+ NF Manual</button>
                  </div>
                )}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nº NFSe</th>
                    <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('dataEmissao')}>
                      Data Emissão {sortConfig?.key === 'dataEmissao' ? (sortConfig.asc ? '▲' : '▼') : ''}
                    </th>
                    <th>Competência</th>
                    <th>Tomador</th>
                    <th>Tipo Serviço</th>
                    <th style={{ textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSort('valorServico')}>
                      Valor Serviço {sortConfig?.key === 'valorServico' ? (sortConfig.asc ? '▲' : '▼') : ''}
                    </th>
                    <th style={{ textAlign: 'right' }}>ISSQN</th>
                    <th>Situação</th>
                    <th>Pagamento</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {currentRows.map(n => (
                    <tr key={n.id} style={{ opacity: n.situacaoNota === 'Cancelada' ? 0.5 : 1 }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{n.numero || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDate(n.dataEmissao)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtMonth(n.competencia)}</td>
                      <td style={{ maxWidth: 200 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.nomeTomador}>
                          {n.nomeTomador || '—'}
                        </span>
                      </td>
                      <td style={{ maxWidth: 150, fontSize: 11, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={n.descricao}>
                        {n.descricao || '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-green)' }}>
                        {fmtCurrency(n.valorServico)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-yellow)' }}>
                        {fmtCurrency(n.issqn)}
                      </td>
                      <td><span className={`badge ${badge(n.situacaoNota)}`}>{n.situacaoNota}</span></td>
                      <td><span className={`badge ${badge(n.situacaoPagamento)}`}>{n.situacaoPagamento}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" title="Editar"
                            onClick={() => { setEditing(n); setShowModal(true); }}>✏️</button>
                          <button className="btn btn-ghost btn-sm" title="Deletar"
                            style={{ color: 'var(--color-red)' }}
                            onClick={() => handleDelete(n.id)}>×</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <PaginationControls
              currentPage={currentPage} totalPages={totalPages} totalItems={totalItems}
              nextPage={nextPage} prevPage={prevPage} goToPage={goToPage}
            />
          </div>
        </>
      )}

      {/* ── Tab: Consumos (HITS only) ───────────────────────────────────────── */}
      {activeTab === 'consumos' && isHits && (
        <ConsumosTab empresaId={empresaId} />
      )}

      {/* Modais */}
      {showModal && (
        <NfModal
          nf={editing}
          onSave={handleSaveNf}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
      {showImport && (
        <ImportNfsModal
          empresaCnpj={empresaCtx?.cnpj}
          onImport={handleImport}
          checkDuplicates={checkDuplicates}
          onClose={(count) => {
            setShowImport(false);
            if (count > 0) toast.success(`${count} NFs importadas!`);
          }}
        />
      )}
    </div>
  );
}
