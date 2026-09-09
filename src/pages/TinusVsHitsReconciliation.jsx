import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useEmpresa } from '../context/EmpresaContext';
import { useNfsEmitidas }  from '../hooks/useNfsEmitidas';
import { useNfsConsumos }  from '../hooks/useNfsConsumos';
import { useHitsResumo }   from '../hooks/useHitsResumo';
import { useHitsConsumos } from '../hooks/useHitsConsumos';
import { fmtCurrency } from '../utils/formatters';
import { getDB, dbSet, DB_MODULES } from '../utils/db';
import { useToast } from '../context/ToastContext';

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeText(text) {
  if (!text) return '';
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function fuzzyMatch(a, b, aliases = []) {
  let normA = normalizeText(a).replace(/[^a-z0-9]/g, '');
  let normB = normalizeText(b).replace(/[^a-z0-9]/g, '');

  // Operadoras aliases take priority
  for (const { tinus, hits } of aliases) {
    const nT = normalizeText(tinus).replace(/[^a-z0-9]/g, '');
    const nH = normalizeText(hits).replace(/[^a-z0-9]/g, '');
    const aT = normA === nT || normA.includes(nT) || nT.includes(normA);
    const bH = normB === nH || normB.includes(nH) || nH.includes(normB);
    const aH = normA === nH || normA.includes(nH) || nH.includes(normA);
    const bT = normB === nT || normB.includes(nT) || nT.includes(normB);
    if ((aT && bH) || (aH && bT)) return true;
  }

  // Hardcoded alias
  if (normA.includes('sonhadora') || normB.includes('sonhadora')) {
    if (normA.includes('itaparica') || normB.includes('itaparica')) return true;
  }

  if (!normA || !normB) return false;
  if (normA.includes(normB) || normB.includes(normA)) return true;

  const skip = new Set(['ltda','ltd','inc','sa','sa','sia']);
  const wA = normalizeText(a).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 3 && !skip.has(w));
  const wB = normalizeText(b).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w => w.length > 3 && !skip.has(w));
  for (const wa of wA) {
    if (wB.some(wb => wa === wb || wa.includes(wb) || wb.includes(wa))) return true;
  }
  return false;
}

function parseDt(dStr) {
  if (!dStr) return 0;
  let d = String(dStr).split(' ')[0];
  if (d.includes('/')) {
    const p = d.split('/');
    if (p.length === 3) d = `${p[2]}-${p[1]}-${p[0]}`;
  }
  const parts = d.split('-');
  if (parts.length === 3) return new Date(parts[0], parts[1]-1, parts[2]).getTime();
  return 0;
}

