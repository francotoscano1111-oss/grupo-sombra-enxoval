/**
 * ReceitasHubPage.jsx — Consolidated receipt management by CNPJ.
 * Users can upload a multi-company file and the system splits rows to respective DBs.
 */
import React, { useState } from 'react';
import { useReceitasHub } from '../hooks/useReceitasHub';
import { useEmpresa } from '../context/EmpresaContext';
import { useToast } from '../context/ToastContext';
import ImportReceitasHubModal from '../components/receitas/ImportReceitasHubModal';

export default function ReceitasHubPage() {
  const { empresas } = useEmpresa();
  const [selectedEmp, setSelectedEmp] = useState('');
  const { data, loading, importConsolidado, deleteMovements, refresh } = useReceitasHub(selectedEmp);
  const [showImport, setShowImport] = useState(false);
  const toast = useToast();

  const handleImport = async (rows) => {
    try {
      const stats = await importConsolidado(rows);
      if (stats.success > 0) {
        const summary = Object.entries(stats.split).map(([k, v]) => `${k}: ${v}`).join(', ');
        if (stats.skipped > 0) {
          const missed = Array.from(stats.skippedCnpjs || []).join(', ');
          toast.warning(`⚠️ ATENÇÃO - Importados: ${stats.success} | IGNORADOS: ${stats.skipped} registros. Os seguintes CNPJs no arquivo não pertencem a nenhuma Empresa sua: ${missed || 'CNPJ Vazios'}`);
        } else {
          toast.success(`💳 Importação Stone Perfeita: ${stats.success} linhas salvas. [${summary}]`);
        }
      } else {
        toast.error(`❌ Nenhum movimento salvo. ${stats.skipped} linhas descartadas (Verifique os CNPJs no Arquivo Mestre).`);
      }
      setShowImport(false);
      if (selectedEmp) await refresh();
    } catch (err) {
      console.error('[Hub Import Error]', err);
      toast.error('Erro fatal ao salvar DB: ' + err.message);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  // Extract Categories and Months
  function getCategoria(item) {
    if (item.categoria) return String(item.categoria).trim();
    if (item.original) {
      for (const key of Object.keys(item.original)) {
        const k = key.toLowerCase();
        if (k.includes('categoria') || k.includes('tipo') || k.includes('origem')) {
          return String(item.original[key]).trim();
        }
      }
    }
    return '';
  }

  function extractYYYYMM(dateStr) {
    if (!dateStr) return '';
    const isoM = dateStr.match(/^(\d{4})-(\d{2})/);
    if (isoM) return `${isoM[1]}-${isoM[2]}`;
    const ptM = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (ptM) return `${ptM[3]}-${ptM[2]}`;
    return '';
  }

  const uniqueCategories = Array.from(new Set(data.map(getCategoria).filter(Boolean))).sort();
  const uniqueMonths = Array.from(new Set(data.map(i => extractYYYYMM(i.data)).filter(Boolean))).sort().reverse();
  
  const formatMonth = (yyyy_mm) => {
    const [y, m] = yyyy_mm.split('-');
    const date = new Date(y, parseInt(m) - 1, 1);
    const label = date.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const filteredData = data.filter(item => {
    if (selectedMonth && extractYYYYMM(item.data) !== selectedMonth) return false;

    const cat = getCategoria(item);
    if (selectedCategoria && cat !== selectedCategoria) return false;
    
    if (searchTerm) {
      const formattedDate = item.data ? item.data.split('-').reverse().join('/') : '';
      const isMatch = (item.descricao || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (item.valor !== undefined && String(item.valor).includes(searchTerm)) ||
                      (item.data || '').includes(searchTerm) ||
                      formattedDate.includes(searchTerm);
      if (!isMatch) return false;
    }
    return true;
  });

  if (loading) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div className="contas-page">
      <div className="contas-toolbar card">
        <div className="contas-toolbar-row" style={{ justifyContent: 'space-between', marginBottom: selectedEmp ? 12 : 0 }}>
          <div>
            <h2 className="overview-title" style={{ fontSize: 20 }}>💳 CC STONE (Geral Hub)</h2>
            <p className="overview-subtitle" style={{ fontSize: 13 }}>Importação consolidada Stone dividida por CNPJ</p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <select 
              className="form-input" 
              style={{ width: 220, fontSize: 12 }}
              value={selectedEmp}
              onChange={e => { setSelectedEmp(e.target.value); setSearchTerm(''); setSelectedCategoria(''); }}
            >
              <option value="">🔍 Selecione uma empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setShowImport(true)}>
              📥 Importar Stone Hub
            </button>
          </div>
        </div>
        
        {/* Secondary Toolbar Row for Filters and Bulk Delete (only visible if company selected) */}
        {selectedEmp && (
          <div className="contas-toolbar-row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {uniqueMonths.length > 0 && (
                <select 
                  className="form-input" 
                  value={selectedMonth} 
                  onChange={e => setSelectedMonth(e.target.value)}
                  style={{ width: 160, fontWeight: selectedMonth ? 600 : 400, color: selectedMonth ? 'var(--color-primary)' : 'inherit' }}
                >
                  <option value="">🗓️ Todos os meses</option>
                  {uniqueMonths.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
                </select>
              )}
              {uniqueCategories.length > 0 && (
                <select 
                  className="form-input search-input" 
                  value={selectedCategoria} 
                  onChange={e => setSelectedCategoria(e.target.value)}
                  style={{ width: 150, fontWeight: 600, color: selectedCategoria ? 'var(--color-primary)' : 'inherit' }}
                >
                  <option value="">Todas as categorias</option>
                  {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <input 
                type="text" 
                className="form-input search-input" 
                placeholder="🔍 Buscar registro..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: 220 }}
              />
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {filteredData.length} de {data.length} linhas
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn btn-secondary" 
                style={{ color: 'var(--color-red)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                disabled={filteredData.length === 0}
                onClick={() => {
                  if (window.confirm(`Atenção: Deseja EXCLUIR PERMANENTEMENTE os ${filteredData.length} registros filtrados atualmente?\nA operação é irreversível.`)) {
                    deleteMovements(filteredData.map(r => r.id));
                  }
                }}
              >
                🗑️ Esvaziar Filtrados ({filteredData.length})
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        {!selectedEmp ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏢</div>
            <div className="empty-state-text">Selecione uma empresa acima para visualizar e gerenciar os dados importados.</div>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💳</div>
            <div className="empty-state-text">Nenhum movimento encontrado nos filtros atuais para esta unidade.</div>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Data de Origem</th>
                <th>Descrição (Stone)</th>
                <th style={{ width: 150 }}>Categoria (Tipo)</th>
                <th style={{ width: 150 }}>CNPJ Detectado</th>
                <th style={{ textAlign: 'right', width: 150 }}>Valor Importado (R$)</th>
                <th style={{ textAlign: 'right', width: 60 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                     {r.data ? r.data.split('-').reverse().join('/') : '—'}
                  </td>
                  <td style={{ fontSize: 13 }}>{r.descricao || '—'}</td>
                  <td><span className="badge badge-accent">{getCategoria(r) || '—'}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>{r.cnpj}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: Number(r.valor) < 0 ? 'var(--color-red)' : 'var(--color-text)' }}>
                    {Number(r.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button 
                      className="btn-icon danger" 
                      title="Excluir movimento único do banco de dados"
                      onClick={() => {
                        if (window.confirm('Atenção: tem certeza que deseja forçar a exclusão deste único registro do banco de dados Stone?')) {
                          deleteMovements([r.id]);
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showImport && (
        <ImportReceitasHubModal 
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
