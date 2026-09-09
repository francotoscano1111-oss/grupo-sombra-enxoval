import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { exportToExcel, exportToPdf } from '../utils/exportUtils';
import { useEmpresa } from '../context/EmpresaContext';
import { useNfsEmitidas } from '../hooks/useNfsEmitidas';
import { useExtratos } from '../hooks/useExtratos';
import { fmtCurrency } from '../utils/formatters';
import { getDB, dbSet, DB_MODULES } from '../utils/db';
import { useToast } from '../context/ToastContext';

// Basic normalizer for text matching
function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove accents
}

function fuzzyMatch(a, b) {
  let normA = normalizeText(a).replace(/[^a-z0-9]/g, '');
  let normB = normalizeText(b).replace(/[^a-z0-9]/g, '');
  
  if (!normA || !normB) return false;
  if (normA.includes(normB) || normB.includes(normA)) return true;
  
  const skipWords = new Set(['ltda', 'ltd', 'inc', 's/a', 's.a', 'sia']);
  const wordsA = normalizeText(a).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !skipWords.has(w));
  const wordsB = normalizeText(b).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !skipWords.has(w));
  
  for (const wa of wordsA) {
    if (wordsB.some(wb => wa === wb || wa.includes(wb) || wb.includes(wa))) return true;
  }
  return false;
}

function fmtDateBr(dt) {
  if (!dt) return '';
  let d = dt.split(' ')[0];
  if (d.includes('/')) return d;
  const p = d.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return d;
}

function parseDt(dStr) {
  if (!dStr) return 0;
  let d = dStr.split(' ')[0];
  if (d.includes('/')) {
    const p = d.split('/');
    if (p.length === 3) d = `${p[2]}-${p[1]}-${p[0]}`;
  }
  const parts = d.split('-');
  if (parts.length === 3) return new Date(parts[0], parts[1]-1, parts[2]).getTime();
  return 0;
}

