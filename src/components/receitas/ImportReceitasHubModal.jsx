/**
 * ImportReceitasHubModal.jsx — Multi-empresa import modal with CNPJ mapping.
 */
import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresa } from '../../context/EmpresaContext';
import { getDB, dbEntries, DB_MODULES } from '../../utils/db';

// Convert Excel serial date to YYYY-MM-DD
function excelDateToISO(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return String(v);
}

// Normalize header for comparison
function nh(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const ALIASES = {
  cnpj:      ['documento', 'cnpj', 'cgc', 'cpfcnpj', 'cnpjempresa', 'cnpjprestador', 'cnpjsocio', 'idempresa', 'estabelecimento', 'loja', 'pontodevenda', 'pvd'],
  data:      ['datadevencimento', 'datadevencimentooriginal', 'datadavenda', 'data', 'dataemissao', 'datamovimento', 'emissao', 'dtemissao', 'datanf', 'dt', 'datatransacao', 'datavenda'],
  valor:     ['valorbruto', 'valorliquido', 'valor', 'valortotal', 'vlrservico', 'valorservico', 'vlr', 'vlrmovimento', 'valorvenda', 'bruto'],
  descricao: ['produto', 'descricao', 'historico', 'desc', 'discriminacao', 'obs', 'descricaomovimento', 'servico'],
  categoria: ['categoria', 'tipo', 'tipodetransacao', 'tipotransacao', 'tipodemovimento', 'origem'],
  stoneid:   ['stoneid', 'idstone', 'id', 'transacao', 'codigo', 'codigodaoperacao', 'identificador', 'cctransactionid'],
};

function buildMapping(headerRow) {
  const map = {};
  const normHeaders = headerRow.map(h => nh(h));
  for (const [field, aliases] of Object.entries(ALIASES)) {
    // Ordine di priorita nell'array aliases
    let colIdx = -1;
    for (const alias of aliases) {
      const found = normHeaders.indexOf(alias);
      if (found !== -1) {
        colIdx = found;
        break; // Trovato il piu prioritario, fermo.
      }
    }
    if (colIdx !== -1) map[field] = colIdx;
  }
  return map;
}

export default function ImportReceitasHubModal({ onImport, onClose }) {
  const { empresas } = useEmpresa();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [mapping, setMapping] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setParsing(true);
    setDiagnostics(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // Find header row (first row with CNPJ-like or enough columns)
        let hIdx = -1;
        for (let i = 0; i < Math.min(20, rows.length); i++) {
          const row = rows[i];
          const m = buildMapping(row);
          if (m.cnpj !== undefined || row.length >= 3) {
            hIdx = i;
            break;
          }
        }

        if (hIdx === -1) {
          setDiagnostics({ error: 'Não foi possível encontrar o cabeçalho no arquivo.', headers: (rows[0] || []).join(' | ') });
          setParsing(false);
          return;
        }

        const headerRow = rows[hIdx];
        const map = buildMapping(headerRow);
        setMapping(map);

        if (map.stoneid === undefined) {
          if (!window.confirm("⚠️ COLUNA 'STONE ID' / 'TRANSACTION ID' NÃO ENCONTRADA!\n\nSem este identificador, o sistema assumirá que todas as linhas são novas e não poderá bloquear duplicatas. Risco de importação dupla elevado.\n\nDeseja prosseguir lendo o arquivo de forma cega?")) {
            setParsing(false);
            return;
          }
        }

        const missed = ['cnpj', 'data', 'valor'].filter(f => map[f] === undefined);
        if (missed.length > 0) {
          setDiagnostics({
            error:    `Colunas não identificadas: ${missed.join(', ')}`,
            headers:  headerRow.map((h, i) => `[${i}] ${h}`).join(' | ')
          });
        }

        const dataRows = rows.slice(hIdx + 1).filter(r => r.length > 0 && r[map.cnpj || 0]);
        
        const validCnpjs = new Set();
        const existingCompositeKeys = new Set();

        for (const e of empresas) {
          const c = String(e.cnpj || '').replace(/\D/g, '');
          if (c) validCnpjs.add(c);
          try {
             const dbName = getDB(e.id, DB_MODULES.ENTRADAS_CONSOLIDADO);
             const recs = await dbEntries(dbName);
             recs.forEach(([, val]) => {
               if (val.stoneId) {
                 const key = `${String(val.stoneId).trim()}|${val.data || ''}|${val.valor || 0}`;
                 existingCompositeKeys.add(key);
               }
             });
          } catch(err) { /* ignore if DB not ready */ }
        }

        const parsedValid = [];
        const parsedExcluded = [];
        const parsedDuplicates = [];

        dataRows.forEach(r => {
          const extra = {};
          headerRow.forEach((h, i) => { if (h) extra[h] = r[i]; });

          const rawCnpj = map.cnpj !== undefined ? String(r[map.cnpj] || '').replace(/\D/g, '') : '';
          const itemDate = map.data !== undefined ? excelDateToISO(r[map.data]) : '';
          const itemVal = map.valor !== undefined ? parseFloat(String(r[map.valor] || '0').replace(/\./g, '').replace(',', '.')) || 0 : 0;
          const rawStoneId = map.stoneid !== undefined ? String(r[map.stoneid] || '').trim() : '';

          const obj = {
            ...extra,
            stoneId:   rawStoneId,
            cnpj:      rawCnpj,
            data:      itemDate,
            valor:     itemVal,
            descricao: map.descricao !== undefined ? String(r[map.descricao] || '').trim() : '',
            categoria: map.categoria !== undefined ? String(r[map.categoria] || '').trim() : '',
            original: extra,
          };

          const compositeKey = `${rawStoneId}|${itemDate}|${itemVal}`;

          if (validCnpjs.has(rawCnpj)) {
             if (rawStoneId && existingCompositeKeys.has(compositeKey)) parsedDuplicates.push(obj);
             else parsedValid.push(obj);
          } else {
             // Avoid adding completely empty ghost rows from excel
             if (rawCnpj || itemDate || itemVal) parsedExcluded.push(obj);
          }
        });

        setPreview(parsedValid);
        setExcluded(parsedExcluded);
        setDuplicates(parsedDuplicates);
        
        if (parsedValid.length === 0 && parsedExcluded.length === 0) {
          setDiagnostics({ error: 'Nenhuma linha válida encontrada após o cabeçalho.', headers: headerRow.join(' | ') });
        }
      } catch (err) {
        console.error('[Hub Import] Parse error:', err);
        setDiagnostics({ error: 'Erro ao processar arquivo: ' + err.message });
      } finally {
        setParsing(false);
      }
    };
    reader.readAsBinaryString(f);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 700 }}>
        <h2 className="modal-title">📥 Importação Consolidada Hub</h2>
        
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            Carregue um arquivo Excel contendo as receitas de várias empresas. 
            O sistema usará a coluna <strong>CNPJ</strong> para distribuir os movimentos.
          </p>
          
          <div className="file-input-wrapper" style={{ border: '2px dashed var(--color-border)', borderRadius: 12, padding: 30, textAlign: 'center' }}>
            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileChange} />
            {!file && <div style={{ marginTop: 8, opacity: 0.6 }}>Clique ou arraste o arquivo aqui</div>}
          </div>
        </div>

        {diagnostics && (
          <div style={{ padding: 12, background: 'rgba(248,113,113,0.1)', border: '1px solid var(--color-red)', borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--color-red)', fontSize: 13 }}>⚠️ {diagnostics.error}</div>
            {diagnostics.headers && (
              <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7, wordBreak: 'break-all' }}>Colunas detectadas: {diagnostics.headers}</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {excluded.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 8, padding: 12, border: '1px solid var(--color-red)' }}>
              <h4 style={{ color: 'var(--color-red)', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                ❌ <span>{excluded.length} RECORD SARANNO ESCLUSI (CNPJ Sconosciuto)</span>
              </h4>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.3)', textAlign: 'left' }}>
                    <th style={{ padding: 4, color: 'var(--color-red)' }}>CNPJ Errato/Vuoto</th>
                    <th style={{ padding: 4 }}>Data</th>
                    <th style={{ padding: 4 }}>Descrizione</th>
                    <th style={{ padding: 4, textAlign: 'right' }}>Valore</th>
                  </tr>
                </thead>
                <tbody>
                  {excluded.slice(0, 50).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px dotted rgba(239, 68, 68, 0.2)' }}>
                      <td style={{ padding: 4, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-red)' }}>{p.cnpj || 'Vuoto'}</td>
                      <td style={{ padding: 4 }}>{p.data}</td>
                      <td style={{ padding: 4 }}>{p.descricao}</td>
                      <td style={{ padding: 4, textAlign: 'right' }}>{p.valor.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {excluded.length > 50 && <div style={{ textAlign: 'center', padding: 8, opacity: 0.8, color: 'var(--color-red)', fontSize: 11 }}>+ altri {excluded.length - 50} record rifiutati...</div>}
            </div>
          )}

          {duplicates.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', background: 'rgba(245, 158, 11, 0.05)', borderRadius: 8, padding: 12, border: '1px solid var(--color-orange)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ color: 'var(--color-orange)', margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠️ <span>{duplicates.length} RECORD DUPLICATI (Stone ID + Data + Valore già in sistema)</span>
                </h4>
                <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'rgba(245, 158, 11, 0.1)', padding: '4px 8px', borderRadius: 4 }}>
                  <input type="checkbox" checked={includeDuplicates} onChange={e => setIncludeDuplicates(e.target.checked)} />
                  Forza Importazione
                </label>
              </div>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(245, 158, 11, 0.3)', textAlign: 'left' }}>
                    <th style={{ padding: 4, color: 'var(--color-orange)' }}>Stone ID</th>
                    <th style={{ padding: 4 }}>CNPJ</th>
                    <th style={{ padding: 4 }}>Data</th>
                    <th style={{ padding: 4 }}>Descrizione</th>
                    <th style={{ padding: 4, textAlign: 'right' }}>Valore</th>
                  </tr>
                </thead>
                <tbody>
                  {duplicates.slice(0, 50).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px dotted rgba(245, 158, 11, 0.2)' }}>
                      <td style={{ padding: 4, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-orange)' }}>{p.stoneId}</td>
                      <td style={{ padding: 4 }}>{p.cnpj}</td>
                      <td style={{ padding: 4 }}>{p.data}</td>
                      <td style={{ padding: 4 }}>{p.descricao}</td>
                      <td style={{ padding: 4, textAlign: 'right' }}>{p.valor.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {duplicates.length > 50 && <div style={{ textAlign: 'center', padding: 8, opacity: 0.8, color: 'var(--color-orange)', fontSize: 11 }}>+ altri {duplicates.length - 50} duplicati...</div>}
            </div>
          )}

          {preview.length > 0 && (
            <div style={{ maxHeight: (excluded.length > 0 || duplicates.length > 0) ? 200 : 300, overflowY: 'auto', background: 'var(--color-bg-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--color-border)' }}>
              <h4 style={{ color: 'var(--color-green)', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                ✅ <span>{preview.length} Registros Prontos para Importação</span>
              </h4>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: 4 }}>CNPJ</th>
                    <th style={{ padding: 4 }}>Data</th>
                    <th style={{ padding: 4 }}>Descrição</th>
                    <th style={{ padding: 4, textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 50).map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: 4, fontFamily: 'var(--font-mono)' }}>{p.cnpj}</td>
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
            disabled={parsing || isImporting}
            onClick={async () => {
              if (isImporting) return;
              
              if (mapping?.cnpj === undefined) {
                return alert("❌ ERRORE CRITICO: Colonna 'CNPJ' non trovata nel file Excel!\n\nIl sistema non può smistare i movimenti alle rispettive aziende senza questa colonna. Controlla il file.");
              }
              if (mapping?.data === undefined) {
                return alert("❌ ERRORE CRITICO: Colonna 'Data' o 'Vencimento' non trovata nel file Excel!\n\nImpossibile procedere senza date valide.");
              }
              const recordsToImport = includeDuplicates ? [...preview, ...duplicates] : preview;

              if (recordsToImport.length === 0) {
                return alert("❌ ERRO: Nenhuma linha válida para importar.");
              }
              
              if (excluded.length > 0) {
                if (!window.confirm(`⚠️ TEM CERTEZA?\n\nHá ${excluded.length} registros que SERÃO EXCLUÍDOS porque seus CNPJs não correspondem a nenhuma Empresa cadastrada no sistema.\n\nClique em 'OK' para prosseguir excluindo-os, ou 'Cancelar' se quiser ajustar as empresas primeiro.`)) {
                  return;
                }
              }

              setIsImporting(true);
              // Forza il browser a disegnare "⏳ Importando..." prima di fare il lavoro pesante
              await new Promise(resolve => setTimeout(resolve, 50));
              try {
                await onImport(recordsToImport);
              } catch (err) {
                setDiagnostics({ error: 'Erro de importação: ' + err.message });
              } finally {
                setIsImporting(false);
              }
            }}
          >
            {isImporting ? '⏳ IMPORTANDO...' : parsing ? 'Processando...' : `🚀 IMPORTAR (${includeDuplicates ? preview.length + duplicates.length : preview.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
