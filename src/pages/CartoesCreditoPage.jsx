import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useEmpresa } from '../context/EmpresaContext';
import { useCartoesCredito } from '../hooks/useCartoesCredito';
import { useAdquirentes } from '../hooks/useAdquirentes';
import { useToast } from '../context/ToastContext';
import ImportCartoesModal from '../components/receitas/ImportCartoesModal';
import { fmtCurrency } from '../utils/formatters';

import { ErrorBoundary } from '../components/ErrorBoundary';

export default function CartoesCreditoPage() {
  const { empresaId } = useParams();
  const { empresas } = useEmpresa();
  const empresa = empresas.find(e => e.id === empresaId);
  const toast = useToast();

  const { adquirentes, saveAdquirentes } = useAdquirentes(empresaId);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'config'
  const [selectedAdq, setSelectedAdq] = useState('stone');
  const [showImport, setShowImport] = useState(false);

  // Hook dynamically fetches from the specific adquirente DB
  const { data, loading, importCartoes, deleteMovements, refresh } = useCartoesCredito(empresaId, selectedAdq);

  const [searchTerm, setSearchTerm] = useState('');
  
  const handleImport = async (rows, importedAdqId) => {
    try {
      const stats = await importCartoes(rows, importedAdqId);
      if (stats.success > 0) {
        toast.success(`💳 Importação Concluída: ${stats.success} linhas salvas no banco de dados (${stats.total} lidas).`);
        if (importedAdqId === selectedAdq || selectedAdq === 'todos') refresh();
      } else {
        toast.error(`❌ Nenhum movimento salvo. Verifique duplicatas ou CNPJs.`);
      }
      setShowImport(false);
    } catch (err) {
      toast.error('Erro ao salvar DB: ' + err.message);
    }
  };

  const filteredData = data.filter(item => {
    if (searchTerm) {
      const isMatch = (item.descricao || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (item.valor !== undefined && String(item.valor).includes(searchTerm)) ||
                      (item.data || '').includes(searchTerm);
      if (!isMatch) return false;
    }
    return true;
  });

  const totalValor = filteredData.reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);

  // ----- Configurações Tab Helpers -----
  const [newAdqNome, setNewAdqNome] = useState('');
  
  const handleAddAdq = () => {
    if (!newAdqNome.trim()) return;
    const id = newAdqNome.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (adquirentes.find(a => a.id === id)) return toast.error('Adquirente já existe.');
    
    saveAdquirentes([...adquirentes, { id, nome: newAdqNome.trim().toUpperCase() }]);
    setNewAdqNome('');
    toast.success('Adquirente adicionado.');
  };

  const handleRemoveAdq = (id) => {
    if (window.confirm('Tem certeza? Remover da lista não exclui os dados no banco, mas oculta a opção.')) {
      saveAdquirentes(adquirentes.filter(a => a.id !== id));
      if (selectedAdq === id) setSelectedAdq('stone');
    }
  };

  if (!empresa) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div className="contas-page fade-in">
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => window.history.back()} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content' }}>← Voltar</button>
      </div>
      <div className="contas-toolbar card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 className="overview-title" style={{ fontSize: 24, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>💳</span> Cartões de Crédito ({empresa.name})
            </h2>
            <p className="overview-subtitle" style={{ fontSize: 13, opacity: 0.8 }}>
              Importação e gestão de extratos de todos os Adquirentes e Intermediários (Stone, Sicoob, Bee2Pay, etc).
            </p>
          </div>
          <button className="btn btn-primary" style={{ padding: '12px 24px', fontSize: 14 }} onClick={() => setShowImport(true)}>
            📥 Importar Arquivo
          </button>
        </div>

        <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--color-border)' }}>
          <button 
            style={{ padding: '12px 20px', background: 'none', border: 'none', borderBottom: activeTab === 'overview' ? '3px solid var(--color-primary)' : '3px solid transparent', color: activeTab === 'overview' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'overview' ? 700 : 500, cursor: 'pointer', fontSize: 14 }}
            onClick={() => setActiveTab('overview')}
          >
            📊 Visão Geral e Registros
          </button>
          <button 
            style={{ padding: '12px 20px', background: 'none', border: 'none', borderBottom: activeTab === 'config' ? '3px solid var(--color-primary)' : '3px solid transparent', color: activeTab === 'config' ? 'var(--color-primary)' : 'inherit', fontWeight: activeTab === 'config' ? 700 : 500, cursor: 'pointer', fontSize: 14 }}
            onClick={() => setActiveTab('config')}
          >
            ⚙️ Adquirentes
          </button>
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 24px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <select className="form-input" style={{ width: 200, fontWeight: 700 }} value={selectedAdq} onChange={e => setSelectedAdq(e.target.value)}>
                <option value="todos">Todos (Consolidado)</option>
                {adquirentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
              
              <div className="search-input-wrapper">
                <span className="search-icon">🔍</span>
                <input 
                  type="text" className="form-input search-input" placeholder="Buscar na tabela..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ width: 220 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                Total Filtrado: <span style={{ color: totalValor >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>{fmtCurrency(totalValor)}</span>
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ color: 'var(--color-red)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                disabled={filteredData.length === 0}
                onClick={() => {
                  if (window.confirm(`Tem certeza que deseja EXCLUIR os ${filteredData.length} registros listados?`)) {
                     deleteMovements(filteredData.map(r => r.id));
                  }
                }}
              >
                🗑️ Esvaziar Tabela
              </button>
            </div>
          </div>

          <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
               <div style={{ padding: 40, textAlign: 'center', opacity: 0.6 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 120 }}>Data</th>
                    <th>Descrição ou Canal</th>
                    <th style={{ width: 180 }}>ID Transação (Anti-duplicação)</th>
                    {selectedAdq === 'todos' && <th style={{ width: 120 }}>Origem</th>}
                    <th style={{ textAlign: 'right', width: 150 }}>Valor Líquido (R$)</th>
                    <th style={{ textAlign: 'center', width: 100 }}>Status</th>
                    <th style={{ textAlign: 'right', width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map(row => (
                    <tr key={row.id} style={{ opacity: row.reconciled ? 0.5 : 1 }}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                        {row.data ? row.data.split('-').reverse().join('/') : '—'}
                      </td>
                      <td>{row.descricao || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, opacity: 0.7 }}>{row.stoneId || row.id || '—'}</td>
                      {selectedAdq === 'todos' && (
                        <td><span className="badge badge-purple" style={{ textTransform: 'uppercase' }}>{row.adquirente_id || 'Stone'}</span></td>
                      )}
                      <td style={{ textAlign: 'right', fontWeight: 600, color: row.valor < 0 ? 'var(--color-red)' : 'var(--color-text)' }}>
                        {fmtCurrency(row.valor)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {row.reconciled ? <span className="badge badge-green">Reconciliado</span> : <span className="badge badge-accent">{row.status || 'Pendente'}</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className="btn-icon danger" 
                          onClick={() => {
                            if (window.confirm('Excluir este registro permanentemente?')) deleteMovements([row.id]);
                          }}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredData.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 60, opacity: 0.5 }}>Nenhum movimento encontrado banco de dados '{selectedAdq}'.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: 16 }}>Intermediários Ativos (Adquirentes)</h3>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
            Estes são os intermediários disponíveis para importação de relatórios Excel. Novas tabelas no banco de dados serão alocadas automaticamente usando o ID.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16, marginBottom: 32 }}>
            {adquirentes.map(adq => (
              <div key={adq.id} style={{ padding: 16, border: '1px solid var(--color-border)', borderRadius: 8, background: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{adq.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>Tabela: cartoes_{adq.id}</div>
                </div>
                <button className="btn-icon danger" onClick={() => handleRemoveAdq(adq.id)}>🗑️</button>
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--color-bg)', padding: 20, borderRadius: 8, border: '1px dashed var(--color-border)' }}>
             <h4 style={{ marginBottom: 12 }}>+ Adicionar Novo Adquirente</h4>
             <div style={{ display: 'flex', gap: 12 }}>
                <input type="text" className="form-input" placeholder="Ex. PagSeguro, Cielo, Rede" value={newAdqNome} onChange={e => setNewAdqNome(e.target.value)} style={{ flex: 1, maxWidth: 300 }} />
                <button className="btn btn-secondary" onClick={handleAddAdq}>Criar Intermediário</button>
             </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportCartoesModal 
          activeEmpresaId={empresaId}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
