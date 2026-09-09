import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExtratos } from '../hooks/useExtratos';
import { useContasBancarias } from '../hooks/useContasBancarias';
import { useDocumentos } from '../hooks/useDocumentos';
import KPICard from '../components/shared/KPICard';
import { fmtCurrency } from '../utils/formatters';
import { fmtDate } from '../utils/dateUtils';
import { gerarPacoteContabil } from '../utils/ExportadorContabil';

export default function FechamentoPage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();

  // The GOLDEN RULE: We only look at Extratos!
  const { extratos, loading: extratosLoading } = useExtratos(empresaId);
  const { contas } = useContasBancarias(empresaId);
  const { documentos, loading: docsLoading } = useDocumentos(empresaId);

  const loading = extratosLoading || docsLoading;

  // Competence month filter
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  const [competencia, setCompetencia] = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) {
      const today = new Date();
      saved = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    }
    return saved;
  });

  const handleSetCompetencia = (val) => {
    setCompetencia(val);
    localStorage.setItem(FILTER_MONTH_KEY, val);
  };
  const [selectedContaId, setSelectedContaId] = useState('todas');

  // Aggregation
  const data = useMemo(() => {
    // 1. Filter ALL bank movements strictly by the selected month and optionally by bank
    let extratosMes = extratos.filter(e => (e.data || '').startsWith(competencia));
    if (selectedContaId !== 'todas') {
      extratosMes = extratosMes.filter(e => e.contaBancariaId === selectedContaId);
    }

    // 2. Split into Receitas and Despesas based on `moduloDestino`
    const recMes = extratosMes.filter(e => e.moduloDestino === 'receitas');
    const desMes = extratosMes.filter(e => e.moduloDestino === 'despesas');

    const linkedDocsMap = new Map();
    documentos.forEach(d => {
      (d.movimentoId || '').split(',').filter(Boolean).forEach(id => linkedDocsMap.set(id, d));
    });

    // 3. Status checks
    const recConciliado = recMes.filter(e => e.conciliado || linkedDocsMap.has(e.id));
    const desConciliado = desMes.filter(e => e.conciliado || e.conciliadoOut || linkedDocsMap.has(e.id));

    return {
      extratosMes,
      linkedDocsMap,
      receitas: {
        total: recMes.length,
        conciliado: recConciliado.length,
        pendente: recMes.length - recConciliado.length,
        percent: recMes.length ? Math.round((recConciliado.length / recMes.length) * 100) : 100,
        valorTotal: recMes.reduce((s, e) => s + Math.abs(Number(e.valor) || 0), 0),
        valorConciliado: recConciliado.reduce((s, e) => s + Math.abs(Number(e.valor) || 0), 0),
      },
      despesas: {
        total: desMes.length,
        conciliado: desConciliado.length,
        pendente: desMes.length - desConciliado.length,
        percent: desMes.length ? Math.round((desConciliado.length / desMes.length) * 100) : 100,
        valorTotal: desMes.reduce((s, e) => s + Math.abs(Number(e.valor) || 0), 0),
        valorConciliado: desConciliado.reduce((s, e) => s + Math.abs(Number(e.valor) || 0), 0),
      }
    };
  }, [extratos, documentos, competencia, selectedContaId]);

  const progColor = (p) => p === 100 ? 'var(--color-green)' : p > 50 ? 'var(--color-yellow)' : 'var(--color-red)';

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      const recs = data.extratosMes.filter(e => e.moduloDestino === 'receitas');
      const desps = data.extratosMes.filter(e => e.moduloDestino === 'despesas');
      await gerarPacoteContabil(competencia, recs, desps, contas, selectedContaId);
    } catch (e) {
      alert("Erro ao exportar ZIP: " + e.message);
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="contas-loading"><div className="spinner" /></div>;
  }

  return (
    <div style={{ padding: 24, paddingBottom: 100, maxWidth: 1200, margin: '0 auto', color: 'var(--color-text)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content', marginBottom: 12 }}>← Voltar</button>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            🔒 Fechamento Contábil (Master View)
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: 13 }}>
            Apenas os movimentos integrados via <strong>Estrato Bancário</strong> compõem o escopo do Fechamento Contábil.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Conta Bancária:</label>
          <select 
            className="form-input" 
            value={selectedContaId}
            onChange={(e) => setSelectedContaId(e.target.value)}
            style={{ width: 180, fontWeight: 600, background: 'var(--color-bg-hover)' }}
          >
            <option value="todas">🏦 Todas as contas</option>
            {contas.map(b => <option key={b.id} value={b.id}>🏦 {b.nome}</option>)}
          </select>

          <label style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Mês de Referência:</label>
          <input 
            type="month" 
            className="form-input" 
            value={competencia}
            onChange={(e) => handleSetCompetencia(e.target.value)}
            style={{ width: 160, fontWeight: 700, background: 'var(--color-bg-hover)' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 24 }}>
        
        {/* Receitas Progress */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>💰 Entradas Bancárias (Receitas)</span>
            <span style={{ color: progColor(data.receitas.percent) }}>{data.receitas.percent}%</span>
          </h2>
          <div style={{ width: '100%', height: 8, background: 'var(--color-bg)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ width: `${data.receitas.percent}%`, height: '100%', background: progColor(data.receitas.percent), transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>
              {data.receitas.conciliado} de {data.receitas.total} linhas do extrato
            </span>
            <span>
              {data.receitas.pendente} pendências
            </span>
          </div>
          <div style={{ marginTop: 12, padding: 12, background: 'var(--color-bg)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Volume no Mês</span>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtCurrency(data.receitas.valorTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Conciliado</span>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-green)' }}>{fmtCurrency(data.receitas.valorConciliado)}</span>
            </div>
          </div>
        </div>

        {/* Despesas Progress */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>💸 Saídas Bancárias (Despesas)</span>
            <span style={{ color: progColor(data.despesas.percent) }}>{data.despesas.percent}%</span>
          </h2>
          <div style={{ width: '100%', height: 8, background: 'var(--color-bg)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ width: `${data.despesas.percent}%`, height: '100%', background: progColor(data.despesas.percent), transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>
              {data.despesas.conciliado} de {data.despesas.total} linhas do extrato
            </span>
            <span>
              {data.despesas.pendente} pendências
            </span>
          </div>
          <div style={{ marginTop: 12, padding: 12, background: 'var(--color-bg)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Volume no Mês</span>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtCurrency(data.despesas.valorTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Conciliado</span>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-green)' }}>{fmtCurrency(data.despesas.valorConciliado)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Audit de Documentos Placeholder & Actions */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>📦</span>
          Geração do Pacote Contábil
        </h2>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.5, maxWidth: 800 }}>
          O ZIP final incluirá todas as linhas de estrato do mês cruzadas com suas origens (NFs, Cartões de Crédito, Fornecedores).
        </p>
        
        {data.receitas.percent < 100 || data.despesas.percent < 100 ? (
          <div style={{ padding: 12, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid var(--color-yellow)', color: 'var(--color-yellow)', borderRadius: 8, marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span>⚠️</span>
            <div>
              <strong>Atenção: A conciliação não está em 100%.</strong><br />
              O Extrato Bancário ainda possui {data.receitas.pendente + data.despesas.pendente} linhas pendentes/sem origem confirmada. O ZIP pode ser gerado pacialmente em caso de urgência.
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--color-green)', color: 'var(--color-green)', borderRadius: 8, marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>✅</span>
            <strong>Extrato Bancário 100% conciliado! Pacote validado e pronto para exportação.</strong>
          </div>
        )}

        <button 
          className={data.receitas.percent === 100 && data.despesas.percent === 100 ? "btn btn-primary" : "btn btn-secondary"} 
          style={{ width: '100%', padding: 16, fontSize: 16, display: 'flex', justifyContent: 'center', gap: 10 }}
          onClick={handleExport}
          disabled={exporting}
        >
           {exporting ? '📦 Gerando ZIP...' : `Exportar ZIP Contábil de ${competencia}`}
        </button>
      </div>

      {/* MASTER TABLE: Extrato Bancário */}
      <div className="card" style={{ padding: 0, overflowX: 'auto', overflowY: 'auto', maxHeight: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, background: 'var(--color-bg-card)', zIndex: 11 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>📋 Master Table: Auditoria do Estrato</h2>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{data.extratosMes.length} movimentos bancários no mês</span>
        </div>

        {data.extratosMes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-secondary)' }}>
            <div style={{ fontSize: 40, opacity: 0.5, marginBottom: 12 }}>🏦</div>
            <div>Nenhum movimento bancário importado para {competencia}.</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Acesse o Hub Corporativo para importar OFX/Excel.</div>
          </div>
        ) : (
          <table className="data-table">
            <thead style={{ position: 'sticky', top: '56px', zIndex: 10, background: 'var(--color-bg-card)' }}>
              <tr>
                <th style={{ width: 40 }}>St.</th>
                <th style={{ width: 100 }}>Data</th>
                <th>Descrição Original</th>
                <th style={{ width: 120 }}>Banco</th>
                <th style={{ width: 100 }}>Centro</th>
                <th style={{ width: 120, textAlign: 'right' }}>Valor</th>
                <th>Origem Conciliada (Vínculo)</th>
              </tr>
            </thead>
            <tbody>
              {data.extratosMes.sort((a,b) => a.data.localeCompare(b.data)).map(mov => {
                const bancoNome = contas.find(c => c.id === mov.contaBancariaId)?.nome || 'Banco';
                const hasDoc = data.linkedDocsMap.has(mov.id);
                const isConciliado = mov.moduloDestino === 'despesas' ? (mov.conciliado || mov.conciliadoOut || hasDoc) : (mov.conciliado || hasDoc);
                const linkedDoc = data.linkedDocsMap.get(mov.id);
                return (
                <tr key={mov.id} style={{ opacity: isConciliado ? 0.7 : 1 }}>
                  <td style={{ textAlign: 'center' }}>
                    {isConciliado ? (
                      <span title="Conciliado" style={{ color: 'var(--color-green)' }}>✅</span>
                    ) : (
                      <span title="Pendente" style={{ color: 'var(--color-red)' }}>⚠️</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{fmtDate(mov.data)}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mov.descricao}>{mov.descricao}</td>
                  <td style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{bancoNome}</td>
                  <td>
                    <span className={`badge ${mov.moduloDestino === 'receitas' ? 'badge-purple' : 'badge-orange'}`} style={{ fontSize: 10, minWidth: 65, textAlign: 'center' }}>
                      {mov.moduloDestino === 'receitas' ? 'Receitas' : 'Despesas'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: isConciliado ? 'normal' : 'bold', color: mov.moduloDestino === 'receitas' ? 'var(--color-green)' : 'var(--color-red)' }}>
                    {fmtCurrency(Math.abs(Number(mov.valor)))}
                  </td>
                  <td style={{ fontSize: 12, color: isConciliado ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                    {isConciliado ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="badge" style={{ background: 'var(--color-bg-active)' }}>{linkedDoc ? 'Doc Vinculado' : (mov.matchedSource || (mov.documentoId === 'DISPENSADO' ? 'Dispensado' : 'Sistema'))}</span>
                        <span style={{ opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }} title={linkedDoc ? linkedDoc.fileName : mov.matchedId}>Ref: {linkedDoc ? (linkedDoc.reference || 'DOC') : (mov.matchedId?.split('-')[0] || 'N/A')}</span>
                      </div>
                    ) : (
                      <span>—</span>
                    )}
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
