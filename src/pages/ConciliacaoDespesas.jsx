/**
 * ConciliacaoDespesas.jsx — Manual reconciliation between Saídas (Extratos) and Documentos
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExtratos } from '../hooks/useExtratos';
import { useDocumentos } from '../hooks/useDocumentos';
import { useContasBancarias } from '../hooks/useContasBancarias';
import { useToast } from '../context/ToastContext';
import * as FolderService from '../services/folderService';
import * as PdfMatch    from '../services/pdfMatchingService';
import { fmtDate, getMonthStr } from '../utils/dateUtils';
import * as XLSX from 'xlsx';

function fmtCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function extractSupplierFromFilename(fileName) {
  let name = (fileName || '').replace(/\.pdf$/i, '');
  name = name.replace(/^SCAN_[\d\-_.]+_/i, '');
  // Strip trailing system stamp e.g., "_Arco-Iris_NVQL"
  name = name.replace(/_[^_]+_[A-Za-z0-9]{4}$/i, '');
  return name.replace(/_/g, ' ').trim();
}

export default function ConciliacaoDespesas() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { extratos, loading: loadingExtratos, bulkUpdateExtratos } = useExtratos(empresaId, null);
  const { documentos, saveDocumento, loading: loadingDocs } = useDocumentos(empresaId);
  const { contas } = useContasBancarias(empresaId);

  const [selSaidaIds,      setSelSaidaIds]      = useState(new Set());
  const [selDocIds,        setSelDocIds]        = useState(new Set());
  const [rejectedMatches, setRejectedMatches] = useState(new Set());
  const [dateTolerance,   setDateTolerance]   = useState(45);
  const [showAliases,     setShowAliases]     = useState(false);
  const [filterText,      setFilterText]      = useState('');
  const [filterBank,      setFilterBank]      = useState('');
  const [sortConfig,      setSortConfig]      = useState({ field: 'date', asc: false });
  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  const [filterMonth,     setFilterMonth]     = useState(() => localStorage.getItem(FILTER_MONTH_KEY) || '');   // 'YYYY-MM' or ''
  const [folderLoading,   setFolderLoading]   = useState(false);
  const folderSupported = FolderService.isFolderAPISupported();

  // ── CTP: Alias rules (persisted per empresa) ────────────────────────────────
  const ALIAS_KEY = `sombra-match-aliases-${empresaId}`;
  const [aliases, setAliases] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ALIAS_KEY) || '[]'); } catch { return []; }
  });

  const saveAliases = (updated) => {
    setAliases(updated);
    localStorage.setItem(ALIAS_KEY, JSON.stringify(updated));
  };

  /** Learn a new alias from a confirmed match (doc → saida) */
  const learnAlias = (doc, saida) => {
    try {
      // Prioritize human-written filename over OCR metadata
      let supplier = extractSupplierFromFilename(doc.fileName);
      if (!supplier || supplier.toLowerCase().startsWith('scan') || supplier.length < 3) {
        supplier = (doc.metadata?.keywords || []).find(k => k && k !== 'scanner humano');
      }
      if (!supplier) return;

      const movFull = ((saida.descricao || '') + ' ' + (saida.historico || '')).toLowerCase();
      // Extract 2–4 significant tokens (≥5 chars) from movement description
      const movTokens = movFull.split(/\s+/).filter(w => w.length >= 5);
      const movFragment = movTokens.slice(0, 4).join(' ');
      if (!movFragment) return;

      const existing = JSON.parse(localStorage.getItem(ALIAS_KEY) || '[]');
      const isDup = existing.some(a => a.docKeyword === supplier && a.movFragment === movFragment);
      if (isDup) return;

      const msg = `🧠 Deseja memorizar esta regra para o futuro?\n\nFornecedor (PDF): "${supplier}"\nBanco: "${movFragment}"\n\n(Movimentos bancários futuros com esta descrição serão associados a este fornecedor automaticamente.)`;
      if (!window.confirm(msg)) return;

      const updated = [...existing, {
        docKeyword:  supplier,
        movFragment,
        label:       `"${supplier}" → "${movFragment}"`,
        created:     new Date().toISOString().slice(0, 10)
      }];
      saveAliases(updated);
      console.info('[CTP] Learned alias:', supplier, '→', movFragment);
      toast.success('🧠 Regra de conciliação aprendida!');
    } catch(e) { console.warn('[CTP] learnAlias error', e); }
  };

  const deleteAlias = (idx) => {
    const updated = aliases.filter((_, i) => i !== idx);
    saveAliases(updated);
  };

  // Bases
  const linkedSaidaIds = useMemo(() => new Set(documentos.flatMap(d => (d.movimentoId || '').split(',').filter(Boolean))), [documentos]);
  
  const pendentesSaidasBase = useMemo(() => {
    return extratos
      .filter(e => (e.tipo === 'débito' || Number(e.valor) < 0) && !linkedSaidaIds.has(e.id) && e.reconciliarDoc === true)
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  }, [extratos, linkedSaidaIds]);

  const handleSvuotaCoda = async () => {
    if (!window.confirm('Vuoi rimuovere tutti i movimenti dalla coda di riconciliazione?')) return;
    const ids = pendentesSaidasBase.map(s => s.id);
    if (!ids.length) return;
    try {
      await bulkUpdateExtratos(ids, { reconciliarDoc: false });
      toast.info('Coda svuotata.');
    } catch(e) { toast.error('Errore: ' + e.message); }
  };

  const handleSemDocumento = async () => {
    if (selSaidaIds.size === 0) return;
    if (!window.confirm(`Tem certeza que deseja marcar ${selSaidaIds.size} movimento(s) como SEM DOCUMENTO?`)) return;
    const ids = Array.from(selSaidaIds);
    try {
      await bulkUpdateExtratos(ids, { 
        reconciliarDoc: false, 
        conciliadoOut: true,
        documentoId: 'DISPENSADO'
      });
      toast.success(`${ids.length} movimentos marcados sem documento.`);
      setSelSaidaIds(new Set());
    } catch(e) { toast.error('Erro: ' + e.message); }
  };

  const pendentesDocsBase = useMemo(() => {
    return documentos.filter(d => !d.movimentoId && d.docStatus !== 'Dispensado');
  }, [documentos]);

  const linkedDocs = useMemo(() => Object.values(documentos.filter(d => 
    d.movimentoId && d.movimentoId.split(',').some(id => extratos.some(s => s.id === id))
  )), [documentos, extratos]);

  const handleExportContabilidade = () => {
    let baseExtratos = [...extratos];
    if (filterMonth) {
      baseExtratos = baseExtratos.filter(e => (e.data || '').startsWith(filterMonth));
    }
    baseExtratos.sort((a,b) => (a.data || '').localeCompare(b.data || ''));

    if (baseExtratos.length === 0) {
      toast.error('Nenhum movimento encontrado.');
      return;
    }

    const dataExcel = baseExtratos.map(e => {
      const docsMatched = documentos.filter(d => (d.movimentoId || '').split(',').includes(e.id));
      const docsNames = docsMatched.map(d => extractSupplierFromFilename(d.fileName) || d.fileName).join('; ');
      const rawNames =  docsMatched.map(d => d.fileName || '').join('; ');

      let status = 'Pendente';
      if (docsMatched.length > 0) status = 'Conciliado (Com Doc)';
      else if (e.reconciliarDoc === false) status = 'Conciliado (Sem Doc / Dispensado)';

      const isDebito = e.tipo === 'débito' || Number(e.valor) < 0;
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
      { wch: 15 }, // Data
      { wch: 50 }, // Descrição
      { wch: 15 }, // Valor
      { wch: 35 }, // Status
      { wch: 40 }, // Fornecedor
      { wch: 60 }  // Arquivo Original
    ];

    const fileName = `Contabilidade_${empresaId}_${filterMonth || 'Total'}.xlsx`;

    // Finestra informativa obbligatoria
    alert('🔗 ATENÇÃO: Para que os LINKS dos documentos funcionem ao clicar dentro do Excel, você DEVE certificar-se de salvar o arquivo baixado exatamente na MESMA PASTA onde os seus PDFs originais estão guardados no computador!');

    XLSX.writeFile(wb, fileName);
    toast.success('📊 Arquivo contábil gerado com sucesso!');
  };

  // Available months from the Saídas queue
  const availableMonths = useMemo(() => {
    const months = new Set(pendentesSaidasBase.map(s => getMonthStr(s.data)).filter(m => m && m.length === 7));
    return [...months].sort().reverse();
  }, [pendentesSaidasBase]);

  // ── Folder import for Documentos ────────────────────────────────────────────
  const handlePickFolder = useCallback(async () => {
    if (!folderSupported) { toast.error('Este browser não suporta File System API.'); return; }
    setFolderLoading(true);
    try {
      await FolderService.selectFolder();          // opens native picker, stores handle internally
      const files = await FolderService.listPDFs(); // uses the internal dirHandle — no arg needed
      if (!files.length) { toast.info('Nenhum PDF encontrado na pasta.'); return; }
      
      let imported = 0;
      let skipped = 0;
      
      for (const pdfInfo of files) {
        // Anti-duplicate: se il file è già nei documenti (vincolato o meno), saltalo
        if (documentos.some(d => d.fileName === pdfInfo.name)) {
          skipped++;
          continue;
        }
        
        try {
          const file = await pdfInfo.handle.getFile();
          let metadata = { amounts: [], dates: [], keywords: [], textPreview: '' };
          
          try {
            metadata = await PdfMatch.extractMetadataFromPDF(file);
          } catch(metaErr) {
            console.warn('[folder import] Fallback: impossible to extract metadata from', pdfInfo.name, metaErr);
          }

          // Store small data URL for preview (< 3MB)
          let fileDataUrl = null;
          if (file.size < 3 * 1024 * 1024) {
            fileDataUrl = await new Promise(res => {
              const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file);
            });
          }
          await saveDocumento({
            fileName: file.name, fileSize: file.size, fileDataUrl,
            tipo: file.name.startsWith('SCAN_') ? 'NF-e' : 'Outro',
            docStatus: 'Pendente', metadata, movimentoId: null,
            movimentoData: '', movimentoValor: 0, movimentoDescricao: ''
          });
          imported++;
        } catch(err) { console.warn('[folder import] Critical error saving', pdfInfo.name, err); }
      }
      
      const msg = `📁 ${imported} documento(s) importado(s).` + (skipped > 0 ? ` (${skipped} já importados ignorados)` : '');
      if (imported > 0) toast.success(msg); else toast.info(msg);
      
    } catch(err) {
      if (err.name !== 'AbortError') toast.error('Erro ao acessar pasta: ' + err.message);
    } finally { setFolderLoading(false); }
  }, [folderSupported, documentos, saveDocumento, toast]);

  // ── Preview a document ───────────────────────────────────────────────────────
  const handlePreviewDoc = useCallback((doc) => {
    if (doc.fileDataUrl) {
      const w = window.open();
      w.document.write(`<html><body style="margin:0;background:#111">
        <iframe src="${doc.fileDataUrl}" style="width:100%;height:100vh;border:none"></iframe>
      </body></html>`);
      w.document.close();
    } else {
      toast.info(`📄 Anteprima non disponibile per "${doc.fileName || doc.reference}". (File > 3MB o importato senza dado URL)`);
    }
  }, [toast]);


  // State to control visibility of possible matches
  const [showPossiveis, setShowPossiveis] = useState(false);

  // ── Fuzzy supplier match (+ CTP alias check) ─────────────────────────────
  // Returns true if any keyword token partially matches the movement description,
  // OR if a stored alias rule maps doc supplier → movement description fragment.
  function fuzzySupplierMatch(keywords, movDescStr) {
    if (!keywords.length || !movDescStr) return false;
    const movLow = movDescStr.toLowerCase().replace(/[^a-záéíóúàâêôãõç\s]/gi, ' ');
    const movTokens = movLow.split(/\s+/).filter(w => w.length >= 3);

    // 1. Check stored CTP aliases first (highest priority)
    for (const alias of aliases) {
      if (!alias.docKeyword || !alias.movFragment) continue;
      const kwMatch = keywords.some(kw => kw && (
        kw.toLowerCase().includes(alias.docKeyword) ||
        alias.docKeyword.includes(kw.toLowerCase())
      ));
      if (kwMatch && movLow.includes(alias.movFragment)) return true;
    }

    // 2. Fuzzy token-level overlap
    for (const kw of keywords) {
      if (!kw || kw === 'scanner humano') continue;
      const kwTokens = kw.toLowerCase().replace(/[^a-záéíóúàâêôãõç\s]/gi, ' ')
        .split(/\s+/).filter(w => w.length >= 3);
      for (const kt of kwTokens) {
        const isMatch = movTokens.some(mt =>
          mt === kt ||
          (kt.length >= 4 && (mt.includes(kt) || kt.includes(mt)))
        );
        if (isMatch) return true;
      }
    }
    return false;
  }

  // Auto-Match Engine — New rules:
  //   • Valor match is MANDATORY (±0.02). No valor → excluded completely.
  //   • Fuzzy Fornecedor/Desc match (token-level partial overlap)
  //   • Date match within user-controlled tolerance
  //   • Perfeito (3/3): valor + fuzzy + date   → auto-confirmed
  //   • Possível (2/3): valor + (fuzzy OR date) → needs manual review
  const autoMatches = useMemo(() => {
    const perfeitos = [];
    const possiveis = [];
    const matchedDocIds = new Set();
    const matchedSaidaIds = new Set();

    // 1. Precompute Document metrics
    const docsToCheck = pendentesDocsBase
      .filter(d => d.metadata && !rejectedMatches.has(d.id))
      .map(doc => {
        const fileFallback = extractSupplierFromFilename(doc.fileName).toLowerCase();
        return {
          doc,
          id: doc.id,
          amounts:  doc.metadata.amounts  || [],
          keywords: [...(doc.metadata.keywords || []), fileFallback].filter(Boolean),
          dMsArray: (doc.metadata.dates || []).map(d => new Date(d + 'T12:00:00').getTime())
        };
      });

    // 2. Precompute Saida metrics
    const saidasToCheck = pendentesSaidasBase.map(saida => ({
      saida,
      id:       saida.id,
      movValor: Math.abs(Number(saida.valor) || 0),
      searchStr: ((saida.descricao || '') + ' ' + (saida.historico || '')).toLowerCase(),
      vMs:      saida.data ? new Date(saida.data + 'T12:00:00').getTime() : null
    }));

    // 3. O(N×M) scoring loop
    for (const d of docsToCheck) {
      let bestSaida   = null;
      let bestScore   = 0;
      let bestReasons = [];

      for (const s of saidasToCheck) {
        if (matchedSaidaIds.has(s.id)) continue;

        // ── REGOLA 1: Valor OBBLIGATORIO ────────────────────────────────────
        const hasValor = d.amounts.some(a => Math.abs(a - s.movValor) <= 0.02);
        if (!hasValor) continue; // skip immediately — no amount match, no pair

        // ── REGOLA 2: Fuzzy Fornecedor/Desc ─────────────────────────────────
        const hasFuzzy = fuzzySupplierMatch(d.keywords, s.searchStr);

        // ── REGOLA 3: Date match (within user tolerance) ─────────────────────
        const hasDate = s.vMs != null && d.dMsArray.some(dMs => {
          const diffDays = (s.vMs - dMs) / 86400000;
          return diffDays >= -7 && diffDays <= dateTolerance;
        });

        const score   = 1 + (hasFuzzy ? 1 : 0) + (hasDate ? 1 : 0); // valor always = 1
        const reasons = ['Valor', ...(hasFuzzy ? ['Fornecedor/Desc'] : []), ...(hasDate ? ['Data'] : [])];

        if (score > bestScore) {
          bestScore   = score;
          bestSaida   = s.saida;
          bestReasons = reasons;
          if (bestScore === 3) break; // perfect match — stop early
        }
      }

      if (!bestSaida) continue; // no valor match at all → excluded

      if (bestScore === 3) {
        perfeitos.push({ doc: d.doc, saida: bestSaida, matchFields: bestReasons });
        matchedDocIds.add(d.id);
        matchedSaidaIds.add(bestSaida.id);
      } else {
        // bestScore === 2 (valor + one other) → possível
        possiveis.push({ doc: d.doc, saida: bestSaida, matchFields: bestReasons });
        matchedDocIds.add(d.id);
        matchedSaidaIds.add(bestSaida.id);
      }
    }

    return { perfeitos, possiveis, matchedDocIds, matchedSaidaIds };
  }, [pendentesDocsBase, pendentesSaidasBase, rejectedMatches, dateTolerance, aliases]);

  // Handlers
  const handleLancarMotor = async () => {
    if (autoMatches.perfeitos.length === 0 && autoMatches.possiveis.length === 0) {
      toast.info('🔍 O motor analisou os PDF: Não encontrou nenhum Match (0 perfeitos, 0 possíveis). Tente alterar a Tolerância de dias na barra lateral.');
      return;
    }

    let savedCount = 0;
    if (autoMatches.perfeitos.length > 0) {
      for (const p of autoMatches.perfeitos) {
        try {
          await saveDocumento({
             ...p.doc,
             movimentoId: p.saida.id,
             movimentoData: p.saida.data || '',
             movimentoValor: p.saida.valor || 0,
             movimentoDescricao: p.saida.descricao || p.saida.historico || '',
             docStatus: 'Documentado'
          });
          learnAlias(p.doc, p.saida); // 🧠 CTP learning
          savedCount++;
        } catch(e) { console.error('Erro autosave', e); }
      }
      toast.success(`🚀 Auto-Salvataggio: ${savedCount} matches perfetti salvati! 🧠 Regras aprendidas.`);
    }

    // Mostra la UI per i 2/3 (possibili)
    if (autoMatches.possiveis.length > 0) {
      setShowPossiveis(true);
      if (savedCount === 0) {
        toast.info(`🟡 Encontrados ${autoMatches.possiveis.length} matches parciais (2/3). Revise e aceite na tabela amarela abaixo.`);
      }
    }
  };

  const listSaidasPends = pendentesSaidasBase
    .filter(s => (showPossiveis ? !autoMatches.matchedSaidaIds.has(s.id) : true))
    .filter(s => !filterMonth || getMonthStr(s.data) === filterMonth)
    .filter(s => !filterBank || s.contaBancariaId === filterBank)
    .filter(s => {
      if (!filterText) return true;
      const lower = filterText.toLowerCase();
      return (s.descricao || '').toLowerCase().includes(lower) || (s.historico || '').toLowerCase().includes(lower);
    })
    .sort((a, b) => {
      if (sortConfig.field === 'date') {
        return sortConfig.asc ? (a.data || '').localeCompare(b.data || '') : (b.data || '').localeCompare(a.data || '');
      } else if (sortConfig.field === 'valor') {
        return sortConfig.asc ? Number(a.valor) - Number(b.valor) : Number(b.valor) - Number(a.valor);
      }
      return 0;
    });

  const handleSort = (field) => {
    setSortConfig(prev => ({
      field,
      asc: prev.field === field ? !prev.asc : false
    }));
  };
  const listDocsLivres  = pendentesDocsBase.filter(d => (showPossiveis ? !autoMatches.matchedDocIds.has(d.id) : true));

  const handleManualLink = async () => {
    if (selSaidaIds.size === 0 || selDocIds.size === 0) return;
    
    // Aggregate values from selected saídas
    const selectedS = pendentesSaidasBase.filter(s => selSaidaIds.has(s.id));
    if (!selectedS.length) return;
    
    const aggregatedMovId = selectedS.map(s => s.id).join(',');
    const aggregatedValor = selectedS.reduce((sum, s) => sum + Math.abs(Number(s.valor) || 0), 0);
    const aggregatedDesc = selectedS.map(s => s.descricao || s.historico || '').join(' + ');
    const aggregatedData = selectedS.map(s => s.data || '').sort()[0] || '';

    // Link all selected docs to the aggregated saídas
    const selectedD = pendentesDocsBase.filter(d => selDocIds.has(d.id));
    
    let linkedCount = 0;
    for (const d of selectedD) {
      try {
        await saveDocumento({
          ...d,
          movimentoId: aggregatedMovId,
          movimentoData: aggregatedData,
          movimentoValor: aggregatedValor,
          movimentoDescricao: aggregatedDesc,
          docStatus: 'Documentado'
        });
        linkedCount++;
      } catch(e) { toast.error('Erro de vínculo: ' + e.message); }
    }
    if (linkedCount > 0) {
      toast.success(`✅ ${linkedCount} documento(s) vinculados a ${selectedS.length} movimento(s)!`);
      // Attempt to learn rule if 1-to-1 manual match
      if (selectedS.length === 1 && selectedD.length === 1) {
        // give React a moment to render the success toast before blocking with confirm()
        setTimeout(() => learnAlias(selectedD[0], selectedS[0]), 300);
      }
    }
    setSelSaidaIds(new Set());
    setSelDocIds(new Set());
  };

  const confirmMatch = async (match) => {
    try {
      await saveDocumento({
        ...match.doc,
        movimentoId: match.saida.id,
        movimentoData: match.saida.data || '',
        movimentoValor: match.saida.valor || 0,
        movimentoDescricao: match.saida.descricao || match.saida.historico || '',
        docStatus: 'Documentado'
      });
      learnAlias(match.doc, match.saida); // 🧠 CTP learning prompt
      toast.success('✅ Vinculado!');
    } catch(e) { toast.error('Erro: ' + e.message); }
  };

  const rejectMatch = (docId) => {
    setRejectedMatches(prev => new Set([...prev, docId]));
  };

  const handleUnlink = async (doc) => {
    if (!window.confirm('Desfazer este vínculo?')) return;
    try {
      await saveDocumento({
        ...doc,
        movimentoId: null,
        movimentoData: '',
        movimentoValor: 0,
        movimentoDescricao: '',
        docStatus: 'Pendente'
      });
      toast.info('Vínculo desfeito.');
    } catch(e) { toast.error('Erro ao desfazer: ' + e.message); }
  };

  if (loadingExtratos || loadingDocs) return <div className="contas-loading"><div className="spinner" /></div>;

  return (
    <div className="contas-page" style={{ padding: '32px 40px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => navigate(-1)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content' }}>← Voltar</button>
        <div style={{display: 'flex', gap: 12}}>
          {extratos.filter(e => !e.conciliadoOut && !e.reconciliarDoc).length > 0 && (
            <button onClick={async () => {
              const allUnconciliated = extratos.filter(e => !e.conciliadoOut && !e.reconciliarDoc);
              const ids = allUnconciliated.map(e => e.id);
              if (ids.length > 0) {
                try {
                  await bulkUpdateExtratos(ids, { reconciliarDoc: true });
                  toast.success(`🪄 Recuperadas ${ids.length} saídas ocultadas da fila.`);
                } catch(e) { toast.error('Errore: ' + e.message); }
              }
            }} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)' }}>
              📥 Atualizar fila Extratos
            </button>
          )}
          <button onClick={handleExportContabilidade} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-blue)', color: 'var(--color-blue)' }}>
            📊 Arquivo Contábil
          </button>
          <button onClick={() => setShowAliases(true)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}>
            🧠 Regras CTP ({aliases.length})
          </button>
        </div>
      </div>

      {/* Header compatto */}
      <div className="contas-toolbar card" style={{ padding: '12px 16px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <h2 className="overview-title" style={{ fontSize: 18, marginBottom: 4 }}>🔗 Conciliação: Saídas ↔ Documentos</h2>
            <p className="overview-subtitle" style={{ fontSize: 12, margin: 0, opacity: 0.7 }}>
              O sistema cruza Valor, Fornecedor e Data dos Documentos com as Saídas.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label className="form-label" style={{ margin: 0, fontSize: 12, whiteSpace: 'nowrap' }}>Tolerância (dias):</label>
              <input type="range" className="form-input" min="0" max="90" value={dateTolerance} onChange={e => setDateTolerance(Number(e.target.value))} style={{ width: '80px', height: '24px' }} />
              <span style={{ fontWeight: 600, fontSize: 12, minWidth: '30px' }}>{dateTolerance} d</span>
            </div>
            <button 
              className="btn" 
              onClick={handleLancarMotor} 
              style={{ 
                background: 'var(--color-orange, #f97316)',
                color: '#fff',
                border: 'none',
                fontWeight: 600, 
                fontSize: 13, 
                padding: '6px 16px', 
                borderRadius: 6, 
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)'
              }}
            >
              🤖 Lançar Riconciliazione Automatica
            </button>
          </div>
        </div>
      </div>

      {showPossiveis && autoMatches.possiveis.length > 0 && (

        <div className="card" style={{ marginBottom: 24, borderLeft: '4px solid var(--color-yellow)' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              🟡 Matches Possíveis (2/3) <span className="badge badge-yellow">{autoMatches.possiveis.length}</span>
            </h3>
          </div>
          <table className="data-table">
            <thead><tr><th>Sugestão de Match</th><th>Motivo</th><th>Ação</th></tr></thead>
            <tbody>
              {autoMatches.possiveis.map((m, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>📄 {m.doc.fileName || m.doc.reference}</div>
                      <div style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>→</div>
                      <div style={{ flex: 1 }}>💸 {fmtCurrency(m.saida.valor)} · {m.saida.parceiro || m.saida.descricao}</div>
                    </div>
                  </td>
                  <td><span className="badge badge-accent">{m.matchFields.join(' + ')}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => confirmMatch(m)}>✅ Aceitar</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => rejectMatch(m.doc.id)}>✗ Recusar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Manual Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>🛠️ Conciliação Manual</h3>
        <button 
          className="btn" 
          onClick={() => {
            if (selSaidaIds.size === 0 || selDocIds.size === 0) {
              toast.warning('Selecione pelo menos um movimento de saída e um documento livre para vincular.');
              return;
            }
            handleManualLink();
          }} 
          style={{ 
            background: 'var(--color-orange, #f97316)',
            color: '#fff',
            border: 'none',
            padding: '8px 24px', 
            fontSize: 14,
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)',
            borderRadius: 8
          }}
        >
          ✅ Vincular {selSaidaIds.size > 0 && selDocIds.size > 0 ? `(${selSaidaIds.size} Movimento(s) ↔ ${selDocIds.size} Documento(s))` : '(Manualmente)'}
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '500px' }}>
          {/* Header: title + month filter + svuota */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>💸 Saídas Selecionadas <span className="badge badge-yellow">{listSaidasPends.length}</span></h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Pesquisar..."
                  className="form-input"
                  style={{ fontSize: 12, padding: '4px 8px', height: 30, width: 110 }}
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                />
                <select
                  className="form-input"
                  style={{ fontSize: 12, padding: '4px 8px', height: 30, maxWidth: 130 }}
                  value={filterBank}
                  onChange={e => {
                    setFilterBank(e.target.value);
                    setSelSaidaIds(new Set());
                  }}
                >
                  <option value="">Todas as contas</option>
                  {contas.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
                <select
                  className="form-input"
                  style={{ fontSize: 12, padding: '4px 8px', height: 30, width: 130 }}
                  value={filterMonth}
                  onChange={e => { 
                    const v = e.target.value;
                    setFilterMonth(v);
                    localStorage.setItem(FILTER_MONTH_KEY, v);
                    setSelSaidaIds(new Set()); 
                  }}
                >
                  <option value="">Todos os meses</option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>
                      {new Date(m + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </option>
                  ))}
                </select>
                {selSaidaIds.size > 0 && <button className="btn btn-secondary btn-sm" onClick={handleSemDocumento} style={{ padding: '4px 8px', fontSize: 11, background: 'var(--color-bg)', color: 'var(--color-text)' }} title="Dispensar Documento">🚫 Sem Doc</button>}
                {listSaidasPends.length > 0 && <button className="btn btn-ghost btn-sm" onClick={handleSvuotaCoda} style={{ color: 'var(--color-red)', padding: '4px 8px', fontSize: 11 }}>Svuota</button>}
              </div>
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {listSaidasPends.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <p>Nenhuma Saída na fila de conciliação para este filtro.</p>
                {pendentesSaidasBase.length === 0 && extratos.filter(e => !e.conciliadoOut).length > 0 && (
                  <button 
                    className="btn btn-outline btn-sm" 
                    style={{ marginTop: 12 }}
                    onClick={async () => {
                      const allUnconciliated = extratos.filter(e => !e.conciliadoOut && !e.reconciliarDoc);
                      const ids = allUnconciliated.map(e => e.id);
                      if (ids.length > 0) {
                        try {
                          await bulkUpdateExtratos(ids, { reconciliarDoc: true });
                          toast.success(`Adicionadas ${ids.length} saídas à fila!`);
                        } catch(err) { console.error(err); }
                      }
                    }}
                  >
                    + Recuperar {extratos.filter(e => !e.conciliadoOut).length} saídas disponíveis para o motor
                  </button>
                )}
              </div>
            ) : (
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-hover)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}><tr><th onClick={() => handleSort('date')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>Venc. {sortConfig.field === 'date' ? (sortConfig.asc ? '▲' : '▼') : ''}</th><th>Descrição</th><th onClick={() => handleSort('valor')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>Valor {sortConfig.field === 'valor' ? (sortConfig.asc ? '▲' : '▼') : ''}</th><th style={{ width: 40, textAlign: 'center' }}><input type="checkbox" checked={listSaidasPends.length > 0 && listSaidasPends.every(s => selSaidaIds.has(s.id))} onChange={e => { if (e.target.checked) { setSelSaidaIds(new Set(listSaidasPends.map(s => s.id))); } else { setSelSaidaIds(new Set()); } }} /></th></tr></thead>
                <tbody>
                  {listSaidasPends.map(s => {
                    const isSelected = selSaidaIds.has(s.id);
                    return (
                    <tr key={s.id} style={{ background: isSelected ? 'var(--color-accent-dim)' : 'transparent', outline: isSelected ? '1px solid var(--color-accent)' : 'none' }}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtDate(s.data)}</td>
                      <td>{s.descricao || s.historico || '—'}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-red)' }}>{fmtCurrency(s.valor)}</td>
                      <td style={{ width: 40, textAlign: 'center' }}>
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={(e) => {
                            const next = new Set(selSaidaIds);
                            if (e.target.checked) next.add(s.id); else next.delete(s.id);
                            setSelSaidaIds(next);
                          }} 
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '500px' }}>
          {/* Header: title + folder button */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>📁 Documentos Livres <span className="badge badge-accent">{listDocsLivres.length}</span></h3>
              {folderSupported && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={handlePickFolder}
                  disabled={folderLoading}
                  title="Selecionar pasta e importar PDFs"
                  style={{ fontSize: 11 }}
                >
                  {folderLoading ? '⏳ Importando...' : '📂 Selecionar Pasta'}
                </button>
              )}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {listDocsLivres.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Nenhum Documento livre.<br/>
                <span style={{ fontSize: 11 }}>Use "📂 Selecionar Pasta" ou DOCUMENTOS &gt; Importar Livres</span>
              </div>
            ) : (
              <table className="data-table" style={{ fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg-hover)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}><tr><th style={{ width: 40 }}>Sel.</th><th>Arquivo / Referência</th><th style={{ width: 36 }}></th></tr></thead>
                <tbody>
                  {listDocsLivres.map(d => {
                    const isSelected = selDocIds.has(d.id);
                    return (
                    <tr key={d.id} style={{ background: isSelected ? 'var(--color-accent-dim)' : 'transparent', outline: isSelected ? '1px solid var(--color-accent)' : 'none' }}>
                      <td style={{ width: 40, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          onChange={(e) => {
                            const next = new Set(selDocIds);
                            if (e.target.checked) next.add(d.id); else next.delete(d.id);
                            setSelDocIds(next);
                          }}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>📄 {d.reference}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{d.fileName}</div>
                        {d.metadata && (
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#FFFFFF', marginTop: 6, background: 'rgba(255, 255, 255, 0.08)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <span style={{ color: 'var(--color-accent)' }}>💸</span> {d.metadata.amounts?.length ? d.metadata.amounts.map(fmtCurrency).join(', ') : '—'} &nbsp;&nbsp;
                            <span style={{ color: 'var(--color-accent)' }}>📅</span> {d.metadata.dates?.length ? d.metadata.dates.join(', ') : '—'} &nbsp;&nbsp;
                            <span style={{ opacity: 0.8 }}><span style={{ color: 'var(--color-accent)' }}>🔑</span> {d.metadata.keywords?.filter(k => k !== 'scanner humano').slice(0, 3).join(', ') || '—'}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          title={d.fileDataUrl ? 'Visualizar documento' : 'Sem preview disponível'}
                          style={{ fontSize: 14, opacity: d.fileDataUrl ? 1 : 0.35 }}
                          onClick={e => { e.stopPropagation(); handlePreviewDoc(d); }}
                        >👁️</button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: '500px' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 11, background: 'var(--color-bg-card)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>✅ Pares Vinculati ({linkedDocs.length})</h3>
        </div>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: '56px', zIndex: 10, background: 'var(--color-bg-card)' }}><tr><th>Data Saída</th><th>Fornec/Desc</th><th style={{ textAlign: 'right' }}>Valor Saída</th><th>PDF Vinnculato</th><th>Azioni</th></tr></thead>
          <tbody>
              {linkedDocs.map(d => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtDate(d.movimentoData)}</td>
                  <td>{d.movimentoDescricao || '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-red)' }}>{fmtCurrency(d.movimentoValor)}</td>
                  <td><b>{d.reference}</b> <span style={{ fontSize: 11 }}>{d.fileName}</span></td>
                  <td><button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => handleUnlink(d)}>Scollega</button></td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      {/* MODAL REGRAS CTP */}
      {showAliases && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '600px', maxWidth: '90%', maxHeight: '80vh', overflowY: 'hidden', padding: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>🧠 Regras Aprendidas (CTP)</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAliases(false)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
              {aliases.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Nenhuma regra aprendida ainda. Aceite um match para começar.</div>
              ) : (
                <table className="data-table" style={{ fontSize: 12 }}>
                  <thead><tr><th>Forn. PDF do Scanner</th><th>→</th><th>Descrição no Banco</th><th>Aprendido</th><th></th></tr></thead>
                  <tbody>
                    {aliases.map((a, i) => (
                      <tr key={i}>
                        <td><span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>{a.docKeyword}</span></td>
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>→</td>
                        <td><span style={{ fontFamily: 'var(--font-mono)' }}>{a.movFragment}</span></td>
                        <td style={{ color: 'var(--color-text-muted)' }}>{a.created}</td>
                        <td><button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => deleteAlias(i)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
