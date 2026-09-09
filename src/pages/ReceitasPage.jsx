/**
 * ReceitasPage.jsx — Contas a Receber com filtros data, integração extrato bancário e PT-BR
 */
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useContas } from '../hooks/useContas';
import { useToast } from '../context/ToastContext';
import { useFilterPrefs } from '../hooks/useFilterPrefs';
import { useContasBancarias } from '../hooks/useContasBancarias';
import { useExtratos } from '../hooks/useExtratos';
import KPICard from '../components/shared/KPICard';
import ContaModal from '../components/shared/ContaModal';
import ImportModal from '../components/shared/ImportModal';
import { fmtCurrency } from '../utils/formatters';
import { isOverdue, daysUntil, fmtDate } from '../utils/dateUtils';
import { exportToExcel, exportToPdf } from '../utils/exportUtils';
import './ContasPage.css';

const STATUS_RECEITAS = ['Pendente', 'Recebido Parcial', 'Recebido', 'Conciliado', 'Cancelado'];

const FILTER_DEFAULTS = {
  search: '',
  status: '',
  dataInicio: '',
  dataFim: '',
  // bank panel
  showExtrato: false,
  contaBancariaId: '',
  tipoExtrato: '', // '' = show all entries by default
};

export default function ReceitasPage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const { contas, loading, kpis, addConta, updateConta, deleteConta, importContas } = useContas(empresaId, 'receitas');
  const toast = useToast();

  // Filtri persistiti
  const { prefs, setFilter, resetFilters } = useFilterPrefs(empresaId, 'receitas', FILTER_DEFAULTS);

  // Estratti conto
  const { contas: bancos } = useContasBancarias(empresaId);
  const { extratos } = useExtratos(empresaId, prefs.contaBancariaId || null);

  const [showModal,  setShowModal]  = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [sortCol,    setSortCol]    = useState('vencimento');
  const [sortDir,    setSortDir]    = useState('asc');

  // --- Receitas filtrate ---
  const rows = useMemo(() => {
    let r = [...contas];
    if (prefs.search) {
      const q = prefs.search.toLowerCase();
      r = r.filter(c =>
        c.descricao?.toLowerCase().includes(q) ||
        c.parceiro?.toLowerCase().includes(q) ||
        c.valor?.toString().includes(q)
      );
    }
    if (prefs.status)     r = r.filter(c => c.status === prefs.status);
    if (prefs.dataInicio) r = r.filter(c => c.vencimento >= prefs.dataInicio);
    if (prefs.dataFim)    r = r.filter(c => c.vencimento <= prefs.dataFim);

    r.sort((a, b) => {
      let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
      if (sortCol === 'valor') { av = Number(av); bv = Number(bv); }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return r;
  }, [contas, prefs, sortCol, sortDir]);

  // --- Extrato filtrato ---
  const movBancarios = useMemo(() => {
    if (!prefs.showExtrato || !prefs.contaBancariaId) return [];
    let mov = [...extratos];
    if (prefs.tipoExtrato) mov = mov.filter(e => e.tipo === prefs.tipoExtrato);
    if (prefs.dataInicio)  mov = mov.filter(e => e.data >= prefs.dataInicio);
    if (prefs.dataFim)     mov = mov.filter(e => e.data <= prefs.dataFim);
    return mov;
  }, [extratos, prefs]);

  const bancaAtiva = bancos.find(b => b.id === prefs.contaBancariaId);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const handleSave = async (data) => {
    if (editing) { await updateConta(editing.id, data); toast.success('Receita atualizada!'); }
    else          { await addConta(data);                 toast.success('Receita adicionada!'); }
    setShowModal(false);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar esta receita?')) return;
    await deleteConta(id);
    toast.info('Receita removida.');
  };

  const handleImport = async (r) => {
    const n = await importContas(r);
    toast.success(`${n} receitas importadas com sucesso!`);
    setShowImport(false);
  };

  const handleExportExcel = () => {
    const data = rows.map(c => ({
      'Vencimento': fmtDate(c.vencimento),
      'Descrição': c.descricao || '',
      'Cliente': c.parceiro || '',
      'Valor (R$)': c.valor,
      'Status': c.status || ''
    }));
    exportToExcel(data, 'receitas', 'Receitas');
  };

  const handleExportPdf = () => {
    const cols = [
      { label: 'Vencimento', getValue: c => fmtDate(c.vencimento) },
      { label: 'Descrição', getValue: c => c.descricao || '—' },
      { label: 'Cliente', getValue: c => c.parceiro || '—' },
      { label: 'Valor', getValue: c => fmtCurrency(c.valor) },
      { label: 'Status', getValue: c => c.status || '—' }
    ];
    exportToPdf('Contas a Receber', cols, rows);
  };

  const statusBadge = (s) => ({
    'Pendente': 'badge-yellow', 'Recebido Parcial': 'badge-blue',
    'Recebido': 'badge-green',  'Conciliado': 'badge-accent', 'Cancelado': 'badge-red',
  }[s] || 'badge-accent');

  const hasFilters = prefs.dataInicio || prefs.dataFim || prefs.status || prefs.search;

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div className="contas-page">
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content' }}>← Voltar</button>
      </div>
      {/* KPIs */}
      <div className="contas-kpis">
        <KPICard label="Total a Receber"   value={fmtCurrency(kpis.total)}      icon="💰" color="var(--color-accent)"  sub={`${kpis.count} lançamentos`} />
        <KPICard label="Pendentes"          value={fmtCurrency(kpis.pendente)}   icon="⏳" color="var(--color-yellow)"  sub={`${kpis.countPendente} contas`} />
        <KPICard label="Vencidas"           value={fmtCurrency(kpis.vencidas)}   icon="🔴" color="var(--color-red)"    sub={`${kpis.countVencidas} vencidas`} />
        <KPICard label="Conciliadas"        value={fmtCurrency(kpis.conciliado)} icon="✅" color="var(--color-green)"  sub="Total conciliado" />
      </div>

      {/* Barra de filtros */}
      <div className="contas-toolbar card">
        {/* Linha 1: filtros à esquerda | ações à direita */}
        <div className="contas-toolbar-row" style={{ justifyContent: 'space-between' }}>
          {/* Lado esquerdo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <input
              className="form-input"
              style={{ flex: 1, minWidth: 140, maxWidth: 340 }}
              placeholder="🔍 Pesquisar descrição, cliente, valor..."
              value={prefs.search}
              onChange={e => setFilter('search', e.target.value)}
              id="input-search-receitas"
            />
            <select className="form-input" style={{ width: 160, flexShrink: 0 }} value={prefs.status} onChange={e => setFilter('status', e.target.value)} id="select-status-receitas">
              <option value="">Todos os status</option>
              {STATUS_RECEITAS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {hasFilters && (
              <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ color: 'var(--color-yellow)', flexShrink: 0 }}>
                ✕ Limpar
              </button>
            )}
          </div>

          {/* Lado direito — sempre visível */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
            <button
              id="btn-toggle-extrato"
              className="btn btn-ghost btn-sm"
              style={{
                color: prefs.showExtrato ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                background: prefs.showExtrato ? 'var(--color-accent-dim)' : undefined,
                border: prefs.showExtrato ? '1px solid var(--color-accent)' : '1px solid transparent',
                fontWeight: prefs.showExtrato ? 700 : 400,
              }}
              onClick={() => setFilter('showExtrato', !prefs.showExtrato)}
              title="Mostrar/ocultar movimentos bancários"
            >
              🏦 Extrato
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleExportExcel} title="Exportar Excel">📊 Excel</button>
            <button className="btn btn-ghost btn-sm" onClick={handleExportPdf} title="Exportar PDF">🖨️ PDF</button>
            <button className="btn btn-secondary btn-sm" id="btn-import-receitas" onClick={() => setShowImport(true)}>📥 Importar</button>
            <button className="btn btn-primary btn-sm" id="btn-add-receita" onClick={() => { setEditing(null); setShowModal(true); }}>+ Lançamento</button>
          </div>
        </div>

        {/* Linha 2: filtros data + banco */}
        <div className="contas-toolbar-row" style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Vencimento de:</label>
          <input type="date" className="form-input" style={{ width: 145 }} value={prefs.dataInicio} onChange={e => setFilter('dataInicio', e.target.value)} id="input-data-inicio" />
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>até:</label>
          <input type="date" className="form-input" style={{ width: 145 }} value={prefs.dataFim} onChange={e => setFilter('dataFim', e.target.value)} id="input-data-fim" />

          {/* Filtro Extrato Banco (visível apenas quando showExtrato=true) */}
          {prefs.showExtrato && (
            <>
              <div style={{ width: 1, background: 'var(--color-border)', margin: '0 8px', alignSelf: 'stretch' }} />
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>🏦 Banco:</span>
              <select className="form-input" style={{ width: 175 }} value={prefs.contaBancariaId} onChange={e => setFilter('contaBancariaId', e.target.value)} id="select-banco-extrato">
                <option value="">— Selecionar banco —</option>
                {bancos.map(b => <option key={b.id} value={b.id}>{b.nome}{b.conta ? ` · ${b.conta}` : ''}</option>)}
              </select>
              <select className="form-input" style={{ width: 130 }} value={prefs.tipoExtrato} onChange={e => setFilter('tipoExtrato', e.target.value)} id="select-tipo-extrato">
                <option value="">Todas</option>
                <option value="crédito">Só entradas</option>
                <option value="débito">Só saídas</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* Tabela Receitas */}
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
                <th onClick={() => handleSort('vencimento')} style={{ cursor: 'pointer' }}>Vencimento {sortCol==='vencimento' ? (sortDir==='asc'?'↑':'↓') : ''}</th>
                <th onClick={() => handleSort('descricao')}  style={{ cursor: 'pointer' }}>Descrição</th>
                <th onClick={() => handleSort('parceiro')}   style={{ cursor: 'pointer' }}>Cliente</th>
                <th onClick={() => handleSort('valor')}      style={{ cursor: 'pointer', textAlign: 'right' }}>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => {
                const overdue = isOverdue(c.vencimento) && !['Recebido','Conciliado','Cancelado'].includes(c.status);
                const days = daysUntil(c.vencimento);
                return (
                  <tr key={c.id}>
                    <td>
                      <span style={{ color: overdue ? 'var(--color-red)' : 'inherit' }}>
                        {fmtDate(c.vencimento)}
                        {overdue && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--color-red)' }}>({Math.abs(days)}d vencido)</span>}
                      </span>
                    </td>
                    <td>{c.descricao || <span className="text-muted">—</span>}</td>
                    <td>{c.parceiro  || <span className="text-muted">—</span>}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-green)', fontWeight: 600 }}>{fmtCurrency(c.valor)}</td>
                    <td><span className={`badge ${statusBadge(c.status)}`}>{c.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(c); setShowModal(true); }} title="Editar">✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c.id)} title="Deletar" style={{ color: 'var(--color-red)' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                    Nenhuma receita encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      {/* Painel Extrato Bancário */}
      {prefs.showExtrato && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              🏦 Movimentos Bancários
              {bancaAtiva && (
                <span style={{ fontWeight: 400, color: bancaAtiva.cor, marginLeft: 8 }}>
                  {bancaAtiva.nome}
                  {bancaAtiva.conta ? ` · ${bancaAtiva.conta}` : ''}
                </span>
              )}
            </span>
            <span className="badge badge-green" style={{ fontSize: 11 }}>
              {movBancarios.filter(e=>e.tipo==='crédito').length} entradas
            </span>
            <span className="badge badge-red" style={{ fontSize: 11 }}>
              {movBancarios.filter(e=>e.tipo==='débito').length} saídas
            </span>
            {prefs.contaBancariaId && extratos.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 4 }}>
                ({extratos.length} total no banco{movBancarios.length < extratos.length ? `, ${extratos.length - movBancarios.length} ocultos por filtro` : ''})
              </span>
            )}
          </div>

          {!prefs.contaBancariaId ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div style={{ fontSize: 28 }}>🏦</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Selecione um banco acima para ver os movimentos</div>
            </div>
          ) : movBancarios.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 8 }}>
                Nenhum movimento encontrado
              </div>
              {extratos.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-yellow)', marginBottom: 10 }}>
                  ⚠️ {extratos.length} movimentos no banco, mas os filtros estão ocultando todos.
                  {(prefs.dataInicio || prefs.dataFim) && (
                    <span> Filtro de data ativo: {prefs.dataInicio || '…'} → {prefs.dataFim || '…'}</span>
                  )}
                  {prefs.tipoExtrato && ` · Tipo: ${prefs.tipoExtrato}`}
                </div>
              )}
              {(prefs.dataInicio || prefs.dataFim || prefs.tipoExtrato) && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setFilter('dataInicio', '');
                    setFilter('dataFim', '');
                    setFilter('tipoExtrato', '');
                  }}
                >
                  🗑️ Limpar filtros de data e tipo
                </button>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                    <th>Conciliado</th>
                  </tr>
                </thead>
                <tbody>
                  {movBancarios.map(m => (
                    <tr key={m.id} style={{ opacity: m.conciliado ? 0.6 : 1 }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{fmtDate(m.data)}</td>
                      <td style={{ maxWidth: 220 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descricao}>
                          {m.descricao || '—'}
                        </span>
                      </td>
                      <td><span className={`badge ${m.tipo === 'crédito' ? 'badge-green' : 'badge-red'}`}>{m.tipo}</span></td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: m.tipo === 'crédito' ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {m.tipo === 'crédito' ? '+' : ''}{fmtCurrency(m.valor)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {m.saldo != null ? fmtCurrency(m.saldo) : '—'}
                      </td>
                      <td>{m.conciliado ? <span className="badge badge-green">✓</span> : <span className="badge badge-yellow">Pend.</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <ContaModal
          conta={editing}
          module="receitas"
          statusOptions={STATUS_RECEITAS}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
      {showImport && (
        <ImportModal module="receitas" onImport={handleImport} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