// Convert any date string (ISO or DD/MM/YYYY) to a JS Date for Excel export.
// xlsx.js writes Date objects as proper Excel date serials.
function toExcelDate(dStr) {
  if (!dStr) return '';
  const s = String(dStr).trim().split(' ')[0];
  let iso = s;
  if (s.includes('/')) {
    const [d, mo, yr] = s.split('/');
    if (d && mo && yr && yr.length === 4) iso = `${yr}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const dt = new Date(iso + 'T12:00:00');
  return isNaN(dt.getTime()) ? (s || '') : dt;
}

// Apply DD/MM/YYYY number format to a specific column (by 0-based index) in a worksheet.
function applyDateFmt(ws, colIdx, fmt = 'DD/MM/YYYY') {
  if (!ws || !ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: colIdx });
    if (ws[addr] && (ws[addr].t === 'n' || ws[addr].t === 'd')) {
      ws[addr].z = fmt;
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TinusVsHitsReconciliation() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { empresas, activeEmpresa } = useEmpresa();
  const empresaContext = empresas.find(e => e.id === empresaId) || activeEmpresa;

  // Data sources
  const { nfs,         refresh: refreshNfs }         = useNfsEmitidas(empresaId);
  const { nfsConsumos, refresh: refreshNfsConsumos }  = useNfsConsumos(empresaId);
  const { resumos,     refresh: refreshResumos }      = useHitsResumo(empresaId);
  const { consumos,    refresh: refreshConsumos }     = useHitsConsumos(empresaId);

  // Filters
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
  const [toleranciaDias,  setToleranciaDias]  = useState(0);
  const [toleranciaReais, setToleranciaReais] = useState(0.05);

  // Operadoras (persisted in localStorage)
  const operadorasKey = `sombra_operadoras_${empresaId}`;
  const [operadoras,     setOperadoras]     = useState(() => {
    try { return JSON.parse(localStorage.getItem(operadorasKey) || '[]'); } catch { return []; }
  });
  const [showOperadoras, setShowOperadoras] = useState(false);
  const [showRules,      setShowRules]      = useState(false);

  const handleLoadOperadoras = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        const hi = allRows.findIndex(r => Array.isArray(r) && r.some(c => c != null && c !== ''));
        if (hi < 0) return;
        const headers = allRows[hi].map(h => (h != null ? String(h).trim() : ''));
        const tiIdx = headers.findIndex(h => h.toUpperCase() === 'TINUS');
        const htIdx = headers.findIndex(h => h.toUpperCase() === 'HITS');
        if (tiIdx < 0 || htIdx < 0) { toast.error('Tabela deve ter colunas TINUS e HITS.'); return; }
        const aliases = allRows.slice(hi + 1)
          .filter(r => Array.isArray(r) && r[tiIdx] && r[htIdx])
          .map(r => ({ tinus: String(r[tiIdx]).trim(), hits: String(r[htIdx]).trim() }));
        setOperadoras(aliases);
        localStorage.setItem(operadorasKey, JSON.stringify(aliases));
        toast.success(`${aliases.length} operadoras carregadas!`);
      } catch (err) { toast.error('Erro ao ler Tabela Operadoras: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  }, [operadorasKey, toast]);

  // Results state
  const [processing, setProcessing] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [results,    setResults]    = useState(null);   // { groups, unmatchedTinus, unmatchedHits, zeroReport }
  const [manualTinus,   setManualTinus]   = useState([]);
  const [manualHits,    setManualHits]    = useState([]);

  // View Filter
  const [viewFilter, setViewFilter] = useState('pendentes'); // 'pendentes' | 'auditados' | 'todos'

  // Recon Mode
  const [reconMode, setReconMode] = useState('consumos'); // 'consumos' | 'diarias' | 'spa'

  // Sort states
  const [sortTinus, setSortTinus] = useState({ field: 'data', asc: false });
  const [sortHits,  setSortHits]  = useState({ field: 'data', asc: false });

  const handleSortTinus = (field) => setSortTinus(s => ({ field, asc: s.field === field ? !s.asc : false }));
  const handleSortHits  = (field) => setSortHits(s  => ({ field, asc: s.field === field ? !s.asc : false }));

  // ── 1. Build unified TINUS list ────────────────────────────────────────────
  const activeCnpj = String(empresaContext?.cnpj || '').replace(/\D/g, '');

  const allTinus = useMemo(() => {
    const serv = (reconMode === 'diarias' || reconMode === 'spa') ? (nfs || [])
      .filter(n => {
        const cnpjOk = activeCnpj && String(n.cnpjPrestador || '').replace(/\D/g,'') === activeCnpj;
        const notCanceled = String(n.situacaoNota || '').toLowerCase() !== 'cancelada';
        return cnpjOk && notCanceled;
      })
      .map(n => ({
        _source: 'servicos',
        id: n.id,
        tomador:   n.nomeTomador || n.cliente || '',
        valor:     n.valorServico || 0,
        data:      n.dataEmissao || '',
        numero:    String(n.numero || ''),
        situacao:  n.situacaoPagamento || '',
        reconciled: !!n.reconciled,
        _raw: n,
      })) : [];

    const cons = reconMode === 'consumos' ? (nfsConsumos || [])
      .filter(n => String(n.status || '').toLowerCase() !== 'cancelado')
      .map(n => ({
        _source: 'consumos',
        id: n.id,
        tomador:   n.empresaHospede || '',
        valor:     n.vlPagto || 0,
        data:      n.data || '',
        numero:    String(n.numero || ''),
        situacao:  n.status || '',
        reconciled: !!n.reconciled,
        _raw: n,
      })) : [];

    return [...serv, ...cons];
  }, [nfs, nfsConsumos, activeCnpj, reconMode]);

  // ── 2. Filter TINUS by date ─────────────────────────────────────────────────
  // TINUS: emission date >= dataInicio only — no upper bound.
  const filteredTinus = useMemo(() => {
    if (!dataInicio) return allTinus;
    return allTinus.filter(t => {
      const ts = parseDt(t.data);
      if (!ts) return true;
      return ts >= parseDt(dataInicio);
    });
  }, [allTinus, dataInicio]);

  // HITS: checkout within the FULL selected period (>= dataInicio AND <= dataFim).
  // parseDt() handles both DD/MM/YYYY and ISO YYYY-MM-DD formats correctly.
  // ── 3. Group HITS (Resumo + Consumos) ──────────────────────────────────────
  // We link HITS_Resumo (Global) with HITS_Consumos (Conta)
  // Rule 1: Use pre-calculated vlConsumoCALC_AB from Resumo
  // Rule 2: Filter Consumos by catHITS === 'AB'
  const hitsPool = useMemo(() => {
    const tsFrom = dataInicio ? parseDt(dataInicio) : 0;
    const tsTo   = dataFim    ? parseDt(dataFim)    : Infinity;
    const map = {};

    // A. Process Resumos
    for (const r of (resumos || [])) {
      const key = String(r.global || '').trim();
      if (!key) continue;

      const tsCheckout = parseDt(r.checkout);
      if (tsFrom && tsCheckout < tsFrom) continue;
      if (tsTo < Infinity && tsCheckout > tsTo) continue;

      if (!map[key]) {
        map[key] = {
          voucher:        key, // Link key
          global:         key,
          nomeHospede:    r.nomeHospede || '',
          checkout:       r.checkout || '',
          empresaAgencia: r.empresaAgencia || '',
          vlEstimatedAB:  0,
          vlActualAB:     0,
          vlDiarias:      0,
          vlServicos:     0,
          vlTaxas:        0,
          items:          [],
          reconciledConsumos: false,
          reconciledDiarias:  false,
          reconciledSpa:      false,
          _legacyReconciled:  false,
        };
      }
      map[key].vlEstimatedAB += (r.vlConsumoCALC_AB || 0);
      map[key].vlTaxas       += (r.vlTaxas || 0);
      map[key].vlDiarias     += (r.vlDiarias || 0);
      map[key].vlServicos    += (r.totalServicos || 0);
      map[key].items.push({ _source: 'resumo', ...r });
      if (r.reconciledConsumos) map[key].reconciledConsumos = true;
      if (r.reconciledDiarias)  map[key].reconciledDiarias  = true;
      if (r.reconciledSpa)      map[key].reconciledSpa      = true;
      if (r.reconciled)         map[key]._legacyReconciled  = true;
    }

    // B. Process Consumos (Filtered for AB logically)
    // Conta in Consumos = Global in Resumo (confirmed — same format, same value)
    for (const c of (consumos || [])) {
      const key = String(c.conta || '').trim();
      if (!key) continue;

      const tsData = parseDt(c.dataOperacao || c.data);
      if (tsFrom && tsData < tsFrom) continue;
      if (tsTo < Infinity && tsData > tsTo)   continue;

      if (!map[key]) {
        map[key] = {
          voucher:        key,
          global:         key,
          nomeHospede:    c.hospede || '',
          checkout:       c.dataOperacao || c.data || '',
          empresaAgencia: c.empresa || '',
          vlEstimatedAB:  0,
          vlActualAB:     0,
          vlDiarias:      0,
          vlServicos:     0,
          vlTaxas:        0,
          items:          [],
          reconciledConsumos: false,
          reconciledDiarias:  false,
          reconciledSpa:      false,
          _legacyReconciled:  false,
        };
      }
      if (c.catHITS === 'AB') {
         map[key].vlActualAB += (c.total || 0);
      }
      map[key].items.push({ _source: 'consumos', ...c });
      if (c.reconciledConsumos) map[key].reconciledConsumos = true;
      if (c.reconciledDiarias)  map[key].reconciledDiarias  = true;
      if (c.reconciledSpa)      map[key].reconciledSpa      = true;
      if (c.reconciled)         map[key]._legacyReconciled  = true;
    }

    // C. Final aggregation and integrity check (Rule 3 & 4)
    return Object.values(map)
      .filter(g => {
        if (reconMode === 'consumos') return (g.vlEstimatedAB > 0.01 || g.vlActualAB > 0.01);
        if (reconMode === 'diarias')  return (g.vlDiarias > 0.01 || g.vlTaxas > 0.01);
        return (g.vlServicos > 0.01);
      })
      .map(g => {
        let isReconciled = false;
        if (reconMode === 'consumos') isReconciled = g.reconciledConsumos || g._legacyReconciled;
        else if (reconMode === 'diarias') isReconciled = g.reconciledDiarias || g._legacyReconciled;
        else isReconciled = g.reconciledSpa || g._legacyReconciled;

        if (reconMode === 'consumos') {
          return {
            ...g,
            valor: g.vlActualAB,
            reconciled: isReconciled,
            isHitsKO: Math.abs(g.vlEstimatedAB - g.vlActualAB) > 0.10,
            hitsDiff: g.vlEstimatedAB - g.vlActualAB
          };
        } else if (reconMode === 'diarias') {
          return {
            ...g,
            valor: g.vlDiarias + g.vlTaxas,
            reconciled: isReconciled,
            isHitsKO: false,
            hitsDiff: 0
          }
        } else {
          return {
            ...g,
            valor: g.vlServicos,
            reconciled: isReconciled,
            isHitsKO: false,
            hitsDiff: 0
          }
        }
      });
  }, [resumos, consumos, dataInicio, dataFim, reconMode]);

  // Use hitsPool as the main source for HITS
  const allHitsGroups = hitsPool;

  // Zero report: all resumos with totalProdutos=0 AND totalServicos=0 (no date filter)
  const zeroReport = useMemo(() =>
    (resumos || []).filter(r => (r.totalProdutos || 0) === 0 && (r.totalServicos || 0) === 0),
  [resumos]);

  // ── 5. KPI counts ──────────────────────────────────────────────────────────
  const tinusPendentes = filteredTinus.filter(t => !t.reconciled).length;
  const hitsPendentes  = allHitsGroups.filter(h => !h.reconciled).length;

  // ── 6. Process (auto-match) ────────────────────────────────────────────────
  const handleProcess = () => {
    setProcessing(true);
    setResults(null);
    setTimeout(() => {
      const candTinus = filteredTinus.filter(t => !t.reconciled);
      const candHits  = [...allHitsGroups.filter(h => !h.reconciled)];
      const groups        = [];
      const unmatchedTinus = [];
      const toleranciaCents = Math.round((toleranciaReais || 0) * 100);

      for (const t of candTinus) {
        let matchIdx = -1;
        for (let i = 0; i < candHits.length; i++) {
          const h = candHits[i];
          // Rule 1 & 2 logic: Value match using the dynamic mode-based valor
          if (h.valor === 0) continue;
          // Value match
          const diffCents = Math.abs(Math.round(t.valor * 100) - Math.round(h.valor * 100));
          if (diffCents > toleranciaCents) continue;
          // Text match (Rule 3)
          const textOk = fuzzyMatch(t.tomador, h.empresaAgencia || '', operadoras)
                      || fuzzyMatch(t.tomador, h.nomeHospede, operadoras);
          if (!textOk) continue;
          // Optional date tolerance
          if (toleranciaDias > 0) {
            const dt = parseDt(t.data);
            const dh = parseDt(h.checkout);
            if (dt && dh && Math.abs((dt - dh) / 86400000) > toleranciaDias) continue;
          }
          matchIdx = i;
          break;
        }
        if (matchIdx !== -1) {
          const matched = candHits.splice(matchIdx, 1)[0];
          groups.push({ id: `auto_${t.id}`, tinus: [t], hits: [matched], manual: false });
        } else {
          unmatchedTinus.push(t);
        }
      }

      setResults({ groups, unmatchedTinus, unmatchedHits: candHits, zeroReport });
      setProcessing(false);
      if (groups.length === 0) toast.info('Nenhum match encontrado.');
      else toast.success(`${groups.length} grupos encontrados.`);
    }, 300);
  };

  // ── 7. Manual match ────────────────────────────────────────────────────────
  const toggleManualTinus = t => setManualTinus(prev => prev.some(x => x.id === t.id) ? prev.filter(x => x.id !== t.id) : [...prev, t]);
  const toggleManualHits  = h => setManualHits(prev  => prev.some(x => x.global === h.global) ? prev.filter(x => x.global !== h.global) : [...prev, h]);

  const handleForceMatch = () => {
    if (!manualTinus.length || !manualHits.length) return;
    setResults(prev => {
      const grp = { id: `manual_${Date.now()}`, tinus: manualTinus, hits: manualHits, manual: true };
      return {
        ...prev,
        groups:          [...(prev.groups || []), grp],
        unmatchedTinus:  prev.unmatchedTinus.filter(t => !manualTinus.some(m => m.id === t.id)),
        unmatchedHits:   prev.unmatchedHits.filter(h => !manualHits.some(m => m.global === h.global)),
      };
    });
    setManualTinus([]); setManualHits([]);
    toast.success('Grupo manual criado! Clique em Salvar para efetivar.');
  };

  const handleUnlinkGroup = (groupId) => {
    setResults(prev => {
      if (!prev) return prev;
      const grpIndex = prev.groups.findIndex(g => g.id === groupId);
      if (grpIndex < 0) return prev;
      const grp = prev.groups[grpIndex];
      return {
        ...prev,
        groups: prev.groups.filter((_, i) => i !== grpIndex),
        unmatchedTinus: [...prev.unmatchedTinus, ...grp.tinus],
        unmatchedHits: [...prev.unmatchedHits, ...grp.hits]
      };
    });
    toast.info('Match desfeito! Itens voltaram para a fila.');
  };

  // ── 8. Commit ──────────────────────────────────────────────────────────────
  const handleCommit = async () => {
    if (!results?.groups.length) return;
    if (!window.confirm(`Salvar definitivamente ${results.groups.length} grupos?`)) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const dbHits = getDB(empresaId, DB_MODULES.HITS_RESUMO);
      const dbCons = getDB(empresaId, DB_MODULES.NFS_CONSUMOS);
      const dbServ = getDB(empresaId, DB_MODULES.NFS_EMITIDAS);
      const dbHCons = getDB(empresaId, DB_MODULES.HITS_CONSUMOS);

      let count = 0;
      for (const g of results.groups) {
        const tinusIds = g.tinus.map(t => t.id).join(', ');
        const hitsVouchers = g.hits.map(h => h.global).join(', ');

        for (const t of g.tinus) {
          const db = t._source === 'consumos' ? dbCons : dbServ;
          await dbSet(db, t.id, { ...t._raw, reconciled: true, matchedId: hitsVouchers, matchedSource: `hits_mode_${reconMode}`, reconciledAt: now });
        }
        for (const h of g.hits) {
          const dbH = h._source === 'consumos_lancados' ? dbHCons : dbHits;
          for (const item of h.items) {
            const updates = { matchedId: tinusIds, matchedSource: `nfs_mode_${reconMode}`, reconciledAt: now };
            if (reconMode === 'consumos') updates.reconciledConsumos = true;
            else if (reconMode === 'diarias') updates.reconciledDiarias = true;
            else updates.reconciledSpa = true;
            await dbSet(dbH, item.id, { ...item, ...updates });
          }
        }
        count += g.tinus.length + g.hits.length;
      }
      toast.success(`✅ ${count} registros salvos!`);
      setResults(null);
      refreshNfs(); refreshNfsConsumos(); refreshResumos(); refreshConsumos();
    } catch (err) {
      toast.error('Falha ao salvar: ' + err.message);
    } finally { setSaving(false); }
  };

  // ── 9. Export ──────────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    if (results) {
      // ── Tab: Reconciliados ──
      const matchData = [];
      results.groups.forEach(g => {
        const maxLen = Math.max(g.tinus.length, g.hits.length);
        for (let i = 0; i < maxLen; i++) {
          const t = g.tinus[i] || {};
          const h = g.hits[i] || {};
          matchData.push({
            'Status':            g.manual ? 'Forçado' : 'Auto',
            'TINUS Fonte':       t._source || '',
            'TINUS Tomador':     t.tomador || '',
            'TINUS Valor':       t.valor || '',
            'TINUS Data':        toExcelDate(t.data),
            'HITS Fonte':        h._source || 'resumo',
            'HITS Voucher/Conta':h.voucher || h.global || '',
            'HITS Empresa':      h.empresaAgencia || '',
            'HITS Vlr Analitico':h.valor || h.vlActualAB || '',
            'HITS Vlr Estimado': h.vlEstimatedAB || '',
            'HITS Checkout':     toExcelDate(h.checkout),
            'Diferença': i === 0
              ? Math.abs(
                  (g.tinus.reduce((s,x) => s + (x.valor || 0), 0)) -
                  (g.hits.reduce((s,x)  => s + (x.valor || x.vlActualAB || 0), 0))
                ).toFixed(2)
              : '',
          });
        }
      });
      if (matchData.length) {
        const wsRec = XLSX.utils.json_to_sheet(matchData, { cellDates: true });
        applyDateFmt(wsRec, 4);   // col E = 'TINUS Data'
        applyDateFmt(wsRec, 10);  // col K = 'HITS Checkout' (shifted by +1 vs before)
        XLSX.utils.book_append_sheet(wb, wsRec, 'Reconciliados');
      }

      // ── Tab: TINUS Pendentes ──
      const tinusPend = results.unmatchedTinus.map(t => ({
        'Fonte':   t._source,
        'Tomador': t.tomador,
        'Valor':   t.valor,
        'Data':    toExcelDate(t.data),
      }));
      if (tinusPend.length) {
        const wsTinus = XLSX.utils.json_to_sheet(tinusPend, { cellDates: true });
        applyDateFmt(wsTinus, 3); // col D = 'Data'
        XLSX.utils.book_append_sheet(wb, wsTinus, 'TINUS Pendentes');
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Aviso: 'Nenhum' }]), 'TINUS Pendentes');
      }

      // ── Tab: HITS Pendentes ──
      const hitsPend = results.unmatchedHits.map(h => ({
        'Fonte':              h._source || 'resumo',
        'Voucher/Global':     h.voucher || h.global || '',
        'Hóspede':            h.nomeHospede || '',
        'Empresa':            h.empresaAgencia || '',
        'Vlr. Estimado (ISS)': h.vlEstimatedAB || 0,
        'Vlr. Analitico (AB)': h.vlActualAB    || 0,
        'Checkout':           toExcelDate(h.checkout),
      }));
      if (hitsPend.length) {
        const wsHits = XLSX.utils.json_to_sheet(hitsPend, { cellDates: true });
        applyDateFmt(wsHits, 6); // col G = 'Checkout'
        XLSX.utils.book_append_sheet(wb, wsHits, 'HITS Pendentes');
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Aviso: 'Nenhum' }]), 'HITS Pendentes');
      }

      // ── Tab: HITs Zero Prod+Serv ──
      const zeroData = zeroReport.map(r => ({
        'Global':         r.global,
        'Hóspede':        r.nomeHospede,
        'Voucher':        r.voucher,
        'Checkout':       toExcelDate(r.checkout),
        'Qtd. Diárias':   r.totalDiarias,
        'Vlr. Diárias':   r.vlDiarias,
        'Total Produtos': r.totalProdutos,
        'Total Serviços': r.totalServicos,
      }));
      const wsZero = XLSX.utils.json_to_sheet(zeroData.length ? zeroData : [{ Aviso: 'Nenhum' }], { cellDates: true });
      applyDateFmt(wsZero, 3); // col D = 'Checkout'
      XLSX.utils.book_append_sheet(wb, wsZero, 'HITs Zero Prod+Serv');
    }
    XLSX.writeFile(wb, `reconciliacao_tinus_hits_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── 10. Display lists ──────────────────────────────────────────────────────
  let displayTinus = [];
  let displayHits  = [];

  if (results) {
    const pairedT = []; const pairedH = [];
    results.groups.forEach(g => {
      g.tinus.forEach(t => pairedT.push({ ...t, _state: 'green', _groupId: g.id }));
      g.hits.forEach(h  => pairedH.push({ ...h, _state: 'green', _groupId: g.id }));
    });
    displayTinus = [...results.unmatchedTinus.map(t => ({ ...t, _state: 'yellow' })), ...pairedT];
    displayHits  = [...results.unmatchedHits.map(h  => ({ ...h, _state: 'yellow' })), ...pairedH];
  } else {
    let tArr = [...filteredTinus];
    if (viewFilter === 'pendentes') tArr = tArr.filter(t => !t.reconciled);
    if (viewFilter === 'auditados') tArr = tArr.filter(t => t.reconciled);
    tArr.sort((a,b) => {
      if (a.reconciled !== b.reconciled) return a.reconciled ? 1 : -1;
      let cmp = 0;
      if (sortTinus.field === 'data') cmp = (a.data||'').localeCompare(b.data||'');
      if (sortTinus.field === 'valor') cmp = (a.valor||0) - (b.valor||0);
      return sortTinus.asc ? cmp : -cmp;
    });
    
    let hArr = [...allHitsGroups];
    if (viewFilter === 'pendentes') hArr = hArr.filter(h => !h.reconciled);
    if (viewFilter === 'auditados') hArr = hArr.filter(h => h.reconciled);
    hArr.sort((a,b) => {
      if (a.reconciled !== b.reconciled) return a.reconciled ? 1 : -1;
      let cmp = 0;
      if (sortHits.field === 'data') cmp = (parseDt(a.checkout)||0) - (parseDt(b.checkout)||0);
      if (sortHits.field === 'valor') cmp = (a.vlActualAB||0) - (b.vlActualAB||0);
      return sortHits.asc ? cmp : -cmp;
    });
    displayTinus = tArr.slice(0,250);
    displayHits  = hArr.slice(0,250);
  }

  // ── 11. Render ──────────────────────────────────────────────────────────────
  return (
    <div className="contas-page fade-in" style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header with big Analisar button on right */}
      <div className="overview-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={() => navigate(`/empresa/${empresaId}/conciliacao-receitas`)} className="btn btn-secondary btn-sm" style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--color-border)' }}>← Voltar</button>
          <span style={{ fontSize: 28 }}>🏨</span>
          <div>
            <h1 className="overview-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Tinus vs HITs <span style={{ fontSize: 13, opacity: 0.7, fontWeight: 500 }}>{empresaContext?.name}</span></h1>
            <p className="overview-subtitle">Reconciliação de NFs Emitidas com Reservas</p>
          </div>
        </div>

        {/* MODE SELECTOR */}
        {!results && (
          <div style={{ display: 'flex', background:'var(--color-bg-secondary)', padding:4, borderRadius:8, border:'1px solid var(--color-border)', margin:'0 16px' }}>
            <button className={`btn btn-sm ${reconMode === 'consumos' ? 'btn-primary' : 'btn-ghost'}`} style={{ border:'none' }} onClick={() => { setReconMode('consumos'); setViewFilter('pendentes'); setManualHits([]); setManualTinus([]); setResults(null); }}>🍽️ Consumos (A&B)</button>
            <button className={`btn btn-sm ${reconMode === 'diarias' ? 'btn-primary' : 'btn-ghost'}`} style={{ border:'none' }} onClick={() => { setReconMode('diarias'); setViewFilter('pendentes'); setManualHits([]); setManualTinus([]); setResults(null); }}>🛏️ Diárias + Taxas</button>
            <button className={`btn btn-sm ${reconMode === 'spa' ? 'btn-primary' : 'btn-ghost'}`} style={{ border:'none' }} onClick={() => { setReconMode('spa'); setViewFilter('pendentes'); setManualHits([]); setManualTinus([]); setResults(null); }}>💆 Serviços SPA</button>
          </div>
        )}

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

      {/* Top bar Filters */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setShowRules(r => !r)}>🔍 Regras</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setShowOperadoras(o => !o)}>
            📋 Operadoras
            {operadoras.length > 0 && <span style={{ marginLeft: 4, background: 'var(--color-accent)', color:'#fff', borderRadius: 8, padding: '0 5px', fontSize: 9, fontWeight: 700 }}>{operadoras.length}</span>}
          </button>
          <label style={{ cursor: 'pointer' }} title="Importar Tabela Operadoras (TINUS | HITS)">
            <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleLoadOperadoras} />
            <span className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>📥 Atualizar</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            Mês:
            <input type="month" className="form-input" value={mesFiltro} style={{ height: 28, width: 130, fontSize: 11 }} onChange={e => {
              const val = e.target.value;
              setMesFiltro(val);
              if (!val) {
                localStorage.removeItem(FILTER_MONTH_KEY);
                setDataInicio('');
                setDataFim('');
                return;
              }
              localStorage.setItem(FILTER_MONTH_KEY, val);
              const [y,m] = val.split('-');
              setDataInicio(`${y}-${m}-01`);
              setDataFim(`${y}-${m}-${new Date(y, parseInt(m), 0).getDate()}`);
            }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            De: <input type="date" className="form-input" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={{ height: 28, fontSize: 11 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            Até: <input type="date" className="form-input" value={dataFim} onChange={e => setDataFim(e.target.value)} style={{ height: 28, fontSize: 11 }} />
          </label>
          <div style={{ height: 20, width: 1, background: 'var(--color-border)' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }} title="Tolerância máxima em dias entre Data TINUS e Checkout HITs">
            <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Tol. dias:</span>
            <input type="number" min="0" step="1" className="form-input" value={toleranciaDias} onChange={e => setToleranciaDias(Number(e.target.value))} style={{ height: 28, width: 50, fontSize: 11 }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }} title="Tolerância máxima em R$ entre Valor NF (TINUS) e Diárias (HITs)">
            <span style={{ borderBottom: '1px dotted #ccc', cursor: 'help' }}>Tol. R$:</span>
            <input type="number" min="0" step="0.01" className="form-input" value={toleranciaReais} onChange={e => setToleranciaReais(parseFloat(e.target.value) || 0)} style={{ height: 28, width: 70, fontSize: 11 }} />
          </label>
          <div style={{ height: 20, width: 1, background: 'var(--color-border)' }} />
          <button className="btn btn-ghost btn-sm" style={{ height: 28, padding: '0 8px', fontSize: 11 }} onClick={handleExportExcel}>📊 Excel</button>
          {results && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                if (window.confirm('Descartar análise atual?')) {
                  setResults(null);
                  setManualTinus([]);
                  setManualHits([]);
                }
              }} disabled={saving} style={{ color: 'var(--color-text-muted)' }}>
                Limpar Análise
              </button>
              {results.groups.length > 0 && (
                <button className="btn btn-primary btn-sm pulse-anim" onClick={handleCommit} disabled={saving} style={{ background: 'var(--color-green)' }}>
                  {saving ? '⏳...' : `💾 Salvar ${results.groups.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Operadoras panel */}
      {showOperadoras && (
        <div style={{ background: 'var(--color-bg-secondary)', padding: '10px 14px', borderRadius: 8, marginBottom: 10, border: '1px solid var(--color-border)' }} className="fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h4 style={{ margin: 0, fontSize: 12, color: 'var(--color-accent)' }}>📋 Tabela Operadoras — {operadoras.length} mapeamentos</h4>
            {operadoras.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, color: 'var(--color-red)' }}
                onClick={() => { if(window.confirm('Limpar?')) { setOperadoras([]); localStorage.removeItem(operadorasKey); } }}>
                🗑 Limpar
              </button>
            )}
          </div>
          {operadoras.length === 0
            ? <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>Nenhuma tabela. Clique em 📥 Atualizar.</p>
            : (
              <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:'left', padding:'2px 8px', borderBottom:'1px solid var(--color-border)', color:'var(--color-text-muted)' }}>TINUS</th>
                      <th style={{ textAlign:'left', padding:'2px 8px', borderBottom:'1px solid var(--color-border)', color:'var(--color-text-muted)' }}>HITS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operadoras.map((op,i) => (
                      <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding:'2px 8px', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={op.tinus}>{op.tinus}</td>
                        <td style={{ padding:'2px 8px', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--color-accent)' }} title={op.hits}>{op.hits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      )}

      {/* Rules panel */}
      {showRules && (
        <div style={{ background: 'var(--color-bg-secondary)', padding: '10px 14px', borderRadius: 8, marginBottom: 10, fontSize: 11, border: '1px solid var(--color-border)' }}>
          <h4 style={{ margin:'0 0 6px 0', color:'var(--color-accent)' }}>📋 Regras de Reconciliação:</h4>
          <ol style={{ margin:0, paddingLeft:20, color:'var(--color-text-secondary)', lineHeight:1.6 }}>
            <li><strong>TINUS:</strong> Inclui NFs Emitidas (Serviços) com CNPJ Prestador = empresa + NFs Consumos. Exclui <em>Situação Nota = Cancelada</em>.</li>
            <li><strong>HITS:</strong> Agrupamento por Voucher, somando campo <em>Diárias</em>.</li>
            <li><strong>Nome:</strong> <em>Razão Social Tomador</em> (TINUS) vs <em>Empresa/agência</em> (HITs), via Tabela Operadoras + fuzzy match.</li>
            <li><strong>Valor:</strong> Se Diárias HITs &gt; 0, compara <em>Vl. Serviço</em> (TINUS) com <em>Diárias</em> (HITs). Tolerância ± R$ {toleranciaReais.toFixed(2)}.</li>
            <li><strong>Relatório Zero:</strong> Ticket HITs com <em>Total produtos = 0</em> E <em>Total serviços = 0</em>.</li>
          </ol>
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
                <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>TINUS ({displayTinus.length}):</span>
                <strong style={{ color: 'var(--color-text)' }}>{fmtCurrency(displayTinus.reduce((s, t) => s + (t.valor || 0), 0))}</strong>
             </div>
             <div style={{ background: 'var(--color-bg-secondary)', padding: '6px 14px', borderRadius: 8, border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>HITS ({displayHits.length}):</span>
                <strong style={{ color: 'var(--color-green)' }}>{fmtCurrency(displayHits.reduce((s, h) => s + (h.valor || 0), 0))}</strong>
             </div>
          </div>
        </div>
      )}

      {/* Manual selection bar */}
      {(manualTinus.length > 0 || manualHits.length > 0) && (
        <div style={{ background:'var(--color-blue)', color:'#fff', padding:'8px 14px', borderRadius:8, marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }} className="fade-in">
          <span style={{ fontSize: 12 }}>
            <strong>🔗 Grupo Manual:</strong> {manualTinus.length} TINUS ({fmtCurrency(manualTinus.reduce((s,t)=>s+t.valor,0))})
            &nbsp;+&nbsp;{manualHits.length} HITs (Diárias: {fmtCurrency(manualHits.reduce((s,h)=>s+h.vlDiarias,0))})
          </span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost btn-sm" style={{ color:'#fff', border:'1px solid rgba(255,255,255,0.4)' }} onClick={() => { setManualTinus([]); setManualHits([]); }}>Cancelar</button>
            <button className="btn btn-primary btn-sm" style={{ background:'#fff', color:'var(--color-blue)' }} onClick={handleForceMatch}
              disabled={!manualTinus.length || !manualHits.length}>✓ Criar Grupo</button>
          </div>
        </div>
      )}

      {/* Side-by-side tables */}
      <div style={{ display:'flex', gap:16, flex: '1 1 500px', minHeight: 400 }}>

        {/* TINUS table */}
        <div className="card" style={{ flex:1, display:'flex', flexDirection:'column', padding:0 }}>
          <div style={{ padding:'12px 14px', background:'var(--color-bg-secondary)', borderBottom:'1px solid var(--color-border)', borderRadius: '8px 8px 0 0' }}>
            <h3 style={{ fontSize:13, margin:0 }}>Tinus ({reconMode === 'consumos' ? 'Consumos' : 'Serviços'})</h3>
            <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>
              {results
                ? `${results.unmatchedTinus.length} pendentes após análise`
                : `${tinusPendentes} disponíveis de ${filteredTinus.length} totais`}
            </span>
          </div>
          <div style={{ overflowX: 'hidden' }}>
            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width:30 }}></th>
                  <th>Fonte</th>
                  <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSortTinus('data')}>Data {sortTinus.field==='data' ? (sortTinus.asc?'▲':'▼'):''}</th>
                  <th>Tomador</th>
                  <th style={{ textAlign:'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSortTinus('valor')}>Valor {sortTinus.field==='valor' ? (sortTinus.asc?'▲':'▼'):''}</th>
                  <th style={{ textAlign:'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayTinus.map(t => {
                  const isGreen  = t._state === 'green';
                  const isYellow = t._state === 'yellow';
                  let badge;
                  if (t.reconciled && !results)  badge = <span className="badge badge-green">✓ Conciliado</span>;
                  else if (isGreen)  badge = <span className="badge badge-green" style={{ background:'#10b981', color:'#fff' }}>✨ Match</span>;
                  else if (isYellow) badge = <span className="badge badge-yellow">⚠️ Pendente</span>;
                  else               badge = <span className="badge badge-gray">Na Fila</span>;

                  return (
                    <tr key={t.id} style={{ opacity: t.reconciled && !results ? 0.4 : 1, background: isGreen ? 'rgba(16,185,129,0.07)' : isYellow ? 'rgba(245,158,11,0.05)' : undefined }}>
                      <td style={{ textAlign:'center' }}>
                        {isYellow && <input type="checkbox" checked={manualTinus.some(x=>x.id===t.id)} onChange={() => toggleManualTinus(t)} style={{ cursor:'pointer', accentColor:'var(--color-blue)' }} />}
                        {(isGreen && t._groupId) ? (
                          <button className="btn btn-ghost btn-sm" style={{ padding:0, fontSize:12, color:'var(--color-red)' }} onClick={() => handleUnlinkGroup(t._groupId)} title="Desfazer e Voltar pra Fila">❌</button>
                        ) : (t.reconciled && !results) ? (
                          <span style={{ opacity:0.5 }}>✓</span>
                        ) : null}
                      </td>
                      <td><span className="badge badge-accent" style={{ fontSize:9 }}>{reconMode === 'consumos' ? '🍽️ Consumo' : '🧾 Serviço'}</span></td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>
                        {t.data
                          ? (t.data.includes('/') ? t.data.split(' ')[0] : t.data.split(' ')[0].split('-').reverse().join('/'))
                          : '—'}
                      </td>
                      <td style={{ maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={t.tomador}>{t.tomador || '—'}</td>
                      <td style={{ textAlign:'right', fontWeight:600 }}>{fmtCurrency(t.valor)}</td>
                      <td style={{ textAlign:'center' }}>{badge}</td>
                    </tr>
                  );
                })}
                {displayTinus.length === 0 && <tr><td colSpan={6} style={{ textAlign:'center', padding:24, color:'var(--color-text-muted)' }}>Nenhuma NF no período.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* HITS table */}
        <div className="card" style={{ flex:1, display:'flex', flexDirection:'column', padding:0 }}>
          <div style={{ padding:'12px 14px', background:'var(--color-bg-secondary)', borderBottom:'1px solid var(--color-border)', borderRadius: '8px 8px 0 0' }}>
            <h3 style={{ fontSize:13, margin:0 }}>HITs ({reconMode === 'consumos' ? 'Resumo + Consumos' : 'Resumo - Diárias + Serv.'})</h3>
            <span style={{ fontSize:11, color:'var(--color-text-muted)' }}>
              {results
                ? `${results.unmatchedHits.length} pendentes após análise`
                : `${hitsPendentes} disponíveis de ${allHitsGroups.length} gruppi`}
            </span>
          </div>
          <div style={{ overflowX: 'hidden' }}>
            <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width:30 }}></th>
                  <th>Hóspede</th>
                  <th>Global / Conta</th>
                  <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSortHits('data')}>Checkout {sortHits.field==='data' ? (sortHits.asc?'▲':'▼'):''}</th>
                  <th style={{ textAlign:'right' }}>{reconMode === 'consumos' ? 'Est. A&B (Taxa)' : reconMode === 'diarias' ? 'Taxas' : ''}</th>
                  <th style={{ textAlign:'right', cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => handleSortHits('valor')}>
                    {reconMode === 'consumos' ? 'Real (A&B)' : reconMode === 'diarias' ? 'Diárias' : 'Real (Serviços)'} {sortHits.field==='valor' ? (sortHits.asc?'▲':'▼'):''}
                  </th>
                  <th style={{ textAlign:'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayHits.map(h => {
                  const isGreen  = h._state === 'green';
                  const isYellow = h._state === 'yellow';
                  let badge;
                  if (h.reconciled && !results)  badge = <span className="badge badge-green">✓ Conciliado</span>;
                  else if (isGreen)  badge = <span className="badge badge-green" style={{ background:'#10b981', color:'#fff' }}>✨ Match!</span>;
                  else if (isYellow) badge = <span className="badge badge-yellow">⚠️ Pendente</span>;
                  else               badge = <span className="badge badge-gray">Na Fila</span>;

                  return (
                    <tr key={h.global} style={{ opacity: h.reconciled && !results ? 0.4 : 1, background: isGreen ? 'rgba(16,185,129,0.07)' : isYellow ? 'rgba(245,158,11,0.05)' : undefined }}>
                      <td style={{ textAlign:'center' }}>
                        {isYellow && <input type="checkbox" checked={manualHits.some(x=>x.global===h.global)} onChange={() => toggleManualHits(h)} style={{ cursor:'pointer', accentColor:'var(--color-blue)' }} />}
                        {(isGreen && h._groupId) ? (
                          <button className="btn btn-ghost btn-sm" style={{ padding:0, fontSize:12, color:'var(--color-red)' }} onClick={() => handleUnlinkGroup(h._groupId)} title="Desfazer e Voltar pra Fila">❌</button>
                        ) : (h.reconciled && !results) ? (
                          <span style={{ opacity:0.5 }}>✓</span>
                        ) : null}
                      </td>
                      <td style={{ maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={h.nomeHospede}>{h.nomeHospede || '—'}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:12, fontWeight:600, color:'var(--color-accent)' }}>{h.global}</td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>
                        {h.checkout
                          ? (h.checkout.includes('/') ? h.checkout.split(' ')[0] : h.checkout.split('-').reverse().join('/'))
                          : '—'}
                      </td>
                      <td style={{ textAlign:'right', fontSize:11, color:'var(--color-text-muted)' }}>
                        {reconMode === 'consumos' ? fmtCurrency(h.vlEstimatedAB) : reconMode === 'diarias' ? fmtCurrency(h.vlTaxas) : '—'}
                      </td>
                      <td style={{ textAlign:'right', fontWeight:600, color:'var(--color-green)' }}>
                        {reconMode === 'consumos' ? fmtCurrency(h.vlActualAB) : reconMode === 'diarias' ? fmtCurrency(h.vlDiarias) : fmtCurrency(h.vlServicos)}
                      </td>
                      <td style={{ textAlign:'center' }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
                          {badge}
                          {h.isHitsKO && (
                            <span style={{ fontSize:9, color:'var(--color-red)', fontWeight:700 }} title={`Erro interno HITS: Diff ${fmtCurrency(h.hitsDiff)}`}>
                              ⚠️ HITS KO
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {displayHits.length === 0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:24, color:'var(--color-text-muted)' }}>Nenhum registro HITS no período.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Zero report */}
      {zeroReport.length > 0 && (
        <div className="card" style={{ marginTop:14, padding:0, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>⚠️</span>
            <h3 style={{ fontSize:13, margin:0, color:'var(--color-red)' }}>Relatório: HITs com Total Produtos = 0 e Total Serviços = 0 ({zeroReport.length} registros)</h3>
          </div>
          <div style={{ maxHeight:200, overflowY:'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Global</th>
                  <th>Voucher</th>
                  <th>Hóspede</th>
                  <th>Checkout</th>
                  <th style={{ textAlign:'right' }}>Diárias</th>
                  <th style={{ textAlign:'right' }}>Tot. Prod.</th>
                  <th style={{ textAlign:'right' }}>Tot. Serv.</th>
                </tr>
              </thead>
              <tbody>
                {zeroReport.map(r => (
                  <tr key={r.id} style={{ background:'rgba(239,68,68,0.04)' }}>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-accent)' }}>{r.global}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{r.voucher || '—'}</td>
                    <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.nomeHospede || '—'}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{r.checkout?.split('-').reverse().join('/') || '—'}</td>
                    <td style={{ textAlign:'right', fontWeight:600 }}>{fmtCurrency(r.vlDiarias)}</td>
                    <td style={{ textAlign:'right', color:'var(--color-red)' }}>{fmtCurrency(r.totalProdutos)}</td>
                    <td style={{ textAlign:'right', color:'var(--color-red)' }}>{fmtCurrency(r.totalServicos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
