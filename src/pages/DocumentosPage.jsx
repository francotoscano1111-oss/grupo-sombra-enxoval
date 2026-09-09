/**
 * DocumentosPage.jsx — Document management with PDF auto-matching
 *
 * 3 Tabs:
 *   1. Documenti       — all linked/dispensed document records
 *   2. Pendenti        — débito movements without any linked document
 *   3. Pasta Drive     — PDF files from folder + AUTO-MATCH engine
 *
 * Auto-Match tab layout (after running matching):
 *   ┌ ✅ Match forte (≥70 pts)  → auto-abbina candidati
 *   ├ 🟡 Match possibile (40–70) → utente conferma
 *   ├ ❌ PDF senza match         → lista orfani
 *   └ ⚠️ Movimenti senza PDF     → lista pendenti
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useDocumentos } from '../hooks/useDocumentos';
import { useExtratos } from '../hooks/useExtratos';
import { useToast } from '../context/ToastContext';
import AbbinamentoModal from '../components/documentos/AbbinamentoModal';
import * as FolderService from '../services/folderService';
import * as PdfMatch from '../services/pdfMatchingService';
import './DocumentosPage.css';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return d; }
}
function fmtCurrency(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_BADGE = {
  'Documentado': 'badge-green',
  'Dispensado':  'badge-accent',
  'Pendente':    'badge-red',
};

const CONFIDENCE_LABEL = {
  strong:   { label: '✅ Match forte',    cls: 'badge-green'  },
  possible: { label: '🟡 Match possível', cls: 'badge-yellow' },
  none:     { label: '❌ Sem match',      cls: 'badge-red'    },
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPI({ label, value, icon, color, onClick, active }) {
  return (
    <div className="kpi-card"
      style={{ borderTop: `3px solid ${color}`, cursor: onClick ? 'pointer' : 'default',
               outline: active ? `2px solid ${color}` : 'none', outlineOffset: 2, transition: 'transform .15s',
               padding: '6px 10px', minHeight: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center'
             }}
      onClick={onClick}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = 'scale(1.02)'; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <div className="kpi-header" style={{ marginBottom: 2 }}>
        <span className="kpi-label" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div className="kpi-value" style={{ color, fontSize: 18, lineHeight: 1, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DocumentosPage() {
  const { empresaId } = useParams();
  const toast = useToast();
  const { documentos, loading: docsLoading, saveDocumento, deleteDocumento, clearAllDocumentos, linkedMovimentoIds } = useDocumentos(empresaId);
  const { extratos, bulkUpdateExtratos } = useExtratos(empresaId, null);

  const [tab,          setTab]          = useState('documenti');
  const [search,       setSearch]       = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [showAbbina,   setShowAbbina]   = useState(false);
  const [abbinaMov,    setAbbinaMov]    = useState(null);
  const [abbinaFile,   setAbbinaFile]   = useState(null);
  const [previewDoc,   setPreviewDoc]   = useState(null);
  const [editingDoc,   setEditingDoc]   = useState(null);

  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  const [filterMonth, setFilterMonth] = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) {
      const d = new Date();
      saved = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }
    return saved;
  });

  const handleSetFilterMonth = (val) => {
    setFilterMonth(val);
    localStorage.setItem(FILTER_MONTH_KEY, val);
  };

  // Folder state
  const [folderName,   setFolderName]   = useState(FolderService.getFolderName());
  const [folderFiles,  setFolderFiles]  = useState([]);
  const [folderLoading,setFolderLoading]= useState(false);
  const folderSupported = FolderService.isFolderAPISupported();

  // Auto-match state
  const [filenameRules, setFilenameRules] = useState('');   // comma-separated hints
  const [matchResults,  setMatchResults]  = useState(null); // null = not run yet
  const [matchProgress, setMatchProgress] = useState({ current: 0, total: 0 });

  // ── Limpar Tudo ─────────────────────────────────────────────────────────────
  const handleLimparTudo = async () => {
    if (documentos.length === 0) { toast.info('Nenhum documento para limpar.'); return; }
    if (!window.confirm(`Limpar TODOS os ${documentos.length} documentos desta empresa?\nEsta ação não pode ser desfeita.`)) return;
    const pwd = window.prompt('🔐 Digite a senha de administrador:');
    if (pwd === null) return;
    if (pwd !== 'GS123') { toast.error('❌ Senha incorreta. Operação cancelada.'); return; }
    await clearAllDocumentos();
    toast.info('🗑️ Todos os documentos foram removidos.');
  };
  const [isMatching,    setIsMatching]    = useState(false);
  // IDs confirmed/rejected by user during match review
  const [confirmedIds,  setConfirmedIds]  = useState(new Set());
  const [rejectedIds,   setRejectedIds]   = useState(new Set());

  // Bulk Import state
  const [importingLivres, setImportingLivres] = useState(false);

  // ── Derived ────────────────────────────────────────────────────────────────
  const linkedIds = useMemo(() => linkedMovimentoIds(), [linkedMovimentoIds]);

  const filteredDocs = useMemo(() => {
    let list = [...documentos];
    if (filterMonth) {
       list = list.filter(d => {
           if (d.movimentoData) return d.movimentoData.startsWith(filterMonth);
           return true; // Keep orphans without date so they don't disappear from the general list
       });
    }

    if (filtroStatus) list = list.filter(d => d.docStatus === filtroStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.reference || '').toLowerCase().includes(q) ||
        (d.fileName  || '').toLowerCase().includes(q) ||
        (d.movimentoDescricao || '').toLowerCase().includes(q) ||
        (d.notas || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [documentos, filtroStatus, search, filterMonth]);

  const pendenti = useMemo(() =>
    extratos.filter(e => {
      const isDebit = e.tipo === 'débito' || Number(e.valor) < 0;
      const inMonth = filterMonth ? (e.data || '').startsWith(filterMonth) : true;
      const isDispensado = e.documentoId === 'DISPENSADO' || e.reconciliarDoc === false;
      return isDebit && inMonth && !linkedIds.has(e.id) && !isDispensado;
    }),
    [extratos, linkedIds, filterMonth]
  );

  const dispensadosFromRecon = useMemo(() => 
    extratos.filter(e => {
      const isDebit = e.tipo === 'débito' || Number(e.valor) < 0;
      const inMonth = filterMonth ? (e.data || '').startsWith(filterMonth) : true;
      const isDispensado = e.documentoId === 'DISPENSADO' || e.reconciliarDoc === false;
      return isDebit && inMonth && isDispensado;
    }).length,
    [extratos, filterMonth]
  );

  const kpis = useMemo(() => {
    const docsInMonth = filterMonth ? documentos.filter(d => !d.movimentoData || d.movimentoData.startsWith(filterMonth)) : documentos;
    return {
      total:        docsInMonth.length,
      documentados: docsInMonth.filter(d => d.docStatus === 'Documentado').length,
      dispensados:  dispensadosFromRecon,
      pendenti:     pendenti.length,
    };
  }, [documentos, pendenti, filterMonth, dispensadosFromRecon]);

  // ── Folder ────────────────────────────────────────────────────────────────
  const handleSelectFolder = async () => {
    try {
      const name = await FolderService.selectFolder();
      setFolderName(name);
      setMatchResults(null); // reset match on folder change
      const files = await FolderService.listPDFs();
      setFolderFiles(files);
      toast.success(`Pasta "${name}" — ${files.length} PDFs encontrados`);
    } catch { /* user cancelled */ }
  };

  const reloadFolderFiles = useCallback(async () => {
    setFolderLoading(true);
    try {
      const files = await FolderService.listPDFs();
      setFolderFiles(files);
    } catch (err) { toast.warning('Erro: ' + err.message); }
    finally { setFolderLoading(false); }
  }, [toast]);

  useEffect(() => {
    if (tab === 'pasta' && FolderService.hasFolder() && folderFiles.length === 0) {
      reloadFolderFiles();
    }
  }, [tab]);

  // ── Auto matching ─────────────────────────────────────────────────────────
  const handleRunMatch = useCallback(async () => {
    if (!FolderService.hasFolder() || folderFiles.length === 0) return;
    setIsMatching(true);
    setMatchResults(null);
    setConfirmedIds(new Set());
    setRejectedIds(new Set());
    try {
      const rules = filenameRules.split(',').map(r => r.trim()).filter(Boolean);
      const debits = extratos.filter(e => e.tipo === 'débito' || Number(e.valor) < 0);

      const results = await PdfMatch.matchPDFsToMovements(
        folderFiles,
        debits,
        rules,
        (cur, tot) => setMatchProgress({ current: cur, total: tot })
      );
      setMatchResults(results);
      toast.success(`Matching concluído: ${results.filter(r => r.confidence === 'strong').length} matches fortes encontrados`);
    } catch (err) {
      toast.error('Errore matching: ' + err.message);
    } finally {
      setIsMatching(false);
    }
  }, [folderFiles, extratos, filenameRules, toast]);

  // Auto-link all strong matches at once
  const handleAutoLinkStrong = useCallback(async () => {
    if (!matchResults) return;
    const strong = matchResults.filter(r => r.confidence === 'strong' &&
      !confirmedIds.has(r.pdfInfo.name) && !rejectedIds.has(r.pdfInfo.name));
    for (const r of strong) {
      const file = await FolderService.readFile(r.pdfInfo.handle);
      await saveDocumento({
        fileName:           file.name,
        fileSize:           file.size,
        movimentoId:        r.bestMatch.id,
        movimentoData:      r.bestMatch.data,
        movimentoValor:     r.bestMatch.valor,
        movimentoDescricao: r.bestMatch.descricao || r.bestMatch.historico,
        contaBancariaId:    r.bestMatch.contaBancariaId,
        tipo:               'NF-e',
        docStatus:          'Documentado',
      });
      setConfirmedIds(prev => new Set([...prev, r.pdfInfo.name]));
    }
    toast.success(`${strong.length} matches fortes confirmados!`);
  }, [matchResults, confirmedIds, rejectedIds, saveDocumento, toast]);

  // Confirm single match
  const confirmMatch = useCallback(async (r) => {
    const file = await FolderService.readFile(r.pdfInfo.handle);
    await saveDocumento({
      fileName:           file.name,
      fileSize:           file.size,
      movimentoId:        r.bestMatch.id,
      movimentoData:      r.bestMatch.data,
      movimentoValor:     r.bestMatch.valor,
      movimentoDescricao: r.bestMatch.descricao || r.bestMatch.historico,
      contaBancariaId:    r.bestMatch.contaBancariaId,
      tipo:               'NF-e',
      docStatus:          'Documentado',
    });
    setConfirmedIds(prev => new Set([...prev, r.pdfInfo.name]));
    toast.success(`Abbinato: ${file.name}`);
  }, [saveDocumento, toast]);

  const rejectMatch = (r) => setRejectedIds(prev => new Set([...prev, r.pdfInfo.name]));

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = async (data) => {
    await saveDocumento(editingDoc ? { ...editingDoc, ...data } : data);
    toast.success('Documento salvo!');
    setShowAbbina(false); setAbbinaMov(null); setAbbinaFile(null); setEditingDoc(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deletar este registro?')) return;
    await deleteDocumento(id);
    toast.info('Registro removido.');
  };

  const openAbbina  = (mov = null, file = null) => { setAbbinaMov(mov); setAbbinaFile(file); setEditingDoc(null); setShowAbbina(true); };
  const openEdit    = (doc)                      => { setEditingDoc(doc); setAbbinaMov(null); setAbbinaFile(null); setShowAbbina(true); };

  // ── Importar Livres ───────────────────────────────────────────────────────
  const handleImportLivres = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setImportingLivres(true);
    let imported = 0;
    let skipped = 0;
    try {
      for (let i=0; i<files.length; i++) {
        const file = files[i];
        if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) continue;
        
        // Anti-Duplication Check
        if (documentos.some(d => d.fileName === file.name)) {
          skipped++;
          continue;
        }

        let metadata = { amounts: [], dates: [], keywords: [], textPreview: '' };
        try {
          metadata = await PdfMatch.extractMetadataFromPDF(file);
        } catch(err) {
          console.warn('Failed to extract metadata for', file.name, err);
        }

        let fileDataUrl = null;
        if (file.size < 2 * 1024 * 1024) { // only store preview if < 2MB
          fileDataUrl = await new Promise(res => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(file);
          });
        }

        await saveDocumento({
          fileName: file.name,
          fileSize: file.size,
          fileDataUrl,
          tipo: 'NF-e',
          docStatus: 'Pendente',
          metadata,
          movimentoId: null,
          movimentoData: '',
          movimentoValor: 0,
          movimentoDescricao: ''
        });
        imported++;
      }
      
      if (imported > 0) {
        toast.success(`${imported} Documento(s) importado(s) com sucesso!`);
      }
      if (skipped > 0) {
        toast.info(`${skipped} documento(s) ignorado(s) (já estavam importados no sistema).`);
      }
    } catch(err) {
      toast.error('Erro na importação: ' + err.message);
    } finally {
      setImportingLivres(false);
      e.target.value = ''; // reset input
    }
  };

  // ── Exports ───────────────────────────────────────────────────────────────
  const handleExportExcel = useCallback(() => {
    const data = filteredDocs.map(d => ({
      'Reference': d.reference, 'Arquivo': d.fileName, 'Tipo': d.tipo,
      'Status': d.docStatus, 'Data Mov.': d.movimentoData,
      'Valor': d.movimentoValor, 'Descrição': d.movimentoDescricao, 'Notas': d.notas,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Documentos');
    XLSX.writeFile(wb, `documentos_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Excel exportado!');
  }, [filteredDocs, toast]);

  const handleExportPdf = useCallback(() => {
    const html = `<html><head><title>Documentos</title><style>body{font-family:Arial,sans-serif;font-size:10px}h2{margin-bottom:4px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:3px 5px}th{background:#f0f0f0;font-weight:bold}tr:nth-child(even){background:#f9f9f9}</style></head><body>
    <h2>Documentos — ${filteredDocs.length} registros (${new Date().toLocaleString('pt-BR')})</h2>
    <table><thead><tr><th>Reference</th><th>Arquivo</th><th>Tipo</th><th>Status</th><th>Data</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>
    ${filteredDocs.map(d => `<tr><td><b>${d.reference}</b></td><td>${d.fileName||'—'}</td><td>${d.tipo||'—'}</td><td>${d.docStatus}</td><td>${d.movimentoData}</td><td>${fmtCurrency(d.movimentoValor)}</td><td>${d.movimentoDescricao||'—'}</td></tr>`).join('')}
    </tbody></table></body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print();
  }, [filteredDocs]);

  if (docsLoading) return <div className="contas-loading"><div className="spinner" /></div>;

  if (importingLivres) return (
    <div className="contas-loading" style={{ flexDirection: 'column', gap: 16 }}>
      <div className="spinner" />
      <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Importando e lendo metadados dos PDFs...</div>
    </div>
  );

  // ── Match stats ───────────────────────────────────────────────────────────
  const matchStrong   = matchResults?.filter(r => r.confidence === 'strong')   ?? [];
  const matchPossible = matchResults?.filter(r => r.confidence === 'possible')  ?? [];
  const matchNone     = matchResults?.filter(r => r.confidence === 'none')      ?? [];
  const pdfLinkedNames = new Set(documentos.map(d => d.fileName));

  return (
    <div className="doc-page">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 24px 8px 24px' }}>
        <div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
            <button onClick={() => window.history.back()} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--color-border)', width: 'fit-content' }}>← Voltar</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-secondary)', padding: '4px 6px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginLeft: 4 }}>📅 Filtro Mês:</span>
              <input type="month" className="form-input" style={{ border: 'none', background: 'transparent', padding: '2px 4px', fontSize: 13, width: 'auto', outline: 'none', fontWeight: 700 }} 
                     value={filterMonth} onChange={e => handleSetFilterMonth(e.target.value)} />
            </div>
          </div>
          
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            📁 Document Hub & Auto-Match
          </h1>
          <p style={{ color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontSize: 13 }}>
            Painel principal para upload de NF-e, escaneamento em lote e associação inteligente a extratos.
          </p>
        </div>

        <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
          <input id="import-livres-input" type="file" multiple accept=".pdf" style={{ display: 'none' }} onChange={handleImportLivres} />
          
          <button 
            className="btn" 
            onClick={() => document.getElementById('import-livres-input').click()}
            style={{ 
              background: 'var(--color-orange, #f97316)',
              color: '#fff',
              border: 'none',
              padding: '10px 24px', 
              fontSize: 15, 
              fontWeight: 700, 
              display: 'flex', 
              gap: 8, 
              alignItems: 'center', 
              boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)',
              borderRadius: 8
            }}
          >
            📥 Importar Livres (PDFs)
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="doc-kpi-strip">
        <KPI label="Documentos"  value={kpis.total}        icon="📁" color="var(--color-accent)" onClick={() => setFiltroStatus('')} />
        <KPI label="Documentados" value={kpis.documentados} icon="✅" color="var(--color-green)"
          active={filtroStatus === 'Documentado'} onClick={() => setFiltroStatus(f => f === 'Documentado' ? '' : 'Documentado')} />
        <KPI label="Dispensados"  value={kpis.dispensados}  icon="✓"  color="var(--color-accent)" />
        <KPI label="Pendentes"    value={kpis.pendenti}     icon="⚠️" color="var(--color-red)"   onClick={() => setTab('pendenti')} />
      </div>

      {/* Tabs */}
      <div>
        <div className="doc-tabs">
          {[
            { key: 'documenti', label: '📁 Documentos' },
            { key: 'pendenti',  label: '⚠️ Pendentes', badge: kpis.pendenti || null },
            { key: 'pasta',     label: '📂 Pasta Drive + Auto-Match' },
          ].map(t => (
            <button key={t.key} className={`doc-tab-btn ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}>
              {t.label}
              {t.badge ? <span className="doc-tab-badge">{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {/* ── Tab: Documenti ── */}
        {tab === 'documenti' && (
          <>
            <div className="card doc-toolbar" style={{ marginTop: 12 }}>
              <input className="form-input" style={{ flex: 1, minWidth: 200 }}
                placeholder="🔍 Reference, arquivo, descrição, notas..." value={search} onChange={e => setSearch(e.target.value)} />
              <select className="form-input" style={{ width: 155 }} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                <option value="">Todos os status</option>
                <option value="Documentado">Documentado</option>
                <option value="Dispensado">Dispensado</option>
              </select>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{filteredDocs.length} registro{filteredDocs.length !== 1 ? 's' : ''}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn btn-danger btn-sm" onClick={handleLimparTudo} title="Apagar todos os documentos">🗑️ Limpar Tudo</button>
                <button className="btn btn-ghost btn-sm" onClick={handleExportExcel}>📊 Excel</button>
                <button className="btn btn-ghost btn-sm" onClick={handleExportPdf}>🖨️ PDF</button>
                <button className="btn btn-secondary btn-sm" style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)' }} onClick={() => window.open('/SombraScanner.html', '_blank')}>
                  📸 Sombra Scan
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => openAbbina()}>+ Vincular</button>
              </div>
            </div>
            <div className="card doc-table-container">
              <table className="data-table">
                <thead><tr>
                  <th>Reference</th><th>Arquivo</th><th>Tipo</th><th>Data Mov.</th>
                  <th style={{ textAlign: 'right' }}>Valor</th><th>Descrição</th><th>Status</th><th>Ações</th>
                </tr></thead>
                <tbody>
                  {filteredDocs.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}>{d.reference}</td>
                      <td style={{ maxWidth: 180 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>📄</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={d.fileName}>{d.fileName || '—'}</span>
                          {d.metadata && <span className="badge badge-accent" style={{ fontSize: 9, padding: '2px 4px' }} title="Metadati estratti per Auto-Match">🤖 Lido</span>}
                          {d.fileDataUrl && <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setPreviewDoc(d)}>👁</button>}
                        </span>
                      </td>
                      <td><span className="badge badge-purple">{d.tipo || '—'}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDate(d.movimentoData)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-red)' }}>{fmtCurrency(d.movimentoValor)}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={d.movimentoDescricao}>{d.movimentoDescricao || '—'}</td>
                      <td><span className={`badge ${STATUS_BADGE[d.docStatus] || 'badge-accent'}`}>{d.docStatus}</span></td>
                      <td><div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => handleDelete(d.id)}>×</button>
                      </div></td>
                    </tr>
                  ))}
                  {filteredDocs.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-muted)', fontSize: 13 }}>
                      {documentos.length === 0 ? 'Nenhum documento — clique "+ Vincular" ou use a aba Pasta Drive' : 'Nenhum resultado'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── Tab: Pendenti ── */}
        {tab === 'pendenti' && (
          <div className="card doc-table-container" style={{ marginTop: 12 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>⚠️ Movimenti senza documento</span>
              <span className="badge badge-red">{pendenti.length}</span>
            </div>
            <table className="data-table">
              <thead><tr><th>Data</th><th>Descrição</th><th style={{ textAlign: 'right' }}>Valor</th><th>Banco</th><th>Ações</th></tr></thead>
              <tbody>
                {pendenti.map(m => (
                  <tr key={m.id} className="doc-pendente-row">
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDate(m.data)}</td>
                    <td>{m.descricao || m.historico || '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-red)', fontWeight: 600 }}>{fmtCurrency(m.valor)}</td>
                    <td style={{ fontSize: 12 }}>{m.contaBancariaNome || '—'}</td>
                    <td><div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => openAbbina(m)}>📎 Documentar</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-text-muted)' }}
                        onClick={() => bulkUpdateExtratos([m.id], { reconciliarDoc: false, conciliadoOut: true, documentoId: 'DISPENSADO' }).then(() => toast.info('Movimento dispensado.'))}>
                        ✓ Dispensar
                      </button>
                    </div></td>
                  </tr>
                ))}
                {pendenti.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-green)', fontSize: 14, fontWeight: 600 }}>
                    ✅ Todos os movimentos documentados!
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Tab: Pasta Drive + Auto-Match ── */}
        {tab === 'pasta' && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {!folderSupported && (
              <div className="doc-api-banner">
                ⚠️ File System Access API non supportata. Usa Chrome o Edge.
              </div>
            )}

            {folderSupported && (
              <div className="doc-folder-header">
                <span style={{ fontSize: 28 }}>📂</span>
                <div style={{ flex: 1 }}>
                  <div className="doc-folder-name">{folderName ?? 'Nenhuma pasta selecionada'}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {folderName ? `${folderFiles.length} PDF${folderFiles.length !== 1 ? 's' : ''} na pasta` : 'Seleciona a pasta do Google Drive (ex: G:/Il mio Drive/Arcoiris/NFs/)'}
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={handleSelectFolder}>
                  📁 {folderName ? 'Mudar Pasta' : 'Selecionar Pasta'}
                </button>
                {folderName && <button className="btn btn-ghost btn-sm" onClick={reloadFolderFiles} disabled={folderLoading}>🔄</button>}
              </div>
            )}

            {/* ── Auto-match controls ── */}
            {folderSupported && folderName && (
              <div className="card" style={{ padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🤖 Auto-Match PDF → Movimenti Bancari</div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: 1, minWidth: 200, margin: 0 }}>
                    <label className="form-label">Regole filename (opzionale, separato da virgola)</label>
                    <input className="form-input" placeholder="es: NF-, NOTA, FATURA, 2026..." value={filenameRules}
                      onChange={e => setFilenameRules(e.target.value)} />
                  </div>
                  <button className="btn btn-primary" onClick={handleRunMatch} disabled={isMatching || folderFiles.length === 0}>
                    {isMatching
                      ? `⏳ Analisando ${matchProgress.current}/${matchProgress.total}...`
                      : `🔍 Analisar ${folderFiles.length} PDFs`}
                  </button>
                  {matchResults && matchStrong.filter(r => !confirmedIds.has(r.pdfInfo.name) && !rejectedIds.has(r.pdfInfo.name)).length > 0 && (
                    <button className="btn btn-secondary" onClick={handleAutoLinkStrong}>
                      ✅ Confirmar todos os matches fortes ({matchStrong.filter(r => !confirmedIds.has(r.pdfInfo.name) && !rejectedIds.has(r.pdfInfo.name)).length})
                    </button>
                  )}
                </div>

                {/* Match progress bar */}
                {isMatching && (
                  <div style={{ marginTop: 12, background: 'var(--color-bg-hover)', borderRadius: 6, height: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--color-accent)', borderRadius: 6, transition: 'width .3s',
                      width: matchProgress.total > 0 ? `${(matchProgress.current / matchProgress.total * 100).toFixed(0)}%` : '0%' }} />
                  </div>
                )}
              </div>
            )}

            {/* ── Match results ── */}
            {matchResults && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Summary strip */}
                <div style={{ display: 'flex', gap: 12 }}>
                  {[
                    { label: '✅ Fortes', value: matchStrong.length,  color: 'var(--color-green)' },
                    { label: '🟡 Possíveis', value: matchPossible.length, color: 'var(--color-yellow)' },
                    { label: '❌ Sem correspondência', value: matchNone.length, color: 'var(--color-red)' },
                    { label: '⚠️ Mov. sem PDF', value: pendenti.length, color: 'var(--color-red)' },
                  ].map(s => (
                    <div key={s.label} className="kpi-card" style={{ flex: 1, borderTop: `3px solid ${s.color}` }}>
                      <div className="kpi-label">{s.label}</div>
                      <div className="kpi-value" style={{ color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Strong matches */}
                {matchStrong.length > 0 && (
                  <MatchSection title="✅ Match Forte (≥70 pts)" results={matchStrong}
                    confirmedIds={confirmedIds} rejectedIds={rejectedIds}
                    onConfirm={confirmMatch} onReject={rejectMatch} onManual={openAbbina}
                    pdfLinkedNames={pdfLinkedNames} />
                )}

                {/* Possible matches */}
                {matchPossible.length > 0 && (
                  <MatchSection title="🟡 Match Possível (40–70 pts)" results={matchPossible}
                    confirmedIds={confirmedIds} rejectedIds={rejectedIds}
                    onConfirm={confirmMatch} onReject={rejectMatch} onManual={openAbbina}
                    pdfLinkedNames={pdfLinkedNames} />
                )}

                {/* No match — orphan PDFs */}
                {matchNone.length > 0 && (
                  <div className="card">
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 13 }}>
                      ❌ PDF sem movimento correspondente ({matchNone.length})
                    </div>
                    <table className="data-table">
                      <thead><tr><th>Arquivo PDF</th><th>Tamanho</th><th>Data</th><th>Ação</th></tr></thead>
                      <tbody>
                        {matchNone.map((r, i) => (
                          <tr key={i} style={{ opacity: pdfLinkedNames.has(r.pdfInfo.name) ? 0.5 : 1 }}>
                            <td>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                📄 <span title={r.pdfInfo.name}>{r.pdfInfo.name}</span>
                                {pdfLinkedNames.has(r.pdfInfo.name) && <span className="badge badge-green" style={{ fontSize: 10 }}>✅ Abbinato</span>}
                              </span>
                            </td>
                            <td style={{ fontSize: 12 }}>{FolderService.fmtFileSize(r.pdfInfo.size)}</td>
                            <td style={{ fontSize: 12 }}>{fmtDate((r.pdfInfo.lastModified || '').slice(0, 10))}</td>
                            <td>
                              {!pdfLinkedNames.has(r.pdfInfo.name) && (
                                <button className="btn btn-ghost btn-sm" onClick={async () => {
                                  const file = await FolderService.readFile(r.pdfInfo.handle);
                                  openAbbina(null, file);
                                }}>📎 Vincular manualmente</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Movements without PDF */}
                {pendenti.length > 0 && (
                  <div className="card">
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 13 }}>
                      ⚠️ Movimentos bancários sem documento ({pendenti.length}) — vá à aba Pendentes para gerenciá-los
                    </div>
                    <table className="data-table" style={{ fontSize: 12 }}>
                      <thead><tr><th>Data</th><th>Descrição</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                      <tbody>
                        {pendenti.slice(0, 10).map(m => (
                          <tr key={m.id} className="doc-pendente-row">
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtDate(m.data)}</td>
                            <td>{m.descricao || m.historico || '—'}</td>
                            <td style={{ textAlign: 'right', color: 'var(--color-red)', fontFamily: 'var(--font-mono)' }}>{fmtCurrency(m.valor)}</td>
                          </tr>
                        ))}
                        {pendenti.length > 10 && (
                          <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                            ... e outros {pendenti.length - 10} movimentos. <button className="btn btn-ghost btn-sm" onClick={() => setTab('pendenti')}>Ver todos</button>
                          </td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Before matching: show simple file grid */}
            {!matchResults && !isMatching && folderFiles.length > 0 && (
              <div className="doc-file-grid">
                {folderFiles.map((f, i) => (
                  <div key={i} className="doc-file-card">
                    <div className="doc-file-icon">📄</div>
                    <div className="doc-file-name" title={f.name}>{f.name}</div>
                    <div className="doc-file-meta">{FolderService.fmtFileSize(f.size)} · {fmtDate(f.lastModified.slice(0, 10))}</div>
                    {pdfLinkedNames.has(f.name)
                      ? <span className="badge badge-green" style={{ fontSize: 11 }}>✅ Vinculado</span>
                      : <button className="btn btn-primary btn-sm" style={{ marginTop: 4 }} onClick={async () => {
                          const file = await FolderService.readFile(f.handle);
                          openAbbina(null, file);
                        }}>📎 Vincular</button>
                    }
                  </div>
                ))}
              </div>
            )}

            {folderLoading && <div style={{ textAlign: 'center', padding: 40 }}>⏳ Listando PDFs...</div>}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAbbina && (
        <AbbinamentoModal movimento={abbinaMov} extratos={extratos} folderFile={abbinaFile}
          onSave={handleSave}
          onClose={() => { setShowAbbina(false); setAbbinaMov(null); setAbbinaFile(null); setEditingDoc(null); }} />
      )}

      {previewDoc?.fileDataUrl && (
        <div className="doc-preview-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="doc-preview-box" onClick={e => e.stopPropagation()}>
            <div className="doc-preview-header">
              <span>📄 {previewDoc.fileName}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPreviewDoc(null)} style={{ fontSize: 18 }}>×</button>
            </div>
            <iframe className="doc-preview-frame" src={previewDoc.fileDataUrl} title="PDF Preview" />
          </div>
        </div>
      )}
      
    </div>
  );
}

// ── Section component for match results ──────────────────────────────────────
function MatchSection({ title, results, confirmedIds, rejectedIds, onConfirm, onReject, onManual, pdfLinkedNames }) {
  return (
    <div className="card">
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', fontWeight: 700, fontSize: 13 }}>
        {title}
      </div>
      <table className="data-table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>PDF</th><th>Score</th><th>Motivos</th>
            <th>Movimento vinculado</th><th style={{ textAlign: 'right' }}>Valor</th><th>Data</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => {
            const isConfirmed = confirmedIds.has(r.pdfInfo.name) || pdfLinkedNames.has(r.pdfInfo.name);
            const isRejected  = rejectedIds.has(r.pdfInfo.name);
            return (
              <tr key={i} style={{ opacity: isConfirmed || isRejected ? 0.5 : 1 }}>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    📄 <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.pdfInfo.name}>{r.pdfInfo.name}</span>
                  </span>
                </td>
                <td>
                  <span className={`badge ${r.confidence === 'strong' ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: 11 }}>
                    {r.bestScore} pts
                  </span>
                </td>
                <td style={{ fontSize: 11, color: 'var(--color-text-muted)', maxWidth: 180 }}>
                  {r.bestReasons.join(' · ')}
                </td>
                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.bestMatch?.descricao || r.bestMatch?.historico || '—'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--color-red)', fontFamily: 'var(--font-mono)' }}>
                  {fmtCurrency(r.bestMatch?.valor)}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{fmtDate(r.bestMatch?.data)}</td>
                <td>
                  {isConfirmed ? <span className="badge badge-green">✅ Vinculado</span> :
                   isRejected  ? <span className="badge badge-red">✗ Rejeitado</span> :
                  (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => onConfirm(r)}>✅ Confirmar</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-text-muted)' }} onClick={() => onReject(r)}>✗</button>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { const f = await FolderService.readFile(r.pdfInfo.handle); onManual(null, f); }}>✏️</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
