/**
 * EstratiPage.jsx — Bank Statements module
 * Features: multi-bank tabs, KPI strip, configurable columns, full CRUD, import wizard
 */
import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useEmpresa } from '../context/EmpresaContext';
import { useToast } from '../context/ToastContext';
import { useContasBancarias } from '../hooks/useContasBancarias';
import { useExtratos } from '../hooks/useExtratos';
import { useColumnVisibility, ALL_COLUMNS } from '../components/estratti/ColumnSelector';
import ContaBancariaModal from '../components/estratti/ContaBancariaModal';
import MovimentoModal from '../components/estratti/MovimentoModal';
import ImportEstratoModal from '../components/estratti/ImportEstratoModal';
import FuzzyAuditModal from '../components/estratti/FuzzyAuditModal';
import SkippedDupsModal from '../components/estratti/SkippedDupsModal';
import ColumnSelector from '../components/estratti/ColumnSelector';
import { usePagination } from '../hooks/usePagination';
import PaginationControls from '../components/common/PaginationControls';
import { fmtCurrency } from '../utils/formatters';
import { fmtDate } from '../utils/dateUtils';
import { exportToExcel, exportToPdf } from '../utils/exportUtils';
import './EstratiPage.css';

export default function EstratiPage() {
  const { empresaId } = useParams();
  const { empresas }  = useEmpresa();
  const toast         = useToast();
  const empresa       = empresas.find(e => e.id === empresaId);

  // Bank accounts
  const { contas, addConta, updateConta, deleteConta } = useContasBancarias(empresaId);

  // Selected bank tab
  const [selectedContaId, setSelectedContaId] = useState(null);
  const contaAtiva = contas.find(c => c.id === selectedContaId) || contas[0] || null;

  // Filters
  const [search,      setSearch]     = useState('');
  const [filterTipo,  setFilterTipo] = useState('');
  const [filterConc,  setFilterConc] = useState('');
  const [dataDe,      setDataDe]     = useState('');
  const [dataAte,     setDataAte]    = useState('');
  const [sortField,   setSortField]  = useState('data');
  const [sortDir,     setSortDir]    = useState('desc');

  // Month filter
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  const [filterMonth, setFilterMonth] = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) {
      const d = new Date();
      saved = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return saved;
  });

  const handleSetFilterMonth = (val) => {
    setFilterMonth(val);
    localStorage.setItem(FILTER_MONTH_KEY, val);
  };

  // UI State Modals
  const [showBancoModal, setShowBancoModal] = useState(false);
  const [editingBanco, setEditingBanco] = useState(null);
  const [showImport,     setShowImport]     = useState(false);
  const [skippedRows,    setSkippedRows]    = useState([]);
  const [showAudit,      setShowAudit]      = useState(false);
  const [editingMovimento, setEditingMovimento] = useState(null);
  const [showColSel,     setShowColSel]     = useState(false);

  // Column visibility
  const { visible, toggle: toggleCol, reset: resetCols } = useColumnVisibility(empresaId);

  // Movements for selected bank (passing dates to bounding query)
  const { extratos, loading, kpis, importExtratos, forceInsertExtratos, checkFuzzyDups, findInternalDups, updateExtrato, deleteExtrato, deleteLote } =
    useExtratos(empresaId, contaAtiva?.id || null, dataDe || null, dataAte || null);

  // Re-calculate KPIs natively considering the selected Month filter
  const localKpis = useMemo(() => {
    let list = [...extratos];
    if (filterMonth) list = list.filter(e => (e.data || '').startsWith(filterMonth));
    return {
      saldoAtual: kpis.saldoAtual,
      totalCreditos: list.filter(e => Number(e.valor) > 0).reduce((s, e) => s + Number(e.valor), 0),
      totalDebitos: list.filter(e => Number(e.valor) < 0).reduce((s, e) => s + Math.abs(Number(e.valor)), 0),
      totalMovimentos: list.length,
      naoConcilidados: list.filter(e => !e.conciliado).length,
    };
  }, [extratos, filterMonth, kpis.saldoAtual]);

  // Filtered + sorted data
  const filtered = useMemo(() => {
    let list = [...extratos];
    if (filterMonth) {
      list = list.filter(e => (e.data || '').startsWith(filterMonth));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.descricao?.toLowerCase().includes(q) ||
        e.historico?.toLowerCase().includes(q) ||
        e.documento?.toLowerCase().includes(q) ||
        e.categoria?.toLowerCase().includes(q) ||
        String(e.valor).includes(q)
      );
    }
    if (filterTipo) list = list.filter(e => e.tipo === filterTipo);
    if (filterConc === 'conciliado') list = list.filter(e => e.conciliado);
    if (filterConc === 'pendente')   list = list.filter(e => !e.conciliado);

    list.sort((a, b) => {
      let vA = a[sortField], vB = b[sortField];
      if (sortField === 'valor') { vA = Number(vA); vB = Number(vB); }
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [extratos, search, filterTipo, filterConc, filterMonth, sortField, sortDir]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const { currentRows, currentPage, totalPages, totalItems, goToPage, nextPage, prevPage } = usePagination(filtered, 50);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };
  const SortIcon = ({ field }) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  // Handlers
  const handleAddBanco = async (data) => {
    const nova = await addConta(data);
    toast.success(`Banco "${data.nome}" adicionado!`);
    setShowBancoModal(false);
    setSelectedContaId(nova.id);
  };

  const handleEditBanco = async (data) => {
    await updateConta({ ...editingBanco, ...data });
    toast.success('Conta bancária atualizada!');
    setShowBancoModal(false);
    setEditingBanco(null);
  };

  const handleDeleteBanco = async (conta) => {
    if (!window.confirm(`Deletar "${conta.nome}"? Os extratos associados também serão removidos.`)) return;
    await deleteConta(conta.id);
    if (selectedContaId === conta.id) setSelectedContaId(null);
    toast.info(`Banco "${conta.nome}" removido.`);
  };

  const handleImport = async (rows) => {
    if (!contaAtiva) return;
    const { imported, skipped, skippedRows: dupes } = await importExtratos(rows, contaAtiva.id);
    toast.success(`✅ ${imported} movimentos importados.${skipped > 0 ? ` ⚡ ${skipped} duplicados ignorados.` : ''}`);
    setShowImport(false);
    if (dupes && dupes.length > 0) setSkippedRows(dupes);
  };

  const handleForceImport = async (rows) => {
    if (!contaAtiva) return;
    await forceInsertExtratos(rows, contaAtiva.id);
    toast.success(`➕ ${rows.length} movimento(s) importado(s) manualmente (override duplicata).`);
  };

  const handleEditMovimento = async (updates) => {
    await updateExtrato(editingMovimento.id, updates);
    toast.success('Movimento atualizado!');
    setEditingMovimento(null);
  };

  const handleDeleteMovimento = async (id) => {
    if (!window.confirm('Deletar este movimento do extrato?')) return;
    await deleteExtrato(id);
    toast.info('Movimento removido.');
  };

  const handleDeleteLote = async (lote) => {
    if (!lote) { handleDeleteMovimento; return; }
    if (!window.confirm('Remover TODOS os movimentos deste lote de importação?')) return;
    const n = await deleteLote(lote);
    toast.info(`${n} movimentos do lote removidos.`);
  };

  const handleExportExcel = () => {
    const data = filtered.map(m => ({
      'Data': m.data?.split('-').reverse().join('/'),
      'Lote': m.loteImportacao || '',
      'Banco': m.banco_nome || '',
      'Identificador': m.identificador || '',
      'Descrição': m.descricao || '',
      'Valor (R$)': m.valor,
      'Tipo': m.valor < 0 ? 'Débito' : 'Crédito',
      'Conciliado': m.reconciled ? 'Sim' : 'Não'
    }));
    exportToExcel(data, `extratos_${contaAtiva ? contaAtiva.nome.replace(/\s+/g,'_').toLowerCase() : 'todos'}`);
  };

  const handleExportPdf = () => {
    const cols = [
      { label: 'Data', getValue: m => m.data?.split('-').reverse().join('/') },
      { label: 'Identificador', getValue: m => m.identificador || m.loteImportacao || '' },
      { label: 'Banco', getValue: m => m.banco_nome || '' },
      { label: 'Descrição', getValue: m => m.descricao || '' },
      { label: 'Valor', getValue: m => fmtCurrency(m.valor) },
      { label: 'Tipo', getValue: m => m.valor < 0 ? 'Débito' : 'Crédito' },
      { label: 'Conc.', getValue: m => m.reconciled ? 'Sim' : 'Não' }
    ];
    exportToPdf(`Extratos Bancários - ${contaAtiva?.nome || 'Geral'}`, cols, filtered);
  };

  // Visible columns
  const visibleCols = ALL_COLUMNS.filter(c => visible[c.key]);

  return (
    <div className="estratti-layout">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 24px 8px 24px' }}>
        <div>
          <button onClick={() => window.history.back()} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content', marginBottom: 12 }}>← Voltar</button>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            🏦 Import Hub & Extratos
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: 13 }}>
            Painel principal de injeção e manipulação de extratos bancários brutos no sistema.
          </p>
        </div>
        
        {contaAtiva && (
          <button 
            className="btn" 
            id="btn-import-extrato-header" 
            onClick={() => setShowImport(true)}
            style={{ 
              background: 'var(--color-orange, #f97316)',
              color: '#fff',
              border: 'none',
              padding: '10px 24px', 
              fontSize: 15, 
              fontWeight: 700, 
              display: 'flex', 
              gap: 8, 
              alignItems: 'center', 
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)',
              marginTop: 32
            }}
          >
            📥 Importar Extrato
          </button>
        )}
      </div>

      {/* ── Bank tabs bar ── */}
      <div className="estratti-bank-bar" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {contas.map(c => (
          <button
            key={c.id}
            className={`estratti-bank-tab ${(contaAtiva?.id === c.id) ? 'active' : ''}`}
            style={contaAtiva?.id === c.id ? { background: c.cor, borderColor: c.cor } : {}}
            onClick={() => setSelectedContaId(c.id)}
            id={`tab-banco-${c.id}`}
          >
            <span className="estratti-bank-dot" style={{ background: c.cor }} />
            {c.nome}
            {c.conta && <span style={{ opacity: 0.7, fontSize: 11 }}>· {c.conta}</span>}
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: '0 0 0 4px' }}
              onClick={e => { e.stopPropagation(); setEditingBanco(c); setShowBancoModal(true); }}
              title="Editar"
            >✏️</button>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.6, padding: 0, color: 'var(--color-red)' }}
              onClick={e => { e.stopPropagation(); handleDeleteBanco(c); }}
              title="Deletar"
            >×</button>
          </button>
        ))}

        <button
          className="btn btn-ghost btn-sm"
          id="btn-add-banco"
          style={{ whiteSpace: 'nowrap', fontSize: 12, flexShrink: 0 }}
          onClick={() => { setEditingBanco(null); setShowBancoModal(true); }}
        >+ Banco</button>

        {/* Date / Month filters — inline su destra per risparmiare spazio */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Mês:</span>
          <input
            type="month"
            className="form-input"
            style={{ width: 130, fontSize: 12, fontWeight: 700, padding: '4px 8px' }}
            value={filterMonth}
            onChange={e => handleSetFilterMonth(e.target.value)}
          />
          <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>De:</span>
          <input
            type="date" className="form-input"
            style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
            value={dataDe}
            onChange={e => { setDataDe(e.target.value); if (filterMonth) handleSetFilterMonth(''); }}
            disabled={!contaAtiva}
          />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>até:</span>
          <input
            type="date" className="form-input"
            style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
            value={dataAte}
            onChange={e => { setDataAte(e.target.value); if (filterMonth) handleSetFilterMonth(''); }}
            disabled={!contaAtiva}
          />
          {(dataDe || dataAte || filterMonth) && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--color-yellow)', padding: '3px 8px', flexShrink: 0 }}
              onClick={() => { setDataDe(''); setDataAte(''); handleSetFilterMonth(''); }}
            >✕</button>
          )}
        </div>
      </div>

      {/* ── KPI Strip ── */}
      {contaAtiva && (
        <div className="estratti-kpi-strip">
          <div className="estratti-kpi-item">
            <span className="estratti-kpi-label">Saldo Atual</span>
            <span className="estratti-kpi-value" style={{ color: 'var(--color-accent)' }}>
              {localKpis.saldoAtual != null ? fmtCurrency(localKpis.saldoAtual) : '—'}
            </span>
          </div>
          <div className="estratti-kpi-item">
            <span className="estratti-kpi-label">Total Créditos</span>
            <span className="estratti-kpi-value" style={{ color: 'var(--color-green)' }}>
              {fmtCurrency(localKpis.totalCreditos)}
            </span>
          </div>
          <div className="estratti-kpi-item">
            <span className="estratti-kpi-label">Total Débitos</span>
            <span className="estratti-kpi-value" style={{ color: 'var(--color-red)' }}>
              {fmtCurrency(localKpis.totalDebitos)}
            </span>
          </div>
          <div className="estratti-kpi-item">
            <span className="estratti-kpi-label">Movimentos</span>
            <span className="estratti-kpi-value" style={{ color: 'var(--color-text-primary)' }}>
              {localKpis.totalMovimentos}
            </span>
          </div>
          <div className="estratti-kpi-item">
            <span className="estratti-kpi-label">Não Conc.</span>
            <span className="estratti-kpi-value" style={{ color: 'var(--color-yellow)' }}>
              {localKpis.naoConcilidados}
            </span>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="estratti-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        
        {/* ROW 1: Search, Selects, and Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%', alignItems: 'center' }}>
          <div className="search-wrap" style={{ flex: 1, minWidth: 200 }}>
            <span className="search-icon">🔍</span>
            <input
              className="form-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar movimentos..."
              disabled={!contaAtiva}
            />
          </div>

          <select className="form-input" style={{ width: 140 }} value={filterTipo} onChange={e => setFilterTipo(e.target.value)} disabled={!contaAtiva}>
            <option value="">Todos os tipos</option>
            <option value="crédito">Crédito</option>
            <option value="débito">Débito</option>
          </select>

          <select className="form-input" style={{ width: 150 }} value={filterConc} onChange={e => setFilterConc(e.target.value)} disabled={!contaAtiva}>
            <option value="">Tudo</option>
            <option value="pendente">Não conciliado</option>
            <option value="conciliado">Conciliado</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={handleExportExcel} title="Exportar para Excel">
              📊 Excel
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleExportPdf} title="Exportar para PDF">
              🖨️ PDF
            </button>
            <div style={{ width: 1, background: 'var(--color-border)', margin: '0 4px' }} />
            <button className="btn btn-ghost btn-sm" onClick={() => setShowColSel(true)} title="Configurar colunas" disabled={!contaAtiva}>
              ⚙️ Colunas
            </button>
            {contaAtiva && (
              <button
                className="btn btn-ghost btn-sm"
                id="btn-fuzzy-audit"
                onClick={() => setShowAudit(true)}
                title="Verificar duplicatas nos movimentos já carregados"
                style={{ color: 'var(--color-yellow)' }}
              >
                🔍 Auditar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Empty state: no banks ── */}
      {contas.length === 0 && (
        <div className="estratti-empty">
          <div style={{ fontSize: 48 }}>🏦</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Nenhum banco cadastrado</div>
          <p style={{ maxWidth: 320, lineHeight: 1.6, fontSize: 13 }}>
            Adicione uma conta bancária para começar a importar e gerenciar seus extratos.
          </p>
          <button className="btn btn-primary" onClick={() => setShowBancoModal(true)}>+ Adicionar Banco</button>
        </div>
      )}

      {/* ── Empty state: bank selected but no movements ── */}
      {contaAtiva && extratos.length === 0 && !loading && (
        <div className="estratti-empty">
          <div style={{ fontSize: 48 }}>📄</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Nenhum extrato em <span style={{ color: contaAtiva.cor }}>{contaAtiva.nome}</span>
          </div>
          <p style={{ maxWidth: 320, lineHeight: 1.6, fontSize: 13 }}>
            Importe um arquivo OFX ou Excel do seu banco para visualizar os movimentos.
          </p>
          <button className="btn btn-primary" onClick={() => setShowImport(true)}>📥 Importar Extrato</button>
        </div>
      )}

      {/* ── Table ── */}
      {contaAtiva && filtered.length > 0 && (
        <div className="estratti-table-wrap">
          <table className="data-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                {visibleCols.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{ cursor: 'pointer', userSelect: 'none', textAlign: ['valor','saldo'].includes(col.key) ? 'right' : 'left' }}
                  >
                    {col.label}<SortIcon field={col.key} />
                  </th>
                ))}
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map(mov => {
                const isCredito = mov.tipo === 'crédito' || Number(mov.valor) >= 0;
                return (
                  <tr key={mov.id} style={{ opacity: mov.conciliado ? 0.65 : 1 }}>
                    {visible.data && (
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        {fmtDate(mov.data)}
                      </td>
                    )}
                    {visible.descricao && (
                      <td style={{ maxWidth: 240 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mov.descricao}>
                          {mov.descricao || '—'}
                        </div>
                      </td>
                    )}
                    {visible.tipo && (
                      <td>
                        <span className={`badge ${isCredito ? 'badge-green' : 'badge-red'}`}>
                          {isCredito ? '↑ Créd' : '↓ Déb'}
                        </span>
                      </td>
                    )}
                    {visible.moduloDestino && (
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className={`badge ${mov.moduloDestino === 'receitas' ? 'badge-purple' : 'badge-orange'}`} style={{ minWidth: 65, textAlign: 'center' }}>
                            {mov.moduloDestino === 'receitas' ? 'Receitas' : 'Despesas'}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '0 4px', fontSize: 13, height: 20 }}
                            title={`Mover para ${mov.moduloDestino === 'receitas' ? 'Despesas' : 'Receitas'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateExtrato(mov.id, { moduloDestino: mov.moduloDestino === 'receitas' ? 'despesas' : 'receitas' });
                            }}
                          >🔄</button>
                        </div>
                      </td>
                    )}
                    {visible.valor && (
                      <td style={{ textAlign: 'right' }}>
                        <span className={isCredito ? 'estratti-valor-credito' : 'estratti-valor-debito'}>
                          {isCredito ? '+' : ''}{fmtCurrency(mov.valor)}
                        </span>
                      </td>
                    )}
                    {visible.saldo && (
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        {mov.saldo != null ? fmtCurrency(mov.saldo) : '—'}
                      </td>
                    )}
                    {visible.categoria && (
                      <td>
                        {mov.categoria
                          ? <span className="badge badge-purple">{mov.categoria}</span>
                          : <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>—</span>}
                      </td>
                    )}
                    {visible.documento && (
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                        {mov.documento || '—'}
                      </td>
                    )}
                    {visible.historico && (
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {mov.historico || '—'}
                      </td>
                    )}
                    {visible.conciliado && (
                      <td>
                        {mov.conciliado
                          ? <span className="badge badge-green">✓ Conc.</span>
                          : <span className="badge badge-yellow">Pend.</span>}
                      </td>
                    )}
                    {visible.fonte && (
                      <td>
                        <span className="badge" style={{ background: 'var(--color-bg-active)', color: 'var(--color-text-secondary)', fontSize: 10 }}>
                          {mov.fonte?.toUpperCase()}
                        </span>
                      </td>
                    )}
                    {visible.lote && (
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                        {mov.lote ? mov.lote.slice(0, 8) + '…' : '—'}
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 12, padding: '2px 8px' }}
                          onClick={() => setEditingMovimento(mov)}
                          title="Editar"
                        >✏️</button>
                        {mov.lote && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 12, padding: '2px 8px', color: 'var(--color-yellow)' }}
                            onClick={() => handleDeleteLote(mov.lote)}
                            title="Deletar lote inteiro"
                          >🗑️ Lote</button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: 12, padding: '2px 8px', color: 'var(--color-red)' }}
                          onClick={() => handleDeleteMovimento(mov.id)}
                          title="Deletar este movimento"
                        >×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: '0 16px', background: 'var(--color-bg)' }}>
        <PaginationControls
          currentPage={currentPage} totalPages={totalPages} totalItems={totalItems}
          nextPage={nextPage} prevPage={prevPage} goToPage={goToPage}
        />
      </div>

      {/* ── Modals ── */}
      {showBancoModal && (
        <ContaBancariaModal
          conta={editingBanco}
          onSave={editingBanco ? handleEditBanco : handleAddBanco}
          onClose={() => { setShowBancoModal(false); setEditingBanco(null); }}
        />
      )}

      {showImport && contaAtiva && (
        <ImportEstratoModal
          contaBancaria={contaAtiva}
          onImport={handleImport}
          checkFuzzyDups={(rows) => checkFuzzyDups(rows, contaAtiva.id)}
          onClose={() => setShowImport(false)}
        />
      )}

      {showAudit && contaAtiva && (
        <FuzzyAuditModal
          contaBancaria={contaAtiva}
          findInternalDups={findInternalDups}
          onDelete={deleteExtrato}
          onClose={() => setShowAudit(false)}
        />
      )}

      {skippedRows.length > 0 && (
        <SkippedDupsModal
          skippedRows={skippedRows}
          contaBancaria={contaAtiva}
          onForceImport={handleForceImport}
          onClose={() => setSkippedRows([])}
        />
      )}

      {editingMovimento && (
        <MovimentoModal
          movimento={editingMovimento}
          onSave={handleEditMovimento}
          onClose={() => setEditingMovimento(null)}
        />
      )}

      {showColSel && (
        <ColumnSelector
          visible={visible}
          onToggle={toggleCol}
          onReset={resetCols}
          onClose={() => setShowColSel(false)}
        />
      )}
    </div>
  );
}
