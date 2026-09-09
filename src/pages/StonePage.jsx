import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEmpresa } from '../context/EmpresaContext';
import { useReceitasHub } from '../hooks/useReceitasHub';
import { fmtCurrency } from '../utils/formatters';

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

export default function StonePage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const { empresas } = useEmpresa();
  const empresa = empresas.find(e => e.id === empresaId);
  const { data, loading, deleteMovements, refresh } = useReceitasHub(empresaId);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoria, setSelectedCategoria] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  // Sincronizza i dati all'apertura
  useEffect(() => {
    if (empresaId) refresh();
  }, [empresaId, refresh]);

  // Estrae le categorie e mesi
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

  // Seleziona 'Venda' di default appena la pagina carica i dati
  useEffect(() => {
    if (!selectedCategoria && uniqueCategories.length > 0) {
      const venda = uniqueCategories.find(c => c.toLowerCase().includes('venda'));
      if (venda) setSelectedCategoria(venda);
    }
  }, [uniqueCategories, selectedCategoria]);

  if (!empresa) {
    return <div className="contas-page"><div className="contas-loading"><div className="spinner"></div></div></div>;
  }

  // Filtro client-side in tempo reale per categoria e ricerca
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

  // Calcolo totale dinamico basato sui filtri
  const totalValor = filteredData.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);

  return (
    <div className="contas-page fade-in">
      <div className="contas-toolbar card">
        <div style={{ flex: 1 }}>
          <h2 className="overview-title" style={{ fontSize: 24, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>💳</span> STONE Hub ({empresa.name})
          </h2>
          <p className="overview-subtitle" style={{ fontSize: 13, opacity: 0.8 }}>
            Arquivo dos <strong>{data.length}</strong> movimentos originais importados do arquivo massivo Stone Hub. Base de dados prioritária para reconciliação.
          </p>
        </div>
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
              style={{ width: 160, fontWeight: 600, color: selectedCategoria ? 'var(--color-primary)' : 'inherit' }}
            >
              <option value="">Todas as categorias</option>
              {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              className="form-input search-input" 
              placeholder="Buscar registro... (Ex. Crédito)"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: 220 }}
            />
          </div>
          <button className="btn btn-secondary" onClick={refresh} title="Atualizar banco de dados">🔄</button>
          
          <button 
            className="btn btn-secondary" 
            style={{ color: 'var(--color-red)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
            disabled={filteredData.length === 0}
            onClick={() => {
              if (window.confirm(`Atenção: Deseja realmente EXCLUIR os ${filteredData.length} registros filtrados atualmente?\nA operação é irreversível.`)) {
                deleteMovements(filteredData.map(r => r.id));
              }
            }}
            title="Excluir todos os movimentos filtrados em lote"
          >
            🗑️ Esvaziar ({filteredData.length})
          </button>
        </div>
      </div>

      <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        {/* Intestazione e riassunto */}
        <div style={{ padding: '16px 24px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Mostrando {filteredData.length} de {data.length} linhas
          </div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            Montante: <span style={{ color: totalValor >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{fmtCurrency(totalValor)}</span>
          </div>
        </div>

        <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
             <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
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
                {filteredData.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                      {row.data ? row.data.split('-').reverse().join('/') : '—'}
                    </td>
                    <td>{row.descricao || '—'}</td>
                    <td><span className="badge badge-accent">{getCategoria(row) || '—'}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>{row.cnpj}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: row.valor < 0 ? 'var(--color-red)' : 'var(--color-text)' }}>
                      {fmtCurrency(row.valor)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button 
                        className="btn-icon danger" 
                        title="Excluir movimento seletivamente do banco de dados"
                        onClick={() => {
                          if (window.confirm('Atenção: tem certeza que deseja forçar a exclusão deste único registro do banco de dados Stone?')) {
                            deleteMovements([row.id]).then(() => refresh());
                          }
                        }}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>Nenhum movimento Stone encontrado para esta empresa.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
