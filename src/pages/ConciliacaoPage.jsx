import React, { useState, useEffect, useMemo } from 'react';
import ReconciliationWorkspace from '../components/conciliacao/ReconciliationWorkspace';
import { getDB, dbSet } from '../utils/db';
import { runReconciliation } from '../utils/reconciliation';

export default function ConciliacaoPage({ titulo, grupo, empresaId, modulos }) {
  const DATA_SOURCES = useMemo(() => modulos.map(m => ({ id: m.key, label: m.label, dbKey: m.dbKey, data: m.data || [] })), [modulos]);

  const [sourceA, setSourceA] = useState('');
  const [sourceB, setSourceB] = useState('');
  
  const [filterA, setFilterA] = useState('');
  const [filterB, setFilterB] = useState('');

  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const [mapA, setMapA] = useState({ dateKey: 'data', valueKey: 'valor', descKey: 'descricao' });
  const [mapB, setMapB] = useState({ dateKey: 'data', valueKey: 'valor', descKey: 'descricao' });

  const [dateTolerance, setDateTolerance] = useState(2); // days
  const [valueTolerance, setValueTolerance] = useState(3.0); // %

  const [fieldsA, setFieldsA] = useState(['data', 'valor', 'descricao']);
  const [fieldsB, setFieldsB] = useState(['data', 'valor', 'descricao']);

  const [presets, setPresets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState('');

  // Load Presets
  useEffect(() => {
    try {
       const saved = JSON.parse(localStorage.getItem(`conciliacao_presets_${grupo}`) || '[]');
       setPresets(saved);
    } catch(e) {}
  }, [grupo]);

  const handleSavePreset = () => {
    const name = window.prompt("Nome da configuração? (Ex. 'Cartões vs NFs')");
    if (!name) return;
    const newPreset = {
       id: new Date().getTime(),
       name,
       sourceA, sourceB, filterA, filterB, mapA, mapB, dateTolerance, valueTolerance, dataInicio, dataFim
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem(`conciliacao_presets_${grupo}`, JSON.stringify(updated));
    setSelectedPreset(newPreset.id);
  };

  const applyPreset = (pid) => {
    setSelectedPreset(pid);
    const p = presets.find(x => String(x.id) === String(pid));
    if (p) {
       setSourceA(p.sourceA); setSourceB(p.sourceB);
       setFilterA(p.filterA); setFilterB(p.filterB);
       setMapA(p.mapA); setMapB(p.mapB);
       setDateTolerance(p.dateTolerance); setValueTolerance(p.valueTolerance);
       setDataInicio(p.dataInicio || ''); setDataFim(p.dataFim || '');
    }
  };

  useEffect(() => {
    if (!sourceA) return;
    const module = DATA_SOURCES.find(m => m.id === sourceA);
    if (module && module.data.length > 0) {
      const item = module.data[0];
      const keys = Object.keys(item).filter(k => !['reconciled', 'matchedId', 'matchedSource', 'reconciledAt', 'id', 'empresaId'].includes(k));
      const extras = item.original ? Object.keys(item.original) : [];
      setFieldsA(Array.from(new Set([...keys, ...extras])).sort());
    } else {
      setFieldsA(['data', 'valor', 'descricao']);
    }
  }, [sourceA, DATA_SOURCES]);

  useEffect(() => {
    if (!sourceB) return;
    const module = DATA_SOURCES.find(m => m.id === sourceB);
    if (module && module.data.length > 0) {
      const item = module.data[0];
      const keys = Object.keys(item).filter(k => !['reconciled', 'matchedId', 'matchedSource', 'reconciledAt', 'id', 'empresaId'].includes(k));
      const extras = item.original ? Object.keys(item.original) : [];
      setFieldsB(Array.from(new Set([...keys, ...extras])).sort());
    } else {
       setFieldsB(['data', 'valor', 'descricao']);
    }
  }, [sourceB, DATA_SOURCES]);

  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);

  const handleProcess = async () => {
    setProcessing(true);
    setResults(null);
    try {
      const modA = DATA_SOURCES.find(m => m.id === sourceA);
      const modB = DATA_SOURCES.find(m => m.id === sourceB);
      
      const textMatch = (v, q) => !q || JSON.stringify(v).toLowerCase().includes(q.toLowerCase());

      const dateMatch = (v, dateK) => {
        if (!dataInicio && !dataFim) return true;
        let d = v[dateK];
        if (!d) return false;
        
        if (d.includes('/')) {
           const parts = d.split(' ')[0].split('/');
           if (parts.length === 3) d = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        if (dataInicio && d < dataInicio) return false;
        if (dataFim && d > dataFim) return false;
        return true;
      };

      const arrA = modA.data.filter(v => !v.reconciled && textMatch(v, filterA) && dateMatch(v, mapA.dateKey));
      const arrB = modB.data.filter(v => !v.reconciled && textMatch(v, filterB) && dateMatch(v, mapB.dateKey));

      const rules = { dateTolerance, valueTolerance, filterA, filterB, mapA, mapB };
      const computed = runReconciliation(arrA, arrB, rules);
      setResults({ ...computed, rules });
    } catch (e) {
      alert("Erro durante extração ou processamento: " + e.message);
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  const handleCommit = async (consolidatedPairs) => {
    if (consolidatedPairs.length === 0) return alert('Nenhum registro para salvar.');
    
    try {
      setProcessing(true);
      const modA = DATA_SOURCES.find(m => m.id === sourceA);
      const modB = DATA_SOURCES.find(m => m.id === sourceB);

      if (!modA || !modB) throw new Error("Fonte de dados inválida.");

      const dbA = getDB(empresaId, modA.dbKey);
      const dbB = getDB(empresaId, modB.dbKey);
      const now = new Date().toISOString();

      for (const pair of consolidatedPairs) {
        let { a, b } = pair;
        
        // Normalize everything to arrays for consistent processing
        const aArray = Array.isArray(a) ? a : [a];
        const bArray = Array.isArray(b) ? b : [b];

        // Create comma-separated ID lists for cross-linking
        const aIds = aArray.map(x => x.id).join(',');
        const bIds = bArray.map(x => x.id).join(',');

        for (const singleA of aArray) {
          singleA.reconciled = true;
          singleA.matchedId = bIds;
          singleA.matchedSource = sourceB;
          singleA.reconciledAt = now;
          await dbSet(dbA, singleA.id, singleA);
        }

        for (const singleB of bArray) {
          singleB.reconciled = true;
          singleB.matchedId = aIds;
          singleB.matchedSource = sourceA;
          singleB.reconciledAt = now;
          await dbSet(dbB, singleB.id, singleB);
        }
      }

      alert(`✅ Reconciliação concluída com sucesso!\n${consolidatedPairs.length} lotes/pares vinculados indissociavelmente no banco de dados.`);
      setResults(null);

    } catch (e) {
      alert("Erro ao salvar no disco permanente: " + e.message);
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="contas-page" style={{ padding: '24px' }}>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => window.history.back()} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content' }}>← Voltar</button>
      </div>
      <div className="contas-toolbar card" style={{ padding: '24px', marginBottom: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.1)' }}>
        <h2 className="overview-title" style={{ fontSize: 24, marginBottom: 8 }}>⚖️ Reconciliação Avançada — {titulo}</h2>
        <p className="overview-subtitle" style={{ fontSize: 13, opacity: 0.8 }}>
          Cruza os dados provenientes de duas fontes diferentes usando regras de tolerância em datas e valores (Lógica Fuzzy). Selecione a Fonte A e a Fonte B.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: 24 }}>
        <div className="card" style={{ padding: '24px', background: 'var(--color-bg-hover)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>📂</span> 1. Seleção de Dados
          </h3>
          
          <div style={{ padding: 16, background: 'var(--color-bg)', borderRadius: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--color-border)' }}>
             <span style={{ fontSize: 14 }}>💾 Modelos (Presets):</span>
             <select className="form-input" style={{ flex: 1, padding: '8px' }} value={selectedPreset} onChange={e => applyPreset(e.target.value)}>
                <option value="">Carregar configuração rápida...</option>
                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
             </select>
             <button className="btn btn-secondary" style={{ padding: '8px 12px' }} onClick={handleSavePreset}>Salvar Atual</button>
          </div>

          <div style={{ padding: 16, background: 'var(--color-bg-secondary)', borderRadius: 8, marginBottom: 20, border: '1px solid var(--color-border)' }}>
             <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>📅 Recorte de Período</p>
             <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, display: 'block', marginBottom: 6, fontWeight: 600 }}>De:</span>
                  <input type="date" className="form-input" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '8px' }} />
                </label>
                <label style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, display: 'block', marginBottom: 6, fontWeight: 600 }}>Até:</span>
                  <input type="date" className="form-input" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '8px' }} />
                </label>
             </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, display: 'block', marginBottom: 8, fontWeight: 600, color: 'var(--color-primary)' }}>Fonte A (Base)</span>
              <select className="form-input" style={{ width: '100%', fontSize: 14, padding: '10px 12px' }} value={sourceA} onChange={e => setSourceA(e.target.value)}>
                <option value="">Origem de dados A...</option>
                {DATA_SOURCES.map(ds => <option key={ds.id} value={ds.id}>{ds.label} ({ds.data.length})</option>)}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, display: 'block', marginBottom: 8, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Filtro Inclusão (Apenas com...)</span>
              <input type="text" className="form-input" placeholder="Ex. Venda" value={filterA} onChange={e => setFilterA(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '10px' }} />
            </label>
          </div>
          
          <div style={{ background: 'var(--color-bg-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: 24 }}>
             <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8, opacity: 0.6 }}>Mapeamento de Colunas ↔ Fonte A</p>
             <div style={{ display: 'flex', gap: 8 }}>
                <select className="form-input" style={{ flex: 1, fontSize: 12, padding: '6px' }} value={mapA.dateKey} onChange={e => setMapA({...mapA, dateKey: e.target.value})}>
                   {fieldsA.map(f => <option key={`da_${f}`} value={f}>Data: "{f}"</option>)}
                </select>
                <select className="form-input" style={{ flex: 1, fontSize: 12, padding: '6px' }} value={mapA.valueKey} onChange={e => setMapA({...mapA, valueKey: e.target.value})}>
                   {fieldsA.map(f => <option key={`va_${f}`} value={f}>Valor: "{f}"</option>)}
                </select>
                <select className="form-input" style={{ flex: 1, fontSize: 12, padding: '6px' }} value={mapA.descKey} onChange={e => setMapA({...mapA, descKey: e.target.value})}>
                   {fieldsA.map(f => <option key={`deca_${f}`} value={f}>Descr.: "{f}"</option>)}
                </select>
             </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, display: 'block', marginBottom: 8, fontWeight: 600, color: 'var(--color-green)' }}>Fonte B (Confronto)</span>
              <select className="form-input" style={{ width: '100%', fontSize: 14, padding: '10px 12px' }} value={sourceB} onChange={e => setSourceB(e.target.value)}>
                <option value="">Origem de dados B...</option>
                {DATA_SOURCES.map(ds => <option key={ds.id} value={ds.id}>{ds.label} ({ds.data.length})</option>)}
              </select>
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 12, display: 'block', marginBottom: 8, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Filtro Inclusão (Apenas com...)</span>
              <input type="text" className="form-input" placeholder="Ex. Crédito" value={filterB} onChange={e => setFilterB(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '10px' }} />
            </label>
          </div>
          
          <div style={{ background: 'var(--color-bg-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
             <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8, opacity: 0.6 }}>Mapeamento de Colunas ↔ Fonte B</p>
             <div style={{ display: 'flex', gap: 8 }}>
                <select className="form-input" style={{ flex: 1, fontSize: 12, padding: '6px' }} value={mapB.dateKey} onChange={e => setMapB({...mapB, dateKey: e.target.value})}>
                   {fieldsB.map(f => <option key={`db_${f}`} value={f}>Data: "{f}"</option>)}
                </select>
                <select className="form-input" style={{ flex: 1, fontSize: 12, padding: '6px' }} value={mapB.valueKey} onChange={e => setMapB({...mapB, valueKey: e.target.value})}>
                   {fieldsB.map(f => <option key={`vb_${f}`} value={f}>Valor: "{f}"</option>)}
                </select>
                <select className="form-input" style={{ flex: 1, fontSize: 12, padding: '6px' }} value={mapB.descKey} onChange={e => setMapB({...mapB, descKey: e.target.value})}>
                   {fieldsB.map(f => <option key={`decb_${f}`} value={f}>Descr.: "{f}"</option>)}
                </select>
             </div>
          </div>
        </div>

        <div className="card" style={{ padding: '24px', background: 'var(--color-bg-hover)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>⚙️</span> 2. Regras de Tolerância
          </h3>
          
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
               <span style={{ fontSize: 13, fontWeight: 600 }}>Tolerância de Datas (Deslocamento de tempo)</span>
               <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-primary)' }}>± {dateTolerance} dias</span>
            </div>
            <input 
              type="range" 
              min="0" max="7" step="1" 
              value={dateTolerance} 
              onChange={e => setDateTolerance(Number(e.target.value))} 
              style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.4 }}>
              Compensa atrasos fisiológicos (ex. compensação de pagamentos CC, fins de semana).
            </div>
          </div>

          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
               <span style={{ fontSize: 13, fontWeight: 600 }}>Tolerância de Valor (Delta numérico)</span>
               <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--color-green)' }}>± {valueTolerance.toFixed(1)} %</span>
            </div>
            <input 
              type="range" 
              min="0" max="10" step="0.1" 
              value={valueTolerance} 
              onChange={e => setValueTolerance(Number(e.target.value))} 
              style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--color-green)' }}
            />
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.4 }}>
              Permite combinar transações mesmo se uma taxa bancária (MDR) foi retida.
            </div>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '16px', fontSize: 14, justifyContent: 'center', boxShadow: '0 4px 12px rgba(93, 124, 242, 0.3)' }}
            disabled={!sourceA || !sourceB || processing}
            onClick={handleProcess}
          >
            {processing ? '⏳ ANALISANDO E CRUZANDO DADOS...' : '🔄 INICIAR MOTOR DE RECONCILIAÇÃO'}
          </button>
        </div>
      </div>

      {results && (
        <ReconciliationWorkspace 
          results={results} 
          onCommit={handleCommit} 
          onCancel={() => setResults(null)}
        />
      )}
    </div>
  );
}
