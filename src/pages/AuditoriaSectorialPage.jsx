/**
 * AuditoriaSectorialPage.jsx — Operational Dashboard for Receitas/Despesas
 * Allows manual checks, attaching documents, and transferring rows. // Sprint 5
 */
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEmpresa } from '../context/EmpresaContext';
import { useExtratos } from '../hooks/useExtratos';
import { useContasBancarias } from '../hooks/useContasBancarias';
import { fmtCurrency } from '../utils/formatters';
import { fmtDate } from '../utils/dateUtils';
import { useToast } from '../context/ToastContext';
import * as XLSX from 'xlsx';
import { useDocumentos } from '../hooks/useDocumentos';

function extractSupplierFromFilename(fileName) {
  let name = (fileName || '').replace(/\.pdf$/i, '');
  name = name.replace(/^SCAN_[\d\-_.]+_/i, '');
  name = name.replace(/_[^_]+_[A-Za-z0-9]{4}$/i, '');
  return name.replace(/_/g, ' ').trim();
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPI({ label, value, icon, color, sub }) {
  return (
    <div className="kpi-card"
      style={{ borderTop: `3px solid ${color}`, padding: '6px 10px', minHeight: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, background: 'var(--color-bg-secondary)', borderRadius: 8, border: '1px solid var(--color-border)' }}
    >
      <div className="kpi-header" style={{ marginBottom: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="kpi-label" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{label}</span>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div className="kpi-value" style={{ color, fontSize: 18, lineHeight: 1, fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function AuditoriaSectorialPage({ sector }) {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  
  const { extratos, loading, updateExtrato } = useExtratos(empresaId);
  const { contas } = useContasBancarias(empresaId);
  const { documentos } = useDocumentos(empresaId);

  // Competence month filter
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  const [competencia, setCompetencia] = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) {
      const d = new Date();
      saved = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return saved;
  });

  const handleSetCompetencia = (val) => {
    setCompetencia(val);
    localStorage.setItem(FILTER_MONTH_KEY, val);
  };
  const [selectedContaId, setSelectedContaId] = useState('todas');
  const [filterConc, setFilterConc] = useState('pendentes'); // 'todos', 'pendentes', 'conciliados'

  // Sort
  const [sortField, setSortField] = useState('data');
  const [sortDir, setSortDir] = useState('desc');

  // Aggregation
  const data = useMemo(() => {
    let list = extratos.filter(e => e.moduloDestino === sector);
    
    // Month & Bank
    list = list.filter(e => (e.data || '').startsWith(competencia));
    if (selectedContaId !== 'todas') {
      list = list.filter(e => e.contaBancariaId === selectedContaId);
    }
    
    const linkedMovIds = new Set(documentos.flatMap(d => (d.movimentoId || '').split(',').filter(Boolean)));
    const checkIsAudited = (e) => {
      if (sector === 'despesas') return e.conciliado || e.conciliadoOut || linkedMovIds.has(e.id);
      return e.conciliado || linkedMovIds.has(e.id);
    };
    // KPIs before status filter
    const total = list.length;
    const conciliados = list.filter(checkIsAudited).length;
    const pendentes = total - conciliados;
    const valorPendente = list.filter(e => !checkIsAudited(e)).reduce((s, e) => s + Math.abs(Number(e.valor) || 0), 0);

    // Status filter
    if (filterConc === 'pendentes') list = list.filter(e => !checkIsAudited(e));
    if (filterConc === 'conciliados') list = list.filter(checkIsAudited);

    // Sort
    list.sort((a, b) => {
      let vA = a[sortField], vB = b[sortField];
      if (sortField === 'valor') { vA = Math.abs(Number(vA)); vB = Math.abs(Number(vB)); }
      if (vA < vB) return sortDir === 'asc' ? -1 : 1;
      if (vA > vB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return { filteredList: list, kpis: { total, conciliados, pendentes, valorPendente } };
  }, [extratos, documentos, sector, competencia, selectedContaId, filterConc, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };
  const SortIcon = ({ field }) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const handleToggleCheck = async (mov) => {
    const isCurrentlyAudited = sector === 'despesas' ? (mov.conciliado || mov.conciliadoOut) : mov.conciliado;
    
    if (isCurrentlyAudited) {
      // Clear both flags to be safe
      await updateExtrato(mov.id, { conciliado: false, conciliadoOut: false, matchedSource: null, matchedId: null });
      toast.info('Auditoria cancelada para este movimento.');
    } else {
      if (!window.confirm('Confirma que este movimento foi auditado manualmente e está correto?')) return;
      await updateExtrato(mov.id, { conciliado: true, matchedSource: 'Manual', matchedId: 'Auditoria' });
      toast.success('Movimento marcado como auditado!');
    }
  };

  const handleAttachDoc = async (mov) => {
    const doc = window.prompt('Referência do documento (Nome do arquivo, Link, ou ID):', mov.documento || '');
    if (doc !== null) {
      await updateExtrato(mov.id, { documento: doc.trim() });
      toast.success('Documento anexado.');
    }
  };

  const handleTransfer = async (mov) => {
    const dest = sector === 'receitas' ? 'despesas' : 'receitas';
    const destName = sector === 'receitas' ? 'Saídas (Despesas)' : 'Entradas (Receitas)';
    if (window.confirm(`Transferir esta operação bancária para ${destName}?`)) {
      await updateExtrato(mov.id, { moduloDestino: dest });
      toast.info(`Movimento transferido para ${dest}.`);
    }
  };

  const handleExportContabilidade = () => {
    let baseExtratos = data.filteredList; // Use currently filtered view

    if (baseExtratos.length === 0) {
      toast.error('Nenhum movimento encontrado para exportar.');
      return;
    }

    const dataExcel = baseExtratos.map(e => {
      const docsMatched = documentos.filter(d => (d.movimentoId || '').split(',').includes(e.id));
      const docsNames = docsMatched.map(d => extractSupplierFromFilename(d.fileName) || d.fileName).join('; ');
      const rawNames =  docsMatched.map(d => d.fileName || '').join('; ');

      let status = 'Pendente';
      if (docsMatched.length > 0) status = 'Conciliado (Com Doc)';
      else if (e.reconciliarDoc === false || e.documentoId === 'DISPENSADO') status = 'Conciliado (Sem Doc / Dispensado)';
      else if (e.conciliado) status = 'Conciliado (Auditoria Manual)';

      const isDebito = e.tipo === 'débito' || Number(e.valor) < 0 || sector === 'despesas';
      const finalAmt = isDebito ? -Math.abs(Number(e.valor) || 0) : Math.abs(Number(e.valor) || 0);

      return {
        "Data Venc.": e.data ? new Date(`${e.data}T12:00:00`) : '',
        "Descrição Banco": e.descricao || e.historico || '',
        "Valor (R$)": finalAmt,
        "Status Reconciliação": status,
        "Fornecedor / Documento": docsNames,
        "Arquivo Original": rawNames
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataExcel);
    
    for (let i = 0; i < dataExcel.length; i++) {
      // 1. Ensure "Data Venc." (Column A, index 0) presents as native localized Date type
      const cellA = ws[XLSX.utils.encode_cell({ c: 0, r: i + 1 })];
      if (cellA && cellA.v instanceof Date) {
        cellA.t = 'd';
        cellA.z = 'dd/mm/yyyy'; // Explicit European format vs auto-Excel
      }

      // 2. Inject native Excel HYPERLINK formulas for "Arquivo Original" (Column F, index 5)
      const cellF = ws[XLSX.utils.encode_cell({ c: 5, r: i + 1 })];
      if (cellF && cellF.v && typeof cellF.v === 'string') {
        const firstFile = cellF.v.split(';')[0].trim();
        if (firstFile.toLowerCase().endsWith('.pdf')) {
          cellF.f = `HYPERLINK("${firstFile}", "${firstFile}")`;
          delete cellF.v;
          delete cellF.w;
          delete cellF.t;
        }
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contabilidade");
    
    ws['!cols'] = [
      { wch: 15 }, { wch: 50 }, { wch: 15 }, { wch: 35 }, { wch: 40 }, { wch: 60 }
    ];

    const fileName = `Auditoria_${sector}_${empresaId}_${competencia}.xlsx`;

    // Finestra informativa obbligatoria
    alert('🔗 ATENÇÃO: Para que os LINKS dos documentos funcionem ao clicar dentro do Excel, você DEVE certificar-se de salvar o arquivo baixado exatamente na MESMA PASTA onde os seus PDFs originais estão guardados no computador!');

    XLSX.writeFile(wb, fileName);
    toast.success('📊 Arquivo contábil gerado com sucesso!');
  };

  const isReceitas = sector === 'receitas';

  if (loading) {
    return <div className="contas-loading"><div className="spinner" /></div>;
  }

  return (
    <div style={{ padding: 24, paddingBottom: 100, maxWidth: 1200, margin: '0 auto', color: 'var(--color-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content', marginBottom: 12 }}>← Voltar</button>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            {isReceitas ? '📥 Auditoria de Entradas (Receitas)' : '💸 Auditoria de Saídas (Despesas)'}
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: 13 }}>
            Painel operacional para conferência manual e anexos do extrato bancário.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Conta:</label>
          <select 
            className="form-input" 
            value={selectedContaId}
            onChange={(e) => setSelectedContaId(e.target.value)}
            style={{ width: 180, fontWeight: 600, background: 'var(--color-bg-hover)' }}
          >
            <option value="todas">🏦 Todas as contas</option>
            {contas.map(b => <option key={b.id} value={b.id}>🏦 {b.nome}</option>)}
          </select>

          <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Mês:</label>
          <input 
            type="month" 
            className="form-input" 
            value={competencia}
            onChange={(e) => handleSetCompetencia(e.target.value)}
            style={{ width: 160, fontWeight: 700, background: 'var(--color-bg-hover)' }}
          />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <KPI 
          label={`Total de ${isReceitas ? 'Entradas' : 'Saídas'}`} 
          value={data.kpis.total} 
          icon={isReceitas ? '💰' : '💸'} 
          color={isReceitas ? 'var(--color-purple)' : 'var(--color-orange)'} 
        />
        <KPI 
          label="Já Auditado / Conciliado" 
          value={data.kpis.conciliados} 
          icon="✅" 
          color="var(--color-green)" 
        />
        <KPI 
          label="Pendente de Ação" 
          value={data.kpis.pendentes} 
          icon="⚠️" 
          color="var(--color-red)" 
          sub={`Vol: ${fmtCurrency(data.kpis.valorPendente)}`}
        />
      </div>

      {/* Toolbar filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn ${filterConc === 'pendentes' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterConc('pendentes')}>Somente Pendentes</button>
        <button className={`btn ${filterConc === 'conciliados' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterConc('conciliados')}>Somente Auditados</button>
        <button className={`btn ${filterConc === 'todos' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilterConc('todos')}>Mostrar Todos</button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {data.filteredList.length} registros exibidos
          </span>
          <button onClick={handleExportContabilidade} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-blue)', color: 'var(--color-blue)' }}>
             📊 Exportar p/ Contabilidade
          </button>
        </div>
      </div>

      {/* Master Table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto', maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-card)', boxShadow: '0 1px 0 var(--color-border)' }}>
            <tr>
              <th style={{ width: 60, textAlign: 'center' }}>Audit.</th>
              <th style={{ width: 100, cursor: 'pointer' }} onClick={() => handleSort('data')}>Data <SortIcon field="data" /></th>
              <th>Descrição Original</th>
              <th style={{ width: 120 }}>Conta Bancária</th>
              <th style={{ width: 120, textAlign: 'right', cursor: 'pointer' }} onClick={() => handleSort('valor')}>Valor <SortIcon field="valor" /></th>
              <th style={{ width: 180 }}>Documento (Anexo)</th>
              <th style={{ width: 140 }}>Origem</th>
              <th style={{ width: 60, textAlign: 'center' }}>Move</th>
            </tr>
          </thead>
          <tbody>
            {data.filteredList.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
                  Nenhum registro encontrado para os filtros atuais.
                </td>
              </tr>
            ) : data.filteredList.map(mov => {
              const bancoNome = contas.find(c => c.id === mov.contaBancariaId)?.nome || 'Banco';
              const hasEngineDoc = documentos.some(d => (d.movimentoId || '').split(',').includes(mov.id));
              const isAudited = sector === 'despesas' ? (mov.conciliado || mov.conciliadoOut || hasEngineDoc) : (mov.conciliado || hasEngineDoc);
              
              return (
                <tr key={mov.id} style={{ opacity: isAudited ? 0.7 : 1, background: isAudited ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                  {/* Checkbox */}
                  <td style={{ textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={!!isAudited}
                      onChange={() => handleToggleCheck(mov)}
                      style={{ transform: 'scale(1.4)', cursor: 'pointer', accentColor: 'var(--color-green)' }}
                      title="Marcar como auditado/conciliado"
                    />
                  </td>
                  
                  {/* Data */}
                  <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    {fmtDate(mov.data)}
                  </td>
                  
                  {/* Descrição */}
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mov.descricao}>
                    {mov.descricao}
                  </td>
                  
                  {/* Banco */}
                  <td style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {bancoNome}
                  </td>
                  
                  {/* Valor */}
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: isAudited ? 'normal' : 'bold', color: isReceitas ? 'var(--color-green)' : 'var(--color-red)' }}>
                    {fmtCurrency(Math.abs(Number(mov.valor)))}
                  </td>
                  
                  {/* Documento */}
                  <td style={{ fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 6px', fontSize: 12, border: mov.documento ? 'none' : '1px dashed var(--color-border)' }} onClick={() => handleAttachDoc(mov)} title="Anexar Documento">📎</button>
                      <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: mov.documento ? 1 : 0.4 }} title={mov.documento}>
                        {mov.documento || 'Sem anexo'}
                      </span>
                    </div>
                  </td>
                  
                  {/* Origem */}
                  <td style={{ fontSize: 11, color: isAudited ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                    {isAudited ? (
                      <span className="badge" style={{ background: 'var(--color-bg-active)' }} title={mov.matchedId}>
                        {hasEngineDoc ? 'Doc Vinculado' : (mov.matchedSource || (mov.documentoId === 'DISPENSADO' ? 'Dispensado' : 'Sistema'))}
                      </span>
                    ) : (
                      <span style={{ opacity: 0.5 }}>—</span>
                    )}
                  </td>
                  
                  {/* Transfer */}
                  <td style={{ textAlign: 'center' }}>
                    <button 
                      className="btn btn-ghost" 
                      onClick={() => handleTransfer(mov)}
                      title={`Transferir riga para ${isReceitas ? 'Despesas' : 'Receitas'}`}
                      style={{ padding: '4px 8px', fontSize: 12 }}
                    >
                      🔄
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
