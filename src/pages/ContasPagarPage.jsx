/**
 * ContasPagarPage.jsx — Contas a Pagar (OMIE)
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { exportToExcel, exportToPdf } from '../utils/exportUtils';
import { useContasPagar } from '../hooks/useContasPagar';
import { useToast } from '../context/ToastContext';
import ContaPagarModal from '../components/contasPagar/ContaPagarModal';
import ImportContasPagarModal from '../components/contasPagar/ImportContasPagarModal';
import { usePagination } from '../hooks/usePagination';
import PaginationControls from '../components/common/PaginationControls';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; }
}

function fmtCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + 'T23:59:59') < new Date();
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
      }}
      onClick={onClick}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'scale(1.02)'; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = 'scale(1)'; }}
      title={onClick ? 'Clique para filtrar' : undefined}
    >
      <div className="kpi-header">
        <span className="kpi-label">{label}</span>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContasPagarPage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { contas, loading, saveConta, deleteConta, importContas, checkDuplicates } = useContasPagar(empresaId);

  const [editing,    setEditing]    = useState(null);
  const [showModal,  setShowModal]  = useState(false);
  const [showImport, setShowImport] = useState(false);

  // ── Filters ────────────────────────────────────────────────────────────────
  const [search,        setSearch]        = useState('');
  const [vencDe,        setVencDe]        = useState('');
  const [vencAte,       setVencAte]       = useState('');
  const [filtroCategoria,  setFiltroCategoria]  = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [filtroVencidas,   setFiltroVencidas]   = useState(false);
  const [filtroAPagar,     setFiltroAPagar]     = useState(false);

  const resetFilters = () => {
    setSearch(''); setVencDe(''); setVencAte('');
    setFiltroCategoria(''); setFiltroFornecedor('');
    setFiltroVencidas(false); setFiltroAPagar(false);
  };

  const hasFilters = search || vencDe || vencAte || filtroCategoria || filtroFornecedor || filtroVencidas || filtroAPagar;

  // Unique options for dropdowns
  const categoriasOpts  = useMemo(() => [...new Set(contas.map(c => c.categoria).filter(Boolean))].sort(), [contas]);
  const fornecedoresOpts = useMemo(() => [...new Set(contas.map(c => c.fornecedor).filter(Boolean))].sort(), [contas]);

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const rows = useMemo(() => {
    let list = [...contas];
    if (filtroVencidas)    list = list.filter(r => isOverdue(r.vencimento) && r.aPagar !== 0);
    if (filtroAPagar)      list = list.filter(r => r.aPagar !== 0);
    if (filtroCategoria)   list = list.filter(r => r.categoria === filtroCategoria);
    if (filtroFornecedor)  list = list.filter(r => r.fornecedor === filtroFornecedor);
    if (vencDe)            list = list.filter(r => r.vencimento >= vencDe);
    if (vencAte)           list = list.filter(r => r.vencimento <= vencAte);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.fornecedor  || '').toLowerCase().includes(q) ||
        (r.categoria   || '').toLowerCase().includes(q) ||
        (r.notaFiscal  || '').toLowerCase().includes(q) ||
        (r.numero      || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [contas, search, vencDe, vencAte, filtroCategoria, filtroFornecedor, filtroVencidas, filtroAPagar]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      count:      rows.length,
      totalAPagar: rows.reduce((s, r) => s + (r.aPagar || 0), 0),
      totalPago:   rows.reduce((s, r) => s + (r.valorPago || 0), 0),
      vencidas:    rows.filter(r => r.vencimento && r.vencimento < hoje && r.aPagar !== 0).length,
    };
  }, [rows]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const { currentRows, currentPage, totalPages, totalItems, goToPage, nextPage, prevPage } = usePagination(rows, 50);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleSave = async (data) => {
    await saveConta(data);
    toast.success(data.id ? 'Conta atualizada!' : 'Conta adicionada!');
    setShowModal(false); setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar esta conta?')) return;
    await deleteConta(id);
    toast.info('Conta removida.');
  };

  const handleImport = async (rows) => {
    const count = await importContas(rows);
    return count;
  };

  // ── Export Excel ───────────────────────────────────────────────────────────
  const handleExportExcel = useCallback(() => {
    const data = rows.map(r => ({
      'Fornecedor':       r.fornecedor || '',
      'CNPJ/CPF':         r.cnpjFornecedor || '',
      'Emissão':          fmtDate(r.emissao),
      'Vencimento':       fmtDate(r.vencimento),
      'Previsão':         fmtDate(r.previsao),
      'Categoria':        r.categoria || '',
      'Conta Corrente':   r.contaCorrente || '',
      'Nota Fiscal':      r.notaFiscal || '',
      'Parcela':          r.parcela || '',
      'Documento':        r.documento || '',
      'Número':           r.numero || '',
      'Origem':           r.origem || '',
      'Valor da Conta (R$)': r.valorConta,
      'Valor Pago (R$)':  r.valorPago,
      'A Pagar (R$)':     r.aPagar,
      'Valor Líquido (R$)': r.valorLiquido,
    }));
    exportToExcel(data, 'contas_pagar', 'Contas a Pagar');
    toast.success('Excel exportado!');
  }, [rows, toast]);

  // ── Export PDF ────────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    const cols = [
      { label: 'Fornecedor', getValue: r => r.fornecedor || '—' },
      { label: 'Venc.', getValue: r => fmtDate(r.vencimento) },
      { label: 'Categoria', getValue: r => r.categoria || '—' },
      { label: 'NF', getValue: r => r.notaFiscal || '—' },
      { label: 'Valor', getValue: r => fmtCurrency(r.valorConta) },
      { label: 'Pago', getValue: r => fmtCurrency(r.valorPago) },
      { label: 'A Pagar', getValue: r => fmtCurrency(r.aPagar) }
    ];
    exportToPdf('Contas a Pagar (OMIE)', cols, rows);
  }, [rows]);

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div className="contas-page">
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content' }}>← Voltar</button>
      </div>
      {/* KPIs */}
      <div className="contas-kpis">
        <KPICard label="Contas"     value={kpis.count}                   icon="💳" color="var(--color-accent)"
          onClick={hasFilters ? resetFilters : undefined} />
        <KPICard label="A Pagar"    value={fmtCurrency(kpis.totalAPagar)} icon="⏳" color="var(--color-red)"
          active={filtroAPagar}
          onClick={() => { setFiltroAPagar(f => !f); setFiltroVencidas(false); }} />
        <KPICard label="Total Pago" value={fmtCurrency(kpis.totalPago)}  icon="✅" color="var(--color-green)" />
        <KPICard label="Vencidas"   value={kpis.vencidas}                icon="🚨" color="var(--color-yellow)"
          active={filtroVencidas}
          onClick={() => { setFiltroVencidas(f => !f); setFiltroAPagar(false); }} />
      </div>

      {/* Toolbar */}
      <div className="contas-toolbar card">
        {/* Row 1 */}
        <div className="contas-toolbar-row" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <input className="form-input" style={{ flex: 1, minWidth: 140, maxWidth: 280 }}
              placeholder="🔍 Fornecedor, categoria, NF, nº..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input" style={{ width: 155, flexShrink: 0 }} value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
              <option value="">Todas categorias</option>
              {categoriasOpts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="form-input" style={{ width: 185, flexShrink: 0 }} value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)}>
              <option value="">Todos fornecedores</option>
              {fornecedoresOpts.map(f => <option key={f} value={f} title={f}>{f.length > 28 ? f.slice(0, 26) + '…' : f}</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{rows.length} conta{rows.length !== 1 ? 's' : ''}</span>
            {hasFilters && (
              <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ color: 'var(--color-yellow)', flexShrink: 0 }}>✕ Limpar</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={handleExportExcel}>📊 Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={handleExportPdf}>🖨️ PDF</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowImport(true)}>📥 OMIE</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowModal(true); }}>+ Manual</button>
          </div>
        </div>

        {/* Row 2: date filter */}
        <div className="contas-toolbar-row" style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Vencimento de:</label>
          <input type="date" className="form-input" style={{ width: 145 }} value={vencDe}  onChange={e => setVencDe(e.target.value)} />
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>até:</label>
          <input type="date" className="form-input" style={{ width: 145 }} value={vencAte} onChange={e => setVencAte(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th>Vencimento</th>
              <th>Categoria</th>
              <th>NF</th>
              <th>Parcela</th>
              <th style={{ textAlign: 'right' }}>Valor Conta</th>
              <th style={{ textAlign: 'right' }}>Pago</th>
              <th style={{ textAlign: 'right' }}>A Pagar</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map(r => {
              const vencida = isOverdue(r.vencimento) && r.aPagar !== 0;
              return (
                <tr key={r.id} style={{ background: vencida ? 'rgba(239,68,68,0.05)' : undefined }}>
                  <td style={{ maxWidth: 220 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.fornecedor}>
                      {r.fornecedor || '—'}
                    </span>
                    {r.cnpjFornecedor && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{r.cnpjFornecedor}</span>
                    )}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: vencida ? 'var(--color-red)' : undefined, fontWeight: vencida ? 700 : undefined }}>
                    {fmtDate(r.vencimento)}
                    {vencida && <span style={{ fontSize: 10, marginLeft: 4 }}>⚠️</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.categoria || '—'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.notaFiscal || '—'}</td>
                  <td style={{ fontSize: 12 }}>{r.parcela || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {fmtCurrency(r.valorConta)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-green)' }}>
                    {fmtCurrency(r.valorPago)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: r.aPagar < 0 ? 'var(--color-red)' : r.aPagar === 0 ? 'var(--color-text-muted)' : 'var(--color-yellow)' }}>
                    {fmtCurrency(r.aPagar)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(r); setShowModal(true); }}>✏️</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => handleDelete(r.id)}>×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                  {contas.length === 0 ? 'Nenhuma conta cadastrada — 📥 OMIE para importar' : 'Nenhuma conta nos filtros atuais'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <PaginationControls
          currentPage={currentPage} totalPages={totalPages} totalItems={totalItems}
          nextPage={nextPage} prevPage={prevPage} goToPage={goToPage}
        />
      </div>

      {showModal && (
        <ContaPagarModal conta={editing} onSave={handleSave} onClose={() => { setShowModal(false); setEditing(null); }} />
      )}
      {showImport && (
        <ImportContasPagarModal
          onImport={handleImport}
          checkDuplicates={checkDuplicates}
          onClose={(count) => {
            setShowImport(false);
            if (count > 0) toast.success(`${count} contas importadas (OMIE)!`);
          }}
        />
      )}
    </div>
  );
}
