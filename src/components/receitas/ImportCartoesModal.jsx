import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresa } from '../../context/EmpresaContext';
import { getDB, dbEntries, DB_MODULES } from '../../utils/db';
import { useAdquirentes } from '../../hooks/useAdquirentes';
import { parseGenericHub } from '../../utils/parsers/stoneParser';
import { parseSicoob } from '../../utils/parsers/sicoobParser';
import { parseBee2Pay } from '../../utils/parsers/bee2payParser';

const getAdquirenteDbName = (empId, adqId) => {
  if (adqId === 'stone') return getDB(empId, DB_MODULES.ENTRADAS_CONSOLIDADO);
  return getDB(empId, `cartoes_${adqId}`);
};

export default function ImportCartoesModal({ activeEmpresaId, onImport, onClose }) {
  const { empresas } = useEmpresa();
  const { adquirentes } = useAdquirentes(activeEmpresaId);
  
  const [file, setFile] = useState(null);
  const [adquirenteId, setAdquirenteId] = useState('');
  
  const [preview, setPreview] = useState([]);
  const [excluded, setExcluded] = useState([]); // If missing CNPJ context
  const [duplicates, setDuplicates] = useState([]);
  
  const [parsing, setParsing] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  // If we are inside an Empresa, we can default to importing without demanding CNPJ routing
  // If activeEmpresaId is null, we are in the Global Hub, routing by CNPJ is REQUIRED.

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    processFile(f, adquirenteId);
  };

  const handleAdqChange = (e) => {
    const val = e.target.value;
    setAdquirenteId(val);
    if (file) processFile(file, val);
  };

  const processFile = (f, adqId) => {
    if (!adqId) return;

    setParsing(true);
    setDiagnostics(null);
    setPreview([]); setExcluded([]); setDuplicates([]);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
        
        let parsedRows = [];
        if (adqId === 'sicoob') parsedRows = parseSicoob(wb);
        else if (adqId === 'bee2pay') parsedRows = parseBee2Pay(wb);
        else parsedRows = parseGenericHub(wb); // Stone or Others

        if (parsedRows.length === 0) {
          throw new Error("Nenhuma linha identificada. Verifique se o arquivo corresponde ao adquirente selecionado.");
        }

        const validCnpjs = new Set();
        const cnpjMap = {};
        for (const e of empresas) {
          const c = String(e.cnpj || '').replace(/\D/g, '');
          if (c) {
            validCnpjs.add(c);
            cnpjMap[c] = e.id;
          }
        }

        // Load existing records to detect duplicates (StoneID)
        // If we are global, we need to load from ALL databases for this adquirente?!
        // That's heavy, but necessary to block duplicates hub-wide.
        const existingCompositeKeys = new Set();
        
        for (const e of empresas) {
           // Optimization: if activeEmpresaId restricts us, only load for that company
           if (activeEmpresaId && e.id !== activeEmpresaId) continue;
           
           try {
             const dbName = getAdquirenteDbName(e.id, adqId);
             const recs = await dbEntries(dbName);
             recs.forEach(([, val]) => {
               if (val.stoneId) existingCompositeKeys.add(String(val.stoneId).trim());
             });
           } catch(err) { /* ignore empty */ }
        }

        const pValid = [];
        const pExcluded = [];
        const pDups = [];

        parsedRows.forEach(r => {
          // Determine Target Empresa ID for this row
          let targetEmpId = null;
          
          if (activeEmpresaId) {
            targetEmpId = activeEmpresaId;
          } else {
            const rawCnpj = String(r.cnpj || '').replace(/\D/g, '');
            targetEmpId = cnpjMap[rawCnpj];
          }

          if (!targetEmpId) {
            pExcluded.push({...r, reason: 'Empresa não identificada / CNPJ ausente'});
            return;
          }

          // Force the correct adquirente_id tag
          r.adquirente_id = adqId;
          r.empresaId = targetEmpId;

          if (r.stoneId && existingCompositeKeys.has(String(r.stoneId).trim())) {
             pDups.push(r);
          } else {
             pValid.push(r);
          }
        });

        setPreview(pValid);
        setExcluded(pExcluded);
        setDuplicates(pDups);
        
      } catch (err) {
        setDiagnostics({ error: 'Erro de formatação/parser: ' + err.message });
      } finally {
        setParsing(false);
      }
    };
    reader.readAsBinaryString(f);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 800 }}>
        <h2 className="modal-title">📥 Importar Cartões de Crédito</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(300px, 2fr)', gap: 16, marginBottom: 20 }}>
          <label>
            <span style={{ fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 600 }}>Adquirente/Fonte</span>
            <select className="form-input" style={{ width: '100%', padding: 12 }} value={adquirenteId} onChange={handleAdqChange}>
               <option value="">Selecione...</option>
               {adquirentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>

          <label>
            <span style={{ fontSize: 13, display: 'block', marginBottom: 6, fontWeight: 600 }}>Arquivo Excel/CSV</span>
            <div className="file-input-wrapper" style={{ border: '2px dashed var(--color-border)', borderRadius: 8, padding: 12, textAlign: 'center', opacity: adquirenteId ? 1 : 0.5 }}>
              <input type="file" accept=".xlsx, .xls, .csv" disabled={!adquirenteId} onChange={handleFileChange} />
              {!file && <div style={{ marginTop: 2, opacity: 0.6, fontSize: 12 }}>Arraste ou escolha o arquivo</div>}
            </div>
          </label>
        </div>

        {diagnostics && (
          <div style={{ padding: 12, background: 'rgba(248,113,113,0.1)', border: '1px solid var(--color-red)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--color-red)', fontSize: 13 }}>⚠️ {diagnostics.error}</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {excluded.length > 0 && (
            <div style={{ maxHeight: 150, overflowY: 'auto', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 8, padding: 12, border: '1px solid var(--color-red)' }}>
               <h4 style={{ color: 'var(--color-red)', marginBottom: 12, fontSize: 13 }}>❌ {excluded.length} LINHAS IGNORADAS ({excluded[0].reason})</h4>
            </div>
          )}

          {duplicates.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', background: 'rgba(245, 158, 11, 0.05)', borderRadius: 8, padding: 12, border: '1px solid var(--color-orange)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ color: 'var(--color-orange)', margin: 0, fontSize: 13 }}>⚠️ {duplicates.length} REGISTROS DUPLICADOS</h4>
                <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={includeDuplicates} onChange={e => setIncludeDuplicates(e.target.checked)} />
                  Forçar Importação
                </label>
              </div>
            </div>
          )}

          {preview.length > 0 && (
             <div style={{ maxHeight: 250, overflowY: 'auto', background: 'var(--color-bg-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border)' }}>
              <h4 style={{ color: 'var(--color-green)', marginBottom: 12, fontSize: 13 }}>✅ {preview.length} Registros Prontos para Importação</h4>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: 4 }}>ID Único</th>
                    <th style={{ padding: 4 }}>Data</th>
                    <th style={{ padding: 4 }}>Descrição</th>
                    <th style={{ padding: 4, textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: 4, fontFamily: 'var(--font-mono)' }}>{p.stoneId}</td>
                      <td style={{ padding: 4 }}>{p.data}</td>
                      <td style={{ padding: 4 }}>{p.descricao}</td>
                      <td style={{ padding: 4, textAlign: 'right', fontWeight: 600 }}>{p.valor.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 50 && <div style={{ textAlign: 'center', padding: 8, opacity: 0.6, fontSize: 11 }}>+ outros {preview.length - 50} registros carregados...</div>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn btn-secondary" disabled={parsing || isImporting} onClick={onClose}>Cancelar</button>
          <button 
            className="btn btn-primary" 
            disabled={parsing || isImporting || (!preview.length && !includeDuplicates)}
            onClick={async () => {
              if (isImporting) return;
              const records = includeDuplicates ? [...preview, ...duplicates] : preview;
              if (!records.length) return alert('Nenhum registro para importar.');
              
              setIsImporting(true);
              try {
                // Pass the adquirente_id to the importer hook
                await onImport(records, adquirenteId); 
              } catch (err) {
                setDiagnostics({ error: 'Erro ao salvar: ' + err.message });
              } finally {
                setIsImporting(false);
              }
            }}
          >
            {isImporting ? '⏳ Salvando...' : `🚀 IMPORTAR ${includeDuplicates ? preview.length + duplicates.length : preview.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