export default function TinusVsBancoReconciliation() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { empresas, activeEmpresa } = useEmpresa();
  const empresaContext = empresas.find(e => e.id === empresaId) || activeEmpresa;

  const { nfs, refresh: refreshNfs } = useNfsEmitidas(empresaId);
  const { extratos, refresh: refreshExtratos } = useExtratos(empresaId);

  const FILTER_MONTH_KEY = `sombra-filter-month-${empresaId}`;
  const [mesFiltro, setMesFiltro] = useState(() => {
    let saved = localStorage.getItem(FILTER_MONTH_KEY);
    if (!saved) { const d = new Date(); saved = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    return saved;
  });
  const [dataInicio, setDataInicio] = useState(() => {
    if (!mesFiltro) return '';
    const [y,m] = mesFiltro.split('-');
    return `${y}-${m}-01`;
  });
  const [dataFim, setDataFim] = useState(() => {
    if (!mesFiltro) return '';
    const [y,m] = mesFiltro.split('-');
    return `${y}-${m}-${new Date(y, parseInt(m), 0).getDate()}`;
  });
  const [toleranciaDias, setToleranciaDias] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [showRules, setShowRules] = useState(false);
  
  // Array of IDs of extrato rows the user chose to manually ignore
  const [manualBlacklist, setManualBlacklist] = useState([]);

  // Pending approval for "Yellow" proposed matches
  const [proposedGroups, setProposedGroups] = useState([]);
  
  // Results
  const [results, setResults] = useState(null);

  // Sort states
  const [sortNfs, setSortNfs] = useState({ field: 'data', asc: false });
  const [sortBancos, setSortBancos] = useState({ field: 'data', asc: false });

  // View Filter
  const [viewFilter, setViewFilter] = useState('pendentes'); // 'pendentes' | 'auditados' | 'todos'

  const handleSortNfs = (field) => setSortNfs(s => ({ field, asc: s.field === field ? !s.asc : false }));
  const handleSortBancos = (field) => setSortBancos(s => ({ field, asc: s.field === field ? !s.asc : false }));

  // ── FILTERING ──
  const filteredNfs = useMemo(() => {
    const activeCnpjRaw = String(empresaContext?.cnpj || '').replace(/\D/g, '');
    return (nfs || []).filter(n => {
      // Regra 1: CNPJ = CNPJ da Empresa
      const nfCnpjRaw = String(n.cnpjPrestador || '').replace(/\D/g, '');
      const isSameCnpj = activeCnpjRaw && nfCnpjRaw === activeCnpjRaw;
      if (!isSameCnpj) return false;

      // Note: "Em aberto" wasn't explicitly requested here by user this round, but standard logic implies we shouldn't match already fully-paid NFs twice logically unless the user specifically un-reconciles them. We do skip `reconciled = true` entries further down anyway.

      if (!dataInicio && !dataFim) return true;
      let d = n.dataEmissao; 
      if (!d) return false;
      if (d.includes('/')) {
        const parts = d.split(' ')[0].split('/');
        if (parts.length === 3) d = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      if (dataInicio && d < dataInicio) return false;
      if (dataFim && d > dataFim) return false;
      return true;
    });
  }, [nfs, dataInicio, dataFim, empresaContext]);

  const filteredExtratos = useMemo(() => {
    return (extratos || []).filter(e => {
      const v = Number(e.valor || 0);
      if (v <= 0) return false; // Solo Entrate

      // Manual Blacklist override
      if (manualBlacklist.includes(e.id)) return false;

      const desc = normalizeText(e.descricao);
      // Hard rules for yield/reverse exclusions
      if (desc.includes('rende facil') || desc.includes('rende facil')) return false;
      if (desc.includes('devolvido')) return false;
      if (desc.includes('estorno de debito') || desc.includes('estorno de debito')) return false;
      if (desc.includes('rest tributos rec fed')) return false;

      if (!dataInicio && !dataFim) return true;
      let d = e.data; 
      if (!d) return false;
      if (dataInicio && d < dataInicio) return false;
      if (dataFim && d > dataFim) return false;
      return true;
    });
  }, [extratos, dataInicio, dataFim, manualBlacklist]);

  const nfPendentes = useMemo(() => filteredNfs.filter(n => !n.reconciled).length, [filteredNfs]);
  const extratosPendentes = useMemo(() => filteredExtratos.filter(e => !e.reconciled).length, [filteredExtratos]);

  const handleToggleIgnore = (extId) => {
    setManualBlacklist(prev => prev.includes(extId) ? prev.filter(id => id !== extId) : [...prev, extId]);
  };

  const handleProcess = () => {
    setProcessing(true);
    setResults(null);
    setProposedGroups([]);
    
    setTimeout(() => {
      const candidateNfs = filteredNfs.filter(n => !n.reconciled);
      const candidateExtratos = [...filteredExtratos.filter(e => !e.reconciled)];

      const localGroups = [];
      const localProposed = [];
      const unmatchedNfs = [];

      for (const nf of candidateNfs) {
        let matchedIndex = -1;
        let proposedIndex = -1;

        for (let i = 0; i < candidateExtratos.length; i++) {
          const e = candidateExtratos[i];

          // 1. Value Match (Tinus "valorServico" vs Banco "valor")
          const diffCents = Math.abs(Math.round((nf.valorServico || 0) * 100) - Math.round((e.valor || 0) * 100));
          const isValueMatch = diffCents <= 5; // 5 cents tolerance

          // 2. Date Match (Tinus "dataEmissao" vs Banco "data")
          let isDateMatch = false;
          if (isValueMatch) {
             const nfDate = parseDt(nf.dataEmissao);
             const banDate = parseDt(e.data);
             if (nfDate && banDate) {
                const diffDays = Math.abs((nfDate - banDate) / 86400000);
                isDateMatch = diffDays <= toleranciaDias;
             }
          }

          // 3. Text Match ("Razão Social Tomador" vs "Descrição")
          let isTextMatch = false;
          if (isValueMatch && isDateMatch) {
             const nfTomador = nf.nomeTomador || '';
             const banDesc = e.descricao || '';
             if (fuzzyMatch(nfTomador, banDesc)) {
               isTextMatch = true;
             }
          }

          if (isValueMatch && isDateMatch) {
             if (isTextMatch) {
                // Perfect Match
                matchedIndex = i;
                break;
             } else {
                // Proposed Match (Yellow) -> save it up to ask user
                proposedIndex = i;
             }
          }
        }

        if (matchedIndex !== -1) {
          const matchedItem = candidateExtratos.splice(matchedIndex, 1)[0];
          localGroups.push({ id: `auto_${nf.id}`, nfs: [nf], bancos: [matchedItem], manual: false, approved: true });
        } else if (proposedIndex !== -1) {
          const matchedItem = candidateExtratos.splice(proposedIndex, 1)[0];
          localProposed.push({ id: `prop_${nf.id}`, nfs: [nf], bancos: [matchedItem], manual: false, approved: false });
        } else {
          unmatchedNfs.push(nf);
        }
      }

      setResults({
        groups: localGroups,
        unmatchedNfs,
        unmatchedBancos: candidateExtratos // The leftovers
      });
      setProposedGroups(localProposed);
      setProcessing(false);
      
      if (localGroups.length === 0 && localProposed.length === 0) {
         toast.info("Nenhuma correspondência exata ou sugerida encontrada.");
      } else {
         toast.success(`Análise concluída: ${localGroups.length} exatos, ${localProposed.length} propostas.`);
      }
    }, 300);
  };

  const handleApproveProposal = (grpId) => {
    const grp = proposedGroups.find(g => g.id === grpId);
    if (!grp) return;
    setProposedGroups(prev => prev.filter(g => g.id !== grpId));
    setResults(prev => ({
       ...prev,
       groups: [...(prev.groups || []), { ...grp, approved: true }]
    }));
  };

  const handleRejectProposal = (grpId) => {
    const grp = proposedGroups.find(g => g.id === grpId);
    if (!grp) return;
    setProposedGroups(prev => prev.filter(g => g.id !== grpId));
    setResults(prev => ({
       ...prev,
       unmatchedNfs: [...prev.unmatchedNfs, ...grp.nfs],
       unmatchedBancos: [...prev.unmatchedBancos, ...grp.bancos]
    }));
  };

  const handleUnlinkPreviewGroup = (groupId) => {
    setResults(prev => {
      if (!prev) return prev;
      const grpIndex = prev.groups.findIndex(g => g.id === groupId);
      if (grpIndex < 0) return prev;
      const grp = prev.groups[grpIndex];
      return {
        ...prev,
        groups: prev.groups.filter((_, i) => i !== grpIndex),
        unmatchedNfs: [...prev.unmatchedNfs, ...grp.nfs],
        unmatchedBancos: [...prev.unmatchedBancos, ...grp.bancos]
      };
    });
    toast.info('Pre-match desfeito! Itens voltaram para a fila.');
  };

  const handleCommit = async () => {
    if (!results || results.groups.length === 0) return;
    if (proposedGroups.length > 0) {
       toast.warning('Ainda existem propostas em amarelo pendentes de aprovação ou rejeição!');
       return;
    }
    if (!window.confirm(`Salvar definitivamente ${results.groups.length} grupos de reconciliação?`)) return;
    
    setSaving(true);
    try {
      const dbNfs = getDB(empresaId, DB_MODULES.NFS_EMITIDAS);
      const dbExt = getDB(empresaId, 'extratos'); // Make sure we use correct dbKey for extratos
      const now = new Date().toISOString();

      let count = 0;
      for (const g of results.groups) {
        const nfIds = g.nfs.map(n=>n.id).join(',');
        const bncIds = g.bancos.map(b=>b.id).join(',');

        for (const nf of g.nfs) {
           const nfUpdated = { ...nf, reconciled: true, matchedId: bncIds, matchedSource: 'extratos', reconciledAt: now };
           await dbSet(dbNfs, nfUpdated.id, nfUpdated);
        }

        for (const ban of g.bancos) {
           const banUpdated = { ...ban, reconciled: true, matchedId: nfIds, matchedSource: 'nfs_emitidas', reconciledAt: now };
           await dbSet(dbExt, banUpdated.id, banUpdated);
        }
        
        count += (g.nfs.length + g.bancos.length);
      }

      toast.success(`✅ ${count} registros reconciliados e salvos com sucesso!`);
      setResults(null);
      refreshNfs();
      refreshExtratos();
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar reconciliação: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUndoReconciliation = async (item, type) => {
    if (!window.confirm('Tem certeza que deseja desfazer a reconciliação deste grupo?')) return;
    setSaving(true);
    try {
      const dbNfs = getDB(empresaId, DB_MODULES.NFS_EMITIDAS);
      const dbExt = getDB(empresaId, 'extratos');
      const relatedIds = (item.matchedId || '').split(',').filter(Boolean);

      if (type === 'nf') {
         await dbSet(dbNfs, item.id, { ...item, reconciled: false, matchedId: null, matchedSource: null, reconciledAt: null });
         for (const rid of relatedIds) {
            const r = extratos.find(x => x.id === rid);
            if (r) await dbSet(dbExt, r.id, { ...r, reconciled: false, matchedId: null, matchedSource: null, reconciledAt: null });
         }
      } else {
         await dbSet(dbExt, item.id, { ...item, reconciled: false, matchedId: null, matchedSource: null, reconciledAt: null });
         for (const nid of relatedIds) {
            const n = nfs.find(x => x.id === nid);
            if (n) await dbSet(dbNfs, n.id, { ...n, reconciled: false, matchedId: null, matchedSource: null, reconciledAt: null });
         }
      }
      toast.info('Reconciliação desfeita.');
      setResults(null);
      refreshNfs();
      refreshExtratos();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao desfazer: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Build unified preview lists
  let displayNfs = [];
  let displayBancos = [];

  if (results) {
    const pairedNfs = [];
    const pairedBan = [];
    results.groups.forEach(g => {
       g.nfs.forEach(nf => pairedNfs.push({ ...nf, _previewState: 'green', _pairGrp: g.id }));
       g.bancos.forEach(b => pairedBan.push({ ...b, _previewState: 'green', _pairGrp: g.id }));
    });
    
    const unNfs = results.unmatchedNfs.map(n => ({ ...n, _previewState: 'gray' }));
    const unBan = results.unmatchedBancos.map(b => ({ ...b, _previewState: 'gray' }));

    displayNfs = [...unNfs, ...pairedNfs];
    displayBancos = [...unBan, ...pairedBan];
  } else {
    let nArr = [...filteredNfs];
    if (viewFilter === 'pendentes') nArr = nArr.filter(n => !n.reconciled);
    if (viewFilter === 'auditados') nArr = nArr.filter(n => n.reconciled);
    nArr.sort((a,b) => {
      if (a.reconciled !== b.reconciled) return a.reconciled ? 1 : -1;
      let cmp = 0;
      if (sortNfs.field === 'data') cmp = (a.dataEmissao||'').localeCompare(b.dataEmissao||'');
      if (sortNfs.field === 'valor') cmp = (a.valorServico||0) - (b.valorServico||0);
      return sortNfs.asc ? cmp : -cmp;
    });
    
    let bArr = [...filteredExtratos];
    if (viewFilter === 'pendentes') bArr = bArr.filter(b => !b.reconciled);
    if (viewFilter === 'auditados') bArr = bArr.filter(b => b.reconciled);
    bArr.sort((a,b) => {
      if (a.reconciled !== b.reconciled) return a.reconciled ? 1 : -1;
      let cmp = 0;
      if (sortBancos.field === 'data') cmp = (a.data||'').localeCompare(b.data||'');
      if (sortBancos.field === 'valor') cmp = (a.valor||0) - (b.valor||0);
      return sortBancos.asc ? cmp : -cmp;
    });

    displayNfs = nArr.slice(0, 150);
    displayBancos = bArr.slice(0, 150);
  }

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    if (results) {
      const dataMatch = [];
      results.groups.forEach(g => {
         const maxLen = Math.max(g.nfs.length, g.bancos.length);
         for(let i=0; i<maxLen; i++) {
            const n = g.nfs[i] || {};
            const r = g.bancos[i] || {};
            dataMatch.push({
              'Grupo ID': g.id,
              'Status': 'Match Automático',
              'TINUS Data': fmtDateBr(n.dataEmissao) || '',
              'TINUS Tomador': n.nomeTomador || '',
              'TINUS Valor': n.valorServico || '',
              'TINUS Descrição Serviço': n.descricao || '',
              'BANCO Data': r.data?.split('-').reverse().join('/') || '',
              'BANCO Descrição': r.descricao || '',
              'BANCO Valor': r.valor || '',
              'Diferença': i === 0 ? Math.abs((g.nfs.reduce((s,x)=>s+(x.valorServico||0),0)) - (g.bancos.reduce((s,x)=>s+(x.valor||0),0))) : ''
            });
         }
      });
      if (dataMatch.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataMatch), 'Grupos Reconciliados');

      const dataTinus = results.unmatchedNfs.map(n => ({
        'Status': 'NF Pendente (Sem Extrato)',
        'TINUS Data': fmtDateBr(n.dataEmissao) || '',
        'TINUS Tomador': n.nomeTomador || n.cliente || '',
        'TINUS CNPJ': n.cnpjTomador || '',
        'TINUS Valor': n.valorServico || n.valorLiquido || 0,
        'TINUS Descrição Serviço': n.descricao || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTinus.length > 0 ? dataTinus : [{'Aviso': 'Nenhuma NF Pendente'}]), 'TINUS Pendentes');

      const dataHits = results.unmatchedBancos.map(r => ({
        'Status': 'Extrato Pendente (Sem NF)',
        'BANCO Data': r.data?.split('-').reverse().join('/') || '', 
        'BANCO Descrição': r.descricao || '', 
        'BANCO Valor': r.valor || 0
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataHits.length > 0 ? dataHits : [{'Aviso': 'Nenhum Extrato Pendente'}]), 'Extratos Pendentes');
    } else {
      const dataTinus = filteredNfs.map(n => ({
        'Status': n.reconciled ? 'Conciliada' : 'Na Fila',
        'TINUS Data': fmtDateBr(n.dataEmissao) || '',
        'TINUS Tomador': n.nomeTomador || n.cliente || '',
        'TINUS CNPJ': n.cnpjTomador || '',
        'TINUS Valor': n.valorServico || n.valorLiquido || 0,
        'TINUS Descrição Serviço': n.descricao || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataTinus.length > 0 ? dataTinus : [{'Aviso': 'Nenhuma NF'}]), 'TINUS (NFs)');

      const dataHits = filteredExtratos.map(r => ({
        'Status': r.reconciled ? 'Conciliada' : (manualBlacklist.includes(r.id) ? 'Ignorada' : 'Na Fila'),
        'BANCO Data': r.data?.split('-').reverse().join('/') || '', 
        'BANCO Descrição': r.descricao || '', 
        'BANCO Valor': r.valor || 0
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataHits.length > 0 ? dataHits : [{'Aviso': 'Nenhum Extrato'}]), 'Banco (Extratos)');
    }

    XLSX.writeFile(wb, `reconciliacao_tinus_banco_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportPdf = () => {
    let html = '';
    if (results) {
      html = `<html><head><title>Reconciliação Tinus vs Banco</title>
      <style>body{font-family:Arial,sans-serif;font-size:10px} table{width:100%;border-collapse:collapse;margin-top:10px;margin-bottom:20px;} th,td{border:1px solid #ddd;padding:4px;text-align:left} th{background:#f0f0f0} .match{background:#e8f4e8} h3{margin-bottom:4px;margin-top:20px;color:#333;font-size:14px;border-bottom:2px solid #ddd;padding-bottom:4px;}</style></head><body>
        <h2>Relatório de Reconciliação Tinus vs Banco (Extratos)</h2>
        <p><b>Reconciliados:</b> ${results.groups.length} | <b>NFs Pendentes:</b> ${results.unmatchedNfs.length} | <b>Extratos Pendentes:</b> ${results.unmatchedBancos.length}</p>
        
        <h3>1. Grupos Reconciliados</h3>
        <table><thead><tr><th>NFs Associadas (TINUS)</th><th>Desc. Serviço (TINUS)</th><th>Valor Total NFs</th><th>Extratos Associados (Banco)</th><th>Valor Total Extratos</th></tr></thead><tbody>
        ${results.groups.length === 0 ? '<tr><td colspan="5">Nenhum pareamento feito.</td></tr>' : results.groups.map(g => {
          const totNf = g.nfs.reduce((s,n)=>s+(n.valorServico||0),0);
          const totRes = g.bancos.reduce((s,r)=>s+(r.valor||0),0);
          return `<tr class="match">
            <td>${g.nfs.map(n => `${fmtDateBr(n.dataEmissao)||''} - ${n.nomeTomador||''} (R$ ${n.valorServico||0})`).join('<br>')}</td>
            <td>${g.nfs.map(n => n.descricao || '—').join('<br>')}</td>
            <td><b>R$ ${totNf.toFixed(2)}</b></td>
            <td>${g.bancos.map(r => `${r.data?.split('-').reverse().join('/')||''} - ${r.descricao||''} (R$ ${r.valor||0})`).join('<br>')}</td>
            <td><b>R$ ${totRes.toFixed(2)}</b></td>
          </tr>`;
        }).join('')}
        </tbody></table>
      </body></html>`;
    } else {
      // Setup raw pdf export if needed...
      html = `<html><head><title>Dados Brutos: Tinus vs Banco</title>
      <style>body{font-family:Arial,sans-serif;font-size:10px} table{width:100%;border-collapse:collapse;margin-top:10px;margin-bottom:20px;} th,td{border:1px solid #ddd;padding:4px;text-align:left} th{background:#f0f0f0} h3{margin-bottom:4px;margin-top:20px;font-size:14px;border-bottom:2px solid #ddd;padding-bottom:4px;}</style></head><body>
      <h2>Relatório Bruto: Tinus vs Banco (Extratos)</h2><p>${filteredNfs.length} NFs | ${filteredExtratos.length} Extratos</p>
      </body></html>`;
    }
    const w = window.open('', '_blank');
    w.document.write(html); w.document.close(); w.print();
  };

  return (
    <div className="contas-page fade-in" style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header with big Analisar button on right */}
      <div className="overview-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate(`/empresa/${empresaId}/conciliacao-receitas`)} className="btn btn-secondary btn-sm" style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--color-border)' }}>← Voltar</button>
          <span style={{ fontSize: 28 }}>🏦</span>
          <div>
            <h1 className="overview-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Receitas por Competência <span style={{ fontSize: 13, opacity: 0.7, fontWeight: 500 }}>{empresaContext?.name}</span></h1>
            <p className="overview-subtitle">Reconciliação de NFs Emitidas com Recebimentos</p>
          </div>
        </div>
        <button
          className="btn pulse-anim"
          onClick={handleProcess}
          disabled={processing}
          style={{
            background: 'var(--color-green, #22c55e)', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 15, fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)', borderRadius: 8
          }}
        >
          {processing ? '⏳ Cruzando...' : '⚙️ Analisar'}
        </button>
      </div>

      {/* Top Bar Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 10 }} onClick={() => setShowRules(!showRules)}>{showRules ? 'Ocultar Regras' : '🔍 Regras'}</button>
        </div>
        
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Mês:</span>
            <input type="month" className="form-input" value={mesFiltro} style={{ padding: '0px 8px', height: 28, width: 130, fontSize: 11 }} onChange={(e) => {
              const val = e.target.value;
              setMesFiltro(val);
              if (!val) {
                localStorage.removeItem(FILTER_MONTH_KEY);
                setDataInicio('');
                setDataFim('');
                return;
              }
              localStorage.setItem(FILTER_MONTH_KEY, val);
              const [y, m] = val.split('-');
              setDataInicio(`${y}-${m}-01`);
              setDataFim(`${y}-${m}-${new Date(y, parseInt(m), 0).getDate()}`);
            }} />
          </label>
          <div style={{ height: 20, width: 1, background: 'var(--color-border)', margin: '0 4px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>De:</span>
            <input type="date" className="form-input" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ padding: '4px 8px', height: 28, fontSize: 11 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Ate:</span>
            <input type="date" className="form-input" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ padding: '4px 8px', height: 28, fontSize: 11 }} />
          </label>
          <div style={{ height: 20, width: 1, background: 'var(--color-border)', margin: '0 4px' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Diferença aceita entre Emissão e Recebimento.">
            <span style={{ fontSize: 11, fontWeight: 600, borderBottom: '1px dotted #ccc', cursor: 'help' }}>Tol. (dias):</span>
            <input type="number" min="0" step="1" className="form-input" value={toleranciaDias} onChange={e => setToleranciaDias(Number(e.target.value))} style={{ padding: '4px 8px', height: 28, width: 50, fontSize: 11 }} />
          </label>
          <div style={{ height: 20, width: 1, background: 'var(--color-border)', margin: '0 4px' }} />
          <button className="btn btn-ghost btn-sm" style={{ height: 28, padding: '0 8px', fontSize: 11 }} onClick={handleExportExcel}>📊 Excel</button>
          <button className="btn btn-ghost btn-sm" style={{ height: 28, padding: '0 8px', fontSize: 11 }} onClick={handleExportPdf}>🖨️ PDF</button>

          {results && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                if (window.confirm('Descartar análise atual?')) {
                  setResults(null);
                  setProposedGroups([]);
                }
              }} disabled={saving} style={{ color: 'var(--color-text-muted)', height: 28, fontSize: 11 }}>
                Limpar Análise
              </button>
              {results.groups.length > 0 && (
                 <button className="btn btn-primary pulse-anim" onClick={handleCommit} disabled={saving} style={{ padding: '0 12px', height: 28, fontSize: 11, background: 'var(--color-green)' }}>
                   {saving ? '⏳...' : `💾 Salvar ${results.groups.length}`}
                 </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showRules && (
        <div style={{ background: 'var(--color-bg-secondary)', padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 11, border: '1px solid var(--color-border)' }}>
          <h4 style={{ margin: '0 0 6px 0', color: 'var(--color-accent)' }}>📋 Regras da Reconciliação Receitas por Competência:</h4>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            <li><strong>Filtro Banco:</strong> Somente ENTRADAS (Valor &gt; 0). Exclui Rende Fácil, Devolvido, Estornos e Tributos Federais.</li>
            <li><strong>Filtro TINUS:</strong> Considera apenas o CNPJ coincidente.</li>
            <li><strong>Matching:</strong> Exige que o Valor bata exatamente (Tol ±0.05) e a Data de Emissão (Tinus) bata com Data Recebimento (Banco).</li>
            <li><strong>Tomada de Decisão:</strong> Grupos com divergência na string descritiva são listados em <strong style={{color:'var(--color-yellow)'}}>Amarelo</strong> para aprovação manual do time.</li>
          </ul>
        </div>
      )}

      {/* Suggested Proposals UI */}
      {proposedGroups.length > 0 && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--color-yellow)', padding: '12px 16px', borderRadius: 8, marginBottom: 12 }} className="fade-in">
          <h4 style={{ margin: '0 0 8px 0', color: 'var(--color-yellow)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>⚠️</span> {proposedGroups.length} Sugestões Pendentes de Aprovação (Match Fraco)
          </h4>
          <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
            {proposedGroups.map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--color-border)', fontSize: 12 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="badge badge-gray" style={{ minWidth: 46, textAlign: 'center' }}>TINUS</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{fmtDateBr(g.nfs[0].dataEmissao)}</strong>
                    <span>{g.nfs[0].nomeTomador}</span>
                    <strong style={{ color: 'var(--color-text)', marginLeft: 'auto' }}>{fmtCurrency(g.nfs[0].valorServico)}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span className="badge badge-gray" style={{ minWidth: 46, textAlign: 'center' }}>BANCO</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{g.bancos[0].data?.split('-').reverse().join('/')}</strong>
                    <span>{g.bancos[0].descricao}</span>
                    <strong style={{ color: 'var(--color-text)', marginLeft: 'auto' }}>{fmtCurrency(g.bancos[0].valor)}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, paddingLeft: 16 }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-red)' }} onClick={() => handleRejectProposal(g.id)}>❌ Rejeitar</button>
                  <button className="btn btn-primary btn-sm" style={{ padding: '4px 12px' }} onClick={() => handleApproveProposal(g.id)}>✓ Aprovar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View Filter Pills & Summaries */}
      {!results && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--color-bg-secondary)', padding: 4, borderRadius: 8, width: 'fit-content', border: '1px solid var(--color-border)' }}>
             <button className="btn btn-sm" style={{ border: 'none', background: viewFilter === 'pendentes' ? 'var(--color-blue)' : 'transparent', color: viewFilter === 'pendentes' ? '#fff' : 'var(--color-text-muted)' }} onClick={() => setViewFilter('pendentes')}>Somente Pendentes</button>
             <button className="btn btn-sm" style={{ border: 'none', background: viewFilter === 'auditados' ? 'var(--color-blue)' : 'transparent', color: viewFilter === 'auditados' ? '#fff' : 'var(--color-text-muted)' }} onClick={() => setViewFilter('auditados')}>Somente Auditados</button>
             <button className="btn btn-sm" style={{ border: 'none', background: viewFilter === 'todos' ? 'var(--color-blue)' : 'transparent', color: viewFilter === 'todos' ? '#fff' : 'var(--color-text-muted)' }} onClick={() => setViewFilter('todos')}>Mostrar Todos</button>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
             <div style={{ background: 'var(--color-bg-secondary)', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>TINUS ({displayNfs.length}):</span>
                <strong style={{ color: 'var(--color-text)' }}>{fmtCurrency(displayNfs.reduce((s, t) => s + (t.valor || 0), 0))}</strong>
             </div>
             <div style={{ background: 'var(--color-bg-secondary)', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>BANCO ({displayBancos.length}):</span>
                <strong style={{ color: 'var(--color-green)' }}>{fmtCurrency(displayBancos.reduce((s, h) => s + (h.valor || 0), 0))}</strong>
             </div>
          </div>
        </div>
      )}

      {/* Side-by-side Tables */}
      <div style={{ display: 'flex', gap: 24, flex: '1 1 500px', minHeight: 400 }}>
        
        {/* Left Table: Tinus */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div style={{ padding: '16px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', borderRadius: '8px 8px 0 0' }}>
            <h3 style={{ fontSize: 13, margin: 0 }}>Tinus (NFs Emitidas)</h3>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {results ? `${results.unmatchedNfs.length} NFs aguardando reconciliação manual (de ${nfPendentes} disponíveis)` : `${nfPendentes} NFs disponíveis para conciliação`}
            </span>
          </div>
          <div className="table-container" style={{ overflowX: 'hidden' }}>
            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSortNfs('data')}>Data Emissão {sortNfs.field==='data' ? (sortNfs.asc?'▲':'▼'):''}</th>
                  <th>Tomador (Tinus)</th>
                  <th style={{ textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSortNfs('valor')}>Vl. Serviço {sortNfs.field==='valor' ? (sortNfs.asc?'▲':'▼'):''}</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayNfs.map(nf => {
                  let badge;
                  if (nf.reconciled) {
                    badge = <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}><span className="badge badge-green">✓ Conciliada</span>{!results && <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', fontSize: 10, color: 'var(--color-red)' }} onClick={() => handleUndoReconciliation(nf, 'nf')} title="Desfazer">❌</button>}</div>;
                  } else {
                    badge = <span className="badge badge-gray">Na Fila</span>;
                  }

                  let bgObj = {};
                  if (nf._previewState === 'green') {
                     badge = <span className="badge badge-green" style={{ background: '#10b981', color: '#fff' }}>✨ Match Seguro</span>;
                     bgObj = { background: 'rgba(16, 185, 129, 0.08)' };
                  }
                  
                  return (
                    <tr key={nf.id} style={{ opacity: nf.reconciled ? 0.4 : 1, ...bgObj }}>
                      <td style={{ textAlign: 'center' }}>
                        {(nf._previewState === 'green' && nf._pairGrp) ? (
                          <button className="btn btn-ghost btn-sm" style={{ padding:0, fontSize:12, color:'var(--color-red)' }} onClick={() => handleUnlinkPreviewGroup(nf._pairGrp)} title="Desfazer Pre-Match e Voltar pra Fila">❌</button>
                        ) : (nf.reconciled) ? (
                          <span style={{ opacity: 0.5 }}>✓</span>
                        ) : null}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmtDateBr(nf.dataEmissao)}</td>
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nf.nomeTomador || nf.cliente}>{nf.nomeTomador || nf.cliente}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(nf.valorServico || nf.valorLiquido)}</td>
                      <td style={{ textAlign: 'center' }}>{badge}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Table: Banco */}
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
          <div style={{ padding: '16px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', borderRadius: '8px 8px 0 0' }}>
            <h3 style={{ fontSize: 13, margin: 0 }}>Banco (Extratos)</h3>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
               {results ? `${results.unmatchedBancos.length} extratos aguardando reconciliação manual (de ${extratosPendentes} disponíveis)` : `${extratosPendentes} extratos disponíveis para conciliação`}
            </span>
          </div>
          <div className="table-container" style={{ overflowX: 'hidden' }}>
            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSortBancos('data')}>Data {sortBancos.field==='data' ? (sortBancos.asc?'▲':'▼'):''}</th>
                  <th>Descrição (Banco)</th>
                  <th style={{ textAlign: 'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSortBancos('valor')}>Valor Mvto. {sortBancos.field==='valor' ? (sortBancos.asc?'▲':'▼'):''}</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayBancos.map(r => {
                  let badge;
                  if (r.reconciled) {
                    badge = <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center' }}><span className="badge badge-green">✓ Conciliada</span>{!results && <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', fontSize: 10, color: 'var(--color-red)' }} onClick={() => handleUndoReconciliation(r, 'banco')} title="Desfazer">❌</button>}</div>;
                  } else {
                    badge = manualBlacklist.includes(r.id) ? <span className="badge badge-gray" style={{ opacity: 0.6 }}>Ignorada</span> : <span className="badge badge-gray">Na Fila</span>;
                  }

                  let bgObj = {};
                  if (r._previewState === 'green') {
                     badge = <span className="badge badge-green" style={{ background: '#10b981', color: '#fff' }}>✨ Match!</span>;
                     bgObj = { background: 'rgba(16, 185, 129, 0.08)' };
                  }

                  return (
                    <tr key={r.id} style={{ opacity: (r.reconciled || manualBlacklist.includes(r.id)) ? 0.4 : 1, ...bgObj }}>
                      <td style={{ textAlign: 'center' }}>
                        {(r._previewState === 'green' && r._pairGrp) ? (
                            <button className="btn btn-ghost btn-sm" style={{ padding:0, fontSize:12, color:'var(--color-red)' }} onClick={() => handleUnlinkPreviewGroup(r._pairGrp)} title="Desfazer Pre-Match e Voltar pra Fila">❌</button>
                        ) : r.reconciled ? (
                            <span style={{ opacity: 0.5 }}>✓</span>
                        ) : (!results && !r.reconciled) ? (
                            <button className="btn btn-ghost btn-sm" style={{ padding: 0, fontSize: 14 }} title={manualBlacklist.includes(r.id) ? "Voltar à Fila" : "Ocultar / Ignorar Movimento"} onClick={() => handleToggleIgnore(r.id)}>
                               {manualBlacklist.includes(r.id) ? '👁️' : '🚫'}
                            </button>
                        ) : null}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.data?.split('-').reverse().join('/')}</td>
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.descricao}>{r.descricao}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-green)' }}>{fmtCurrency(r.valor)}</td>
                      <td style={{ textAlign: 'center' }}>{badge}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
