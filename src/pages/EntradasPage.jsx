/**
 * EntradasPage.jsx — Seletor de Movimentos Bancários (Entradas) para Reconciliação
 */
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useFilterPrefs } from '../hooks/useFilterPrefs';
import { useContasBancarias } from '../hooks/useContasBancarias';
import { useExtratos } from '../hooks/useExtratos';
import { fmtCurrency } from '../utils/formatters';
import { fmtDate } from '../utils/dateUtils';
import './ContasPage.css';

const FILTER_DEFAULTS = {
  contaBancariaId: '',
  tipoExtrato: 'crédito',
  search: '',
};

export default function EntradasPage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { prefs, setFilter, resetFilters } = useFilterPrefs(empresaId, 'entradas_extratos', FILTER_DEFAULTS);
  const { contas: bancos } = useContasBancarias(empresaId);
  const { extratos, bulkUpdateExtratos } = useExtratos(empresaId, prefs.contaBancariaId || null);

  const [selectedExtratos, setSelectedExtratos] = useState(new Set());

  // Global month filter
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

  // --- Extrato filtrato ---
  const movBancarios = useMemo(() => {
    if (!prefs.contaBancariaId) return [];
    let mov = [...extratos];
    if (prefs.tipoExtrato) mov = mov.filter(e => e.tipo === prefs.tipoExtrato);
    if (filterMonth)       mov = mov.filter(e => (e.data || '').startsWith(filterMonth));
    if (prefs.search) {
      const q = prefs.search.toLowerCase();
      mov = mov.filter(e => (e.descricao || '').toLowerCase().includes(q));
    }
    
    // Sort by date desc
    mov.sort((a,b) => (b.data || '').localeCompare(a.data || ''));

    return mov;
  }, [extratos, prefs, filterMonth]);

  const bancaAtiva = bancos.find(b => b.id === prefs.contaBancariaId);

  const handleToggleExtrato = (id) => {
    const next = new Set(selectedExtratos);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedExtratos(next);
  };

  const handleToggleAllExtratos = (e) => {
    if (e.target.checked) setSelectedExtratos(new Set(movBancarios.filter(m => !m.reconciliarDoc && !m.conciliado && !m.conciliadoOut).map(m => m.id)));
    else setSelectedExtratos(new Set());
  };

  const handleSendToReconciliation = async () => {
    if (selectedExtratos.size === 0) {
      toast.warning('Selecione pelo menos um movimento bancário na lista abaixo para enviar à reconciliação.');
      return;
    }
    try {
      await bulkUpdateExtratos(Array.from(selectedExtratos), { reconciliarDoc: true });
      toast.success(`${selectedExtratos.size} movimenti inviati in coda di riconciliazione!`);
      setSelectedExtratos(new Set());
    } catch (e) { toast.error("Errore: " + e.message); }
  };
  
  const handleRemoveFromReconciliation = async () => {
    if (selectedExtratos.size === 0) return;
    try {
      await bulkUpdateExtratos(Array.from(selectedExtratos), { reconciliarDoc: false });
      toast.info(`${selectedExtratos.size} movimenti rimossi dalla coda.`);
      setSelectedExtratos(new Set());
    } catch (e) { toast.error("Errore: " + e.message); }
  };

  const hasFilters = prefs.tipoExtrato !== 'crédito' || prefs.search;

  return (
    <div className="contas-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 24px 8px 24px' }}>
        <div>
          <button onClick={() => navigate(`/empresa/${empresaId}/receitas`)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content', marginBottom: 12 }}>← Voltar</button>
          
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            📥 Triagem de Entradas
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: 13 }}>
            Selecione as movimentações bancárias de entrada (créditos) e envie-as para a esteira de reconciliação documental.
          </p>
        </div>

        <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            className="btn" 
            onClick={handleSendToReconciliation}
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
            📥 Enviar p/ Reconciliação {selectedExtratos.size > 0 ? `(${selectedExtratos.size})` : ''}
          </button>
          
          {selectedExtratos.size > 0 && (
            <button 
              className="btn btn-ghost" 
              onClick={handleRemoveFromReconciliation}
              style={{ color: 'var(--color-red)' }}
              title="Remover da fila de reconciliação"
            >
              ❌ Remover
            </button>
          )}
        </div>
      </div>

      <div className="contas-toolbar card" style={{ marginBottom: 24 }}>
        <div className="contas-toolbar-row">
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 200, maxWidth: 320 }}
            placeholder="🔍 Pesquisar descrição..."
            value={prefs.search}
            onChange={e => setFilter('search', e.target.value)}
          />
          <label style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>🏦 Banco:</label>
          <select className="form-input" style={{ width: 220 }} value={prefs.contaBancariaId} onChange={e => setFilter('contaBancariaId', e.target.value)}>
            <option value="">— Selecionar banco —</option>
            {bancos.map(b => <option key={b.id} value={b.id}>{b.nome}{b.conta ? ` · ${b.conta}` : ''}</option>)}
          </select>

          <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Mês:</label>
          <input 
            type="month" 
            className="form-input" 
            style={{ width: 145, fontWeight: 700 }} 
            value={filterMonth} 
            onChange={e => handleSetFilterMonth(e.target.value)} 
          />

          <select className="form-input" style={{ width: 140 }} value={prefs.tipoExtrato} onChange={e => setFilter('tipoExtrato', e.target.value)}>
            <option value="">Todas as mov.</option>
            <option value="crédito">Só Entradas</option>
            <option value="débito">Só Saídas</option>
          </select>
          
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={resetFilters} style={{ color: 'var(--color-yellow)' }}>✕ Limpar</button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowY: 'auto', overflowX: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '24px 24px 16px 24px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            🏦 Movimentos Bancários
            {bancaAtiva && (
              <span style={{ fontWeight: 400, color: bancaAtiva.cor, marginLeft: 8 }}>
                {bancaAtiva.nome}{bancaAtiva.conta ? ` · ${bancaAtiva.conta}` : ''}
              </span>
            )}
          </span>
          <span className="badge badge-green" style={{ fontSize: 11 }}>{movBancarios.filter(e=>e.tipo==='crédito').length} entradas</span>
          <span className="badge badge-red"   style={{ fontSize: 11 }}>{movBancarios.filter(e=>e.tipo==='débito').length} saídas</span>
          
          <div style={{ flex: 1 }} />
        </div>

        {!prefs.contaBancariaId ? (
          <div className="empty-state" style={{ padding: '48px 0' }}>
            <div style={{ fontSize: 32 }}>🏦</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 8 }}>Selecione um banco para carregar os movimentos</div>
          </div>
        ) : movBancarios.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px 0' }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>Nenhum movimento encontrado com os filtros atuais</div>
          </div>
        ) : (
          <table className="data-table" style={{ fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-card)', boxShadow: '0 1px 0 var(--color-border)' }}>
              <tr>
                  <th style={{ width: 40, textAlign: 'center' }}><input type="checkbox" className="checkbox-orange lg" onChange={handleToggleAllExtratos} checked={movBancarios.filter(m => !m.reconciliarDoc && !m.conciliado && !m.conciliadoOut).length > 0 && selectedExtratos.size === movBancarios.filter(m => !m.reconciliarDoc && !m.conciliado && !m.conciliadoOut).length} /></th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {movBancarios.map(m => {
                  const isBlocked = m.reconciliarDoc || m.conciliado || m.conciliadoOut;
                  return (
                  <tr key={m.id} style={{ opacity: m.conciliado || m.conciliadoOut ? 0.6 : 1, background: selectedExtratos.has(m.id) ? 'var(--color-accent-dim)' : 'transparent', cursor: isBlocked ? 'default' : 'pointer' }} onClick={() => { if (!isBlocked) handleToggleExtrato(m.id); }}>
                    <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                      <input type="checkbox" className="checkbox-orange" checked={selectedExtratos.has(m.id)} onChange={() => handleToggleExtrato(m.id)} disabled={isBlocked} />
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDate(m.data)}</td>
                    <td style={{ maxWidth: 300 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descricao}>
                        {m.descricao || '—'}
                      </span>
                    </td>
                    <td><span className={`badge ${m.tipo === 'crédito' ? 'badge-green' : 'badge-red'}`}>{m.tipo}</span></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: m.tipo === 'crédito' ? 'var(--color-green)' : 'var(--color-red)' }}>
                      {m.tipo === 'crédito' ? '+' : ''}{fmtCurrency(m.valor)}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {m.saldo != null ? fmtCurrency(m.saldo) : '—'}
                    </td>
                    <td>
                      {(m.conciliado || m.conciliadoOut) ? <span className="badge badge-green">✓</span> : <span className="badge badge-yellow">Pend.</span>}
                      {m.reconciliarDoc && !(m.conciliado || m.conciliadoOut) && <span className="badge badge-purple" style={{ marginLeft: 6 }}>In Coda</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
        )}
      </div>
    </div>
  );
}
