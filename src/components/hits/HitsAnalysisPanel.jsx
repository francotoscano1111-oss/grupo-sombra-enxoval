/**
 * HitsAnalysisPanel.jsx
 * 3 reconciliation analysis buttons for the Consumos Lançados tab.
 *
 * A — Consumos A&B      : cross-checks resumo (Total produtos + Taxas) vs consumos (dept ≠ RECEPÇÃO & ≠ SERVIÇOS SPA)
 * B — Serviços SPA      : extracts consumos where dept = SERVIÇOS SPA, grouped by Conta
 * C — Taxa Preservação  : reconciles expected taxa (diárias × rate) vs TAXA DE CONTRIBUIÇÃO AMBIENTAL in consumos
 *                          Supports manual reconciliation flags with comments, persisted to localStorage.
 *
 * All three reports include:
 *   • Date range filter (calendar inputs) using check-out date (A,C) or data de operação (B)
 *   • Quick-month selector showing only months present in the dataset
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useHitsResumo } from '../../hooks/useHitsResumo';
import { exportToExcel } from '../../utils/exportUtils';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt  = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtN = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TOLERANCE = 0.05;

const isVoucherZero = (v) => {
  if (!v || v === '' || v === '0' || v === '0.0') return true;
  return !isNaN(Number(v)) && Number(v) === 0;
};

function parseDateToISO(raw) {
  if (!raw && raw !== 0) return null;
  if (typeof raw === 'number') {
    const d = new Date((raw - 25569) * 86400 * 1000);
    return !isNaN(d) ? d.toISOString().slice(0, 10) : null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function extractMonths(isoDates) {
  const set = new Set();
  for (const d of isoDates) if (d && d.length >= 7) set.add(d.slice(0, 7));
  return [...set].sort();
}

function fmtMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    .replace('. de ', '/').replace('.', '');
}

function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { start: `${ym}-01`, end: `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2,'0')}` };
}

function inRange(isoDate, startISO, endISO) {
  if (!isoDate) return false;
  if (startISO && isoDate < startISO) return false;
  if (endISO   && isoDate > endISO)   return false;
  return true;
}

// ── localStorage helpers for Taxa overrides ───────────────────────────────────

function loadOverrides(empresaId) {
  try { return JSON.parse(localStorage.getItem(`hits_taxa_ric_${empresaId}`) || '{}'); }
  catch { return {}; }
}

function saveOverrides(empresaId, data) {
  try { localStorage.setItem(`hits_taxa_ric_${empresaId}`, JSON.stringify(data)); } catch {}
}

// ── Date Range Filter UI ──────────────────────────────────────────────────────

function DateRangeFilter({ months, startDate, endDate, setStart, setEnd, totalRows, filteredRows }) {
  const isFiltered = startDate || endDate;
  const [showMonths, setShowMonths] = useState(false);
  const handleMonth = (ym) => { const { start, end } = monthBounds(ym); setStart(start); setEnd(end); setShowMonths(false); };

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
      padding: '10px 14px', background: 'var(--color-bg-secondary)', borderRadius: 10, marginBottom: 14,
      border: `1px solid ${isFiltered ? 'var(--color-accent)' : 'var(--color-border)'}`,
    }}>
      <span style={{ fontSize: 14 }}>📅</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Período:</span>
      {/* De */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>De</span>
        <input type="date" value={startDate} max={endDate || undefined} onChange={e => setStart(e.target.value)}
          style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', colorScheme: 'dark' }} />
      </div>
      {/* Até */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Até</span>
        <input type="date" value={endDate} min={startDate || undefined} onChange={e => setEnd(e.target.value)}
          style={{ background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '4px 8px', fontSize: 12, fontFamily: 'var(--font-mono)', colorScheme: 'dark' }} />
      </div>
      {/* Month picker */}
      <div style={{ position: 'relative' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowMonths(v => !v)}
          style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          🗓 Mês inteiro ▾
        </button>
        {showMonths && (
          <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,.4)', maxHeight: 280, overflowY: 'auto', minWidth: 140, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {months.length === 0 && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: '4px 8px' }}>Sem datas</span>}
            {months.map(ym => (
              <button key={ym} onClick={() => handleMonth(ym)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '5px 10px', borderRadius: 6, fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 600 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                {fmtMonthLabel(ym)}
              </button>
            ))}
          </div>
        )}
      </div>
      {isFiltered && (
        <button className="btn btn-ghost btn-sm" onClick={() => { setStart(''); setEnd(''); }}
          style={{ fontSize: 11, color: 'var(--color-red)', padding: '4px 10px' }}>✕ Limpar</button>
      )}
      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: isFiltered ? 700 : 400, color: isFiltered ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
        {isFiltered ? `${filteredRows} / ${totalRows} registros` : `${totalRows} registros`}
      </span>
    </div>
  );
}

// ── Computation Engines ───────────────────────────────────────────────────────

/**
 * @param {object} overrides { [global]: { ok, comment, updatedAt } }
 * @param {number} issRate   ISS aliquota in % (e.g. 10 for 10%). Default 10.
 * Formula: vlNetISS = vlTaxas / (issRate / 100)
 * i.e. if Taxas = 100 and ISS = 10%, the net A&B value = 1.000
 */
function computeConsumosAB(resumos, consumos, overrides, issRate) {
  const ov   = overrides || {};
  const rate = Number(issRate) > 0 ? Number(issRate) : 10; // percent

  const resumoMap = {};
  for (const r of resumos) {
    const vlTaxas  = r.vlTaxas || 0;
    // Rule 1: Use pre-calculated value from DB (Rule 1), fallback for old data
    const vlNetISS = r.vlConsumoCALC_AB ?? (vlTaxas / (rate / 100)); 
    resumoMap[r.global] = {
      global: r.global, hospede: r.nomeHospede || '—', apto: r.apartamento || '—',
      checkin: r.checkin || '', checkout: r.checkout || '',
      dateISO: parseDateToISO(r.checkout),
      vlTaxas, vlNetISS,
    };
  }
  const consumosMap = {};
  for (const c of consumos) {
    // Rule 2: Use catHITS label instead of raw department filtering
    if (c.catHITS !== 'AB') continue;
    if (!consumosMap[c.conta]) consumosMap[c.conta] = { vlConsumos: 0, linhas: 0, deptos: new Set() };
    consumosMap[c.conta].vlConsumos += c.total || 0;
    consumosMap[c.conta].linhas++;
    if (c.departamento) consumosMap[c.conta].deptos.add(c.departamento);
  }
  const allKeys = new Set([...Object.keys(resumoMap), ...Object.keys(consumosMap)]);
  const rows = [];
  for (const key of allKeys) {
    const override  = ov[key];
    const manualOK  = !!override?.ok;
    const r = resumoMap[key] || { global: key, hospede: '—', apto: '—', checkin: '', checkout: '', dateISO: null, vlTaxas: 0, vlNetISS: 0 };
    const c = consumosMap[key] || { vlConsumos: 0, linhas: 0, deptos: new Set() };
    const rawDiff = r.vlNetISS - c.vlConsumos;
    const status  = manualOK ? 'OK (manual)' : (Math.abs(rawDiff) <= TOLERANCE ? 'OK' : 'KO');
    rows.push({
      ...r, vlConsumos: c.vlConsumos, linhas: c.linhas,
      deptos: [...(c.deptos || [])].join(', '),
      diff: manualOK ? 0 : rawDiff,
      ok: manualOK || Math.abs(rawDiff) <= TOLERANCE,
      status, manualOK,
      manualComment: override?.comment || '',
      manualAt: override?.updatedAt || '',
    });
  }
  rows.sort((a, b) => { if (a.ok !== b.ok) return a.ok ? 1 : -1; return Math.abs(b.diff) - Math.abs(a.diff); });
  return rows;
}

function computeServicosSPA(consumos) {
  const map = {};
  for (const c of consumos) {
    // Label-based filtering
    if (c.catHITS !== 'SPA') continue;
    const dateISO = parseDateToISO(c.dataOperacao || c.data);
    if (!map[c.conta]) map[c.conta] = { conta: c.conta, hospede: c.hospede || '—', total: 0, linhas: 0, produtos: new Set(), dateISO };
    map[c.conta].total  += c.total || 0;
    map[c.conta].linhas++;
    if (c.produto) map[c.conta].produtos.add(c.produto);
    if (!map[c.conta].dateISO || (dateISO && dateISO < map[c.conta].dateISO)) map[c.conta].dateISO = dateISO;
  }
  return Object.values(map).map(r => ({ ...r, produtos: [...r.produtos].join(' · ') })).sort((a, b) => b.total - a.total);
}

/**
 * @param {object} overrides  { [global]: { ok: true, comment, updatedAt } }
 * Rows with overrides[global]?.ok === true are forced to OK (manual) and not re-analyzed.
 */
function computeTaxaPreservacao(resumos, consumos, taxaPerDiaria, overrides) {
  const taxa = Number(taxaPerDiaria) || 0;
  const ov = overrides || {};

  const spaMap = {};
  for (const c of consumos) {
    if (c.catHITS === 'SPA') spaMap[c.conta] = (spaMap[c.conta] || 0) + (c.total || 0);
  }
  const taxaAmbMap = {};
  for (const c of consumos) {
    if (c.catHITS === 'TAXA') taxaAmbMap[c.conta] = (taxaAmbMap[c.conta] || 0) + (c.total || 0);
  }

  const rows = [];
  for (const r of resumos) {
    if (isVoucherZero(r.voucher)) continue;

    const override      = ov[r.global];
    const manualOK      = !!override?.ok;
    const manualComment = override?.comment || '';
    const manualAt      = override?.updatedAt || '';

    // If manually reconciled: skip analysis, force OK
    if (manualOK) {
      rows.push({
        global: r.global, voucher: r.voucher, hospede: r.nomeHospede || '—', apto: r.apartamento || '—',
        checkin: r.checkin || '', checkout: r.checkout || '', dateISO: parseDateToISO(r.checkout),
        totalDiarias: r.totalDiarias || 0,
        valorDevido: (r.totalDiarias || 0) * taxa,
        taxaFaturada: taxaAmbMap[r.global] || 0, hasTaxaEntry: r.global in taxaAmbMap,
        spaTotal: spaMap[r.global] || 0, totalServicos: r.totalServicos || 0, vlDiarias: r.vlDiarias || 0,
        status: 'OK (manual)', incluidaNaDiaria: false, diff: 0, ok: true,
        manualOK, manualComment, manualAt,
      });
      continue;
    }

    const valorDevido  = (r.totalDiarias || 0) * taxa;
    const taxaFaturada = taxaAmbMap[r.global];
    const hasTaxaEntry = r.global in taxaAmbMap;
    const spaTotal     = spaMap[r.global] || 0;

    let status, diff, incluidaNaDiaria = false;
    if (hasTaxaEntry) {
      diff   = (taxaFaturada || 0) - valorDevido;   // + = faturado em excesso, − = faturado a menos
      status = Math.abs(diff) <= TOLERANCE ? 'OK' : 'KO';
    } else {
      const residuo = (r.totalServicos || 0) - (r.vlDiarias || 0) - spaTotal;
      diff = residuo - valorDevido;
      if (Math.abs(diff) <= TOLERANCE) { status = 'OK (incluída na diária)'; incluidaNaDiaria = true; diff = 0; }
      else { status = 'KO'; }
    }

    rows.push({
      global: r.global, voucher: r.voucher, hospede: r.nomeHospede || '—', apto: r.apartamento || '—',
      checkin: r.checkin || '', checkout: r.checkout || '', dateISO: parseDateToISO(r.checkout),
      totalDiarias: r.totalDiarias || 0, valorDevido,
      taxaFaturada: taxaFaturada || 0, hasTaxaEntry, spaTotal,
      totalServicos: r.totalServicos || 0, vlDiarias: r.vlDiarias || 0,
      status, incluidaNaDiaria, diff, ok: status.startsWith('OK'),
      manualOK: false, manualComment: '', manualAt: '',
    });
  }

  rows.sort((a, b) => { if (a.ok !== b.ok) return a.ok ? 1 : -1; return Math.abs(b.diff) - Math.abs(a.diff); });
  return rows;
}

/**
 * Compare entries from Resumo (File 1) to individual consumption logs (File 2).
 * This identifies missing log entries or discrepancies between summary fields and detailed lines.
 */
function computeIntegrityAudit(resumos, consumos) {
  // Aggregate Consumos by account/global
  const logMap = {};
  for (const c of consumos) {
    const key = c.conta || c.global || 'unknown';
    if (!logMap[key]) logMap[key] = { total: 0, items: 0 };
    logMap[key].total += c.total || 0;
    logMap[key].items += 1;
  }

  const rows = [];
  const processedGlobals = new Set();

  for (const r of resumos) {
    const key = r.global;
    if (!key) continue;
    processedGlobals.add(key);

    const valF1 = r.vlConsumos || 0;
    const statsF2 = logMap[key] || { total: 0, items: 0 };
    const diff = valF1 - statsF2.total;

    // Only report non-zero differences (tolerance 0.05)
    if (Math.abs(diff) > 0.05) {
      rows.push({
        global:    r.global,
        hospede:   r.nomeHospede || '—',
        checkout:  r.checkout || '—',
        valResumo: valF1,
        valLog:    statsF2.total,
        numLinhas: statsF2.items,
        diff,
        status:    statsF2.items === 0 ? 'MISSING_LOG' : 'DISCREPANCY',
      });
    }
  }

  // Check for logs that don't have a Resumo record
  for (const [key, stats] of Object.entries(logMap)) {
    if (!processedGlobals.has(key) && stats.total > 0.05) {
      if (key === 'unknown') continue;
      rows.push({
        global:    key,
        hospede:   'Não encontrado no Resumo',
        checkout:  '—',
        valResumo: 0,
        valLog:    stats.total,
        numLinhas: stats.items,
        diff:      -stats.total,
        status:    'ORPHAN_LOG',
      });
    }
  }

  return rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

// ── Editable KPI Card (inline value edit) ────────────────────────────────────

function EditableKpiCard({ label, value, onSave, color }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');

  const startEdit = () => { setDraft(String(value > 0 ? value : '')); setEditing(true); };
  const commit    = () => {
    const v = parseFloat(String(draft).replace(',', '.'));
    if (!isNaN(v) && v >= 0) onSave(v);
    setEditing(false);
  };

  return (
    <div
      onClick={!editing ? startEdit : undefined}
      title={!editing ? 'Clique para editar' : undefined}
      style={{
        background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '10px 14px',
        borderTop: `3px solid ${color}`,
        cursor: editing ? 'default' : 'pointer',
        boxShadow: editing ? `0 0 0 2px ${color}88` : '0 0 0 0 transparent',
        transition: 'box-shadow 0.2s',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        {label} <span style={{ fontSize: 9, opacity: 0.55 }}>✏️</span>
      </div>
      {editing ? (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color, fontWeight: 700 }}>R$</span>
          <input
            autoFocus
            type="number" min="0" step="0.01"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            onBlur={commit}
            style={{
              background: 'var(--color-bg-primary)', color,
              border: `1px solid ${color}`, borderRadius: 5,
              padding: '2px 6px', width: 84, fontSize: 14,
              fontWeight: 700, fontFamily: 'var(--font-mono)',
              outline: 'none',
            }}
          />
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>
          {value > 0
            ? `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : <span style={{ fontSize: 11, opacity: 0.55 }}>Clique para definir</span>}
        </div>
      )}
    </div>
  );
}

// ── Shared UI Atoms ───────────────────────────────────────────────────────────

function ReportModal({ title, color, children, onClose, onExport }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}
        style={{ width: '96vw', maxWidth: 1200, maxHeight: '93vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 24px', borderBottom: '1px solid var(--color-border)', background: `linear-gradient(135deg,${color}22,transparent)`, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color, flex: 1 }}>{title}</h2>
          {onExport && <button className="btn btn-ghost btn-sm" onClick={onExport} style={{ color: 'var(--color-green)' }}>📊 Excel</button>}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

function KpiStrip({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
      {items.map(k => (
        <div key={k.label} style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '10px 14px', borderTop: `3px solid ${k.color}` }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{k.label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: k.color }}>{k.value}</div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status, diff }) {
  const ok = status.startsWith('OK');
  const isManual = status === 'OK (manual)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      <span style={{
        padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
        background: ok ? (isManual ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)') : 'rgba(239,68,68,0.15)',
        color: ok ? (isManual ? 'var(--color-blue)' : 'var(--color-green)') : 'var(--color-red)',
      }}>{status}</span>
      {!ok && Math.abs(diff) > 0.001 && (
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-red)' }}>Δ {fmt(diff)}</span>
      )}
    </div>
  );
}

function KoToggle({ koOnly, setKoOnly, totalKo }) {
  return (
    <button className={`btn btn-sm ${koOnly ? 'btn-primary' : 'btn-ghost'}`}
      onClick={() => setKoOnly(f => !f)} style={{ fontSize: 12, marginBottom: 10 }}>
      {koOnly ? '⚠️ Solo KO' : '📋 Tutte le righe'} ({totalKo} KO)
    </button>
  );
}

// ── Manual Reconciliation Modal ───────────────────────────────────────────────

/** Generic reconciliation modal — summaryFields: Array<[label, value]> */
function ReconcileModal({ row, summaryFields, onSave, onRevoke, onClose }) {
  const [comment, setComment] = useState(row.manualComment || '');
  const isEdit = row.manualOK;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(480px,96vw)' }}>
        <h2 className="modal-title" style={{ color: isEdit ? 'var(--color-blue)' : 'var(--color-green)' }}>
          {isEdit ? '✏️ Editar Reconciliação Manual' : '✅ Reconciliação Manual'}
        </h2>

        {/* Row summary */}
        <div style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
            {summaryFields.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--color-text-muted)', minWidth: 80 }}>{k}:</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          {row.status !== 'OK (manual)' && (
            <div style={{ marginTop: 8, padding: '4px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: 12, color: 'var(--color-red)' }}>
              Status atual: <strong>{row.status}</strong>
              {Math.abs(row.diff) > 0.001 && <span>  Δ {fmt(row.diff)}</span>}
            </div>
          )}
        </div>

        {/* Comment */}
        <div className="form-group">
          <label className="form-label">Commento / Motivazione</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Inserisci una motivazione per la riconciliazione manuale..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            style={{ resize: 'vertical', minHeight: 72 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, flexWrap: 'wrap' }}>
          {isEdit && (
            <button className="btn btn-ghost" onClick={onRevoke}
              style={{ color: 'var(--color-red)', marginRight: 'auto' }}>
              🔄 Annulla riconciliação
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(comment)}
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)', borderColor: 'transparent' }}>
            ✅ {isEdit ? 'Aggiornare' : 'Reconciliar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Integrity Audit View ───────────────────────────────────────────────────────

function ReportAudit({ allRows, onClose }) {
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim,    setDataFim]    = useState('');
  const [search,     setSearch]     = useState('');

  const rows = useMemo(() => {
    return allRows.filter(r => {
      const q = search.toLowerCase();
      if (search && !r.global.toLowerCase().includes(q) && !r.hospede.toLowerCase().includes(q)) return false;
      const iso = parseDateToISO(r.checkout);
      if (dataInicio && iso && iso < dataInicio) return false;
      if (dataFim    && iso && iso > dataFim)    return false;
      return true;
    });
  }, [allRows, search, dataInicio, dataFim]);

  const stats = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.totalDiff += r.diff;
      if (r.status === 'MISSING_LOG') acc.missing++;
      else if (r.status === 'ORPHAN_LOG') acc.orphans++;
      else acc.discrepancy++;
      return acc;
    }, { totalDiff: 0, missing: 0, orphans: 0, discrepancy: 0 });
  }, [rows]);

  const handleExport = () => {
    const data = rows.map(r => ({
      'Voucher/Global': r.global,
      'Hóspede':        r.hospede,
      'Check-out':      r.checkout,
      'Vlr. Resumo (F1)': r.valResumo,
      'Vlr. Analítico (F2)': r.valLog,
      'Diferença (F1-F2)': r.diff,
      'Linhas no Log':   r.numLinhas,
      'Status':         r.status
    }));
    exportToExcel(data, 'hits_audit_integrità', 'Auditoria_Integridade_HITS');
  };

  return (
    <ReportModal title="🔍 Auditoria de Integridade (File 1 vs File 2)" color="#3b82f6" onClose={onClose} onExport={handleExport}>
      <DateRangeFilter
        months={extractMonths(allRows.map(r => parseDateToISO(r.checkout)).filter(Boolean))}
        startDate={dataInicio} endDate={dataFim} setStart={setDataInicio} setEnd={setDataFim}
      />

      <div style={{ display: 'flex', gap: 10, margin: '8px 0 16px' }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="🔍 Filtrar por voucher ou hóspede..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="contas-kpis" style={{ marginBottom: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="kpi-card" style={{ borderTop: '3px solid var(--color-red)' }}>
          <div className="kpi-label">Diferença Total</div>
          <div className="kpi-value" style={{ color: 'var(--color-red)' }}>{fmt(stats.totalDiff)}</div>
          <div className="kpi-sub">File 1 (Resumo) - File 2 (Log)</div>
        </div>
        <div className="kpi-card" style={{ borderTop: '3px solid var(--color-yellow)' }}>
          <div className="kpi-label">Inconsistências</div>
          <div className="kpi-value">{rows.length}</div>
          <div className="kpi-sub">{stats.missing} s/ log · {stats.discrepancy} dif. · {stats.orphans} s/ resumo</div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'auto', maxHeight: '50vh' }}>
        <table className="data-table">
          <thead><tr>
            <th>Voucher / Global</th>
            <th>Hóspede</th>
            <th>Check-out</th>
            <th style={{ textAlign: 'right' }}>Vl. Resumo (F1)</th>
            <th style={{ textAlign: 'right' }}>Vl. Analitico (F2)</th>
            <th style={{ textAlign: 'right' }}>Diferença</th>
            <th>Status</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.global}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent)' }}>{r.global}</td>
                <td>{r.hospede}</td>
                <td>{r.checkout}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(r.valResumo)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{fmt(r.valLog)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: Math.abs(r.diff) > 0.05 ? 'var(--color-red)' : 'var(--color-text-muted)' }}>
                  {fmt(r.diff)}
                </td>
                <td>
                  <span className="badge" style={{
                    background: r.status === 'MISSING_LOG' ? 'rgba(239,68,68,0.1)' : r.status === 'ORPHAN_LOG' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)',
                    color:      r.status === 'MISSING_LOG' ? 'var(--color-red)' : r.status === 'ORPHAN_LOG' ? 'var(--color-blue)' : 'var(--color-yellow)',
                    fontSize: 10
                  }}>
                    {r.status === 'MISSING_LOG' ? 'Sem registro no Log' : r.status === 'ORPHAN_LOG' ? 'Sem Resumo' : 'Diferença de valore'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportModal>
  );
}

// ── Report A: Consumos A&B ────────────────────────────────────────────────────

function ReportAB({ allRows, issRate, onIssRateChange, overrides, onOverridesChange, onClose }) {
  const [koOnly,      setKoOnly]  = useState(false);
  const [startDate,   setStart]   = useState('');
  const [endDate,     setEnd]     = useState('');
  const [reconciling, setRecon]   = useState(null);

  const months   = useMemo(() => extractMonths(allRows.map(r => r.dateISO)), [allRows]);
  const dateRows = useMemo(() => (startDate || endDate) ? allRows.filter(r => inRange(r.dateISO, startDate, endDate)) : allRows, [allRows, startDate, endDate]);
  const rows     = koOnly ? dateRows.filter(r => !r.ok) : dateRows;

  const totalNetISS   = dateRows.reduce((s, r) => s + r.vlNetISS,   0);
  const totalConsumos = dateRows.reduce((s, r) => s + r.vlConsumos, 0);
  const totalDiff     = totalNetISS - totalConsumos;
  const koCount       = dateRows.filter(r => !r.ok).length;
  const okManual      = dateRows.filter(r => r.manualOK).length;

  const handleSave = useCallback((row, comment) => {
    onOverridesChange({ ...overrides, [row.global]: { ok: true, comment, updatedAt: new Date().toISOString() } });
    setRecon(null);
  }, [overrides, onOverridesChange]);

  const handleRevoke = useCallback((row) => {
    const updated = { ...overrides };
    delete updated[row.global];
    onOverridesChange(updated);
    setRecon(null);
  }, [overrides, onOverridesChange]);

  const abSummaryFields = (r) => [
    ['Global',         r.global],
    ['Hóspede',        r.hospede],
    ['Apto',           r.apto],
    ['Check-out',      r.checkout],
    ['ISS (Taxas)',    fmt(r.vlTaxas)],
    ['Val. Liquido',  fmt(r.vlNetISS)],
    ['Consumos A&B',   fmt(r.vlConsumos)],
    ['Diferença',      fmt(r.diff)],
  ];

  const handleExport = () => exportToExcel(rows.map(r => ({
    'Global': r.global, 'Hóspede': r.hospede, 'Apto': r.apto,
    'Check-in': r.checkin, 'Check-out': r.checkout,
    'ISS (Taxas)': fmtN(r.vlTaxas),
    'Aliquota ISS (%)': issRate,
    'Val. Liquido': fmtN(r.vlNetISS),
    'Consumos A&B': fmtN(r.vlConsumos),
    'Diferença': fmtN(r.diff), 'Status': r.status,
    'Commento': r.manualComment || '',
  })), 'reconciliacao_consumos_ab', 'Consumos_AB');

  return (
    <>
      <ReportModal title="🧾 Consumos A&B — Reconciliação" color="#a78bfa" onClose={onClose} onExport={handleExport}>
        {/* KPI strip — Aliquota ISS è inline-editable */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
          <EditableKpiCard label="Aliquota ISS (%)" value={issRate} onSave={onIssRateChange} color="var(--color-purple)" />
          {[
            { label: 'Registros (filtro)', value: dateRows.length,    color: 'var(--color-accent)' },
            { label: 'KO (diferença)',     value: koCount,            color: koCount > 0 ? 'var(--color-red)' : 'var(--color-green)' },
            { label: 'OK (manual)',         value: okManual,           color: 'var(--color-blue)' },
            { label: 'Val. Liquido',       value: fmt(totalNetISS),   color: 'var(--color-purple)' },
            { label: 'Consumos A&B',        value: fmt(totalConsumos), color: 'var(--color-accent)' },
            { label: 'Diferença Totale',    value: fmt(totalDiff),     color: Math.abs(totalDiff) < 1 ? 'var(--color-green)' : 'var(--color-red)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '10px 14px', borderTop: `3px solid ${k.color}` }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
        <DateRangeFilter months={months} startDate={startDate} endDate={endDate} setStart={setStart} setEnd={setEnd} totalRows={allRows.length} filteredRows={dateRows.length} />
        <KoToggle koOnly={koOnly} setKoOnly={setKoOnly} totalKo={koCount} />
        <div style={{ overflow: 'auto' }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr>
              <th>Global</th><th>Hóspede</th><th>Apto</th><th>Check-in</th><th>Check-out</th>
              <th style={{ textAlign: 'right' }}>ISS (Taxas)</th>
              <th style={{ textAlign: 'right' }}>Val. Liquido</th>
              <th style={{ textAlign: 'right' }}>Consumos A&B</th>
              <th>Status</th><th>Commento</th><th style={{ textAlign: 'center' }}>Ação</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.global} style={{
                  background: !r.ok ? 'rgba(239,68,68,0.05)' : r.manualOK ? 'rgba(59,130,246,0.05)' : undefined
                }}>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', fontWeight: 700 }}>{r.global}</td>
                  <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.hospede}>{r.hospede}</td>
                  <td>{r.apto}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{r.checkin}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{r.checkout}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-text-muted)' }}>{fmt(r.vlTaxas)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-purple)' }}>{fmt(r.vlNetISS)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>{fmt(r.vlConsumos)}</td>
                  <td><StatusBadge status={r.status} diff={r.diff} /></td>
                  <td style={{ maxWidth: 150, fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.manualComment}>
                    {r.manualComment || ''}
                  </td>
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {r.ok ? (
                      <button title="Editar riconciliação" onClick={() => setRecon(r)}
                        style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--color-blue)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                        ✏️ Edit
                      </button>
                    ) : (
                      <button title="Reconciliar manualmente" onClick={() => setRecon(r)}
                        style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--color-green)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}>
                        ✅ Rec.
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportModal>
      {reconciling && (
        <ReconcileModal
          row={reconciling}
          summaryFields={abSummaryFields(reconciling)}
          onSave={(comment) => handleSave(reconciling, comment)}
          onRevoke={() => handleRevoke(reconciling)}
          onClose={() => setRecon(null)}
        />
      )}
    </>
  );
}

// ── Report B: Serviços SPA ────────────────────────────────────────────────────

function ReportSPA({ allRows, onClose }) {
  const [startDate, setStart] = useState('');
  const [endDate,   setEnd]   = useState('');

  const months = useMemo(() => extractMonths(allRows.map(r => r.dateISO)), [allRows]);
  const rows   = useMemo(() => (startDate || endDate) ? allRows.filter(r => inRange(r.dateISO, startDate, endDate)) : allRows, [allRows, startDate, endDate]);

  const handleExport = () => exportToExcel(rows.map(r => ({
    'Conta': r.conta, 'Hóspede': r.hospede, 'Total SPA': fmtN(r.total), 'Linhas': r.linhas, 'Produtos': r.produtos,
  })), 'hits_servicos_spa', 'Servicos_SPA');

  return (
    <ReportModal title="💆 Serviços SPA — Extração" color="#34d399" onClose={onClose} onExport={handleExport}>
      <KpiStrip items={[
        { label: 'Contas (filtro)', value: rows.length,                       color: 'var(--color-accent)' },
        { label: 'Total SPA',      value: fmt(rows.reduce((s,r)=>s+r.total,0)), color: 'var(--color-green)' },
      ]} />
      <DateRangeFilter months={months} startDate={startDate} endDate={endDate} setStart={setStart} setEnd={setEnd} totalRows={allRows.length} filteredRows={rows.length} />
      <div style={{ overflow: 'auto' }}>
        <table className="data-table" style={{ fontSize: 12 }}>
          <thead><tr><th>Conta</th><th>Hóspede</th><th style={{ textAlign: 'right' }}>Total SPA</th><th style={{ textAlign: 'center' }}>Linhas</th><th>Produtos</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.conta}>
                <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', fontWeight: 700 }}>{r.conta}</td>
                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.hospede}>{r.hospede}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-green)' }}>{fmt(r.total)}</td>
                <td style={{ textAlign: 'center' }}>{r.linhas}</td>
                <td style={{ fontSize: 11, color: 'var(--color-text-muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.produtos}>{r.produtos || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportModal>
  );
}

// ── Report C: Taxa Preservação ────────────────────────────────────────────────

function ReportTaxa({ allRows, taxa, onTaxaChange, empresaId, overrides, onOverridesChange, onClose }) {
  const [koOnly,    setKoOnly]    = useState(false);
  const [startDate, setStart]     = useState('');
  const [endDate,   setEnd]       = useState('');
  const [reconciling, setRecon]   = useState(null); // row being reconciled/edited

  const months   = useMemo(() => extractMonths(allRows.map(r => r.dateISO)), [allRows]);
  const dateRows = useMemo(() => (startDate || endDate) ? allRows.filter(r => inRange(r.dateISO, startDate, endDate)) : allRows, [allRows, startDate, endDate]);
  const rows     = koOnly ? dateRows.filter(r => !r.ok) : dateRows;

  const totalDevido   = dateRows.reduce((s, r) => s + r.valorDevido,  0);
  const totalFaturado = dateRows.reduce((s, r) => s + r.taxaFaturada, 0);
  const koCount       = dateRows.filter(r => !r.ok).length;
  const okManual      = dateRows.filter(r => r.manualOK).length;
  const okDiaria      = dateRows.filter(r => r.incluidaNaDiaria).length;

  // Save manual reconciliation
  const handleSave = useCallback((row, comment) => {
    const updated = { ...overrides, [row.global]: { ok: true, comment, updatedAt: new Date().toISOString() } };
    onOverridesChange(updated);
    setRecon(null);
  }, [overrides, onOverridesChange]);

  // Revoke manual reconciliation
  const handleRevoke = useCallback((row) => {
    const updated = { ...overrides };
    delete updated[row.global];
    onOverridesChange(updated);
    setRecon(null);
  }, [overrides, onOverridesChange]);

  const handleExport = () => exportToExcel(rows.map(r => ({
    'Global': r.global, 'Voucher': r.voucher, 'Hóspede': r.hospede, 'Apto': r.apto,
    'Check-in': r.checkin, 'Check-out': r.checkout, 'Diárias': r.totalDiarias,
    'Taxa/Diária': fmtN(taxa), 'Valor Devido': fmtN(r.valorDevido),
    'Taxa Faturada': r.hasTaxaEntry ? fmtN(r.taxaFaturada) : '—',
    'Status': r.status, 'Commento': r.manualComment || '', 'Diferença': r.ok ? '—' : fmtN(r.diff),
  })), 'reconciliacao_taxa_preservacao', 'Taxa_Preservacao');

  return (
    <>
      <ReportModal title="🌿 Taxa Preservação — Reconciliação" color="#f59e0b" onClose={onClose} onExport={handleExport}>
        {/* KPI strip — Taxa/Diária is inline-editable */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 16 }}>
          <EditableKpiCard label="Taxa/Diária" value={taxa} onSave={onTaxaChange} color="var(--color-yellow)" />
          {[
            { label: 'Registros (filtro)',       value: dateRows.length,    color: 'var(--color-accent)' },
            { label: 'KO (diferença)',           value: koCount,            color: koCount > 0 ? 'var(--color-red)' : 'var(--color-green)' },
            { label: 'OK (manual)',              value: okManual,           color: 'var(--color-blue)' },
            { label: 'OK (incluída na diária)',  value: okDiaria,           color: 'var(--color-purple)' },
            { label: 'Total Devido',             value: fmt(totalDevido),   color: 'var(--color-yellow)' },
            { label: 'Total Faturado',           value: fmt(totalFaturado), color: 'var(--color-green)' },
          ].map(k => (
            <div key={k.label} style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '10px 14px', borderTop: `3px solid ${k.color}` }}>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        <DateRangeFilter months={months} startDate={startDate} endDate={endDate} setStart={setStart} setEnd={setEnd} totalRows={allRows.length} filteredRows={dateRows.length} />
        <KoToggle koOnly={koOnly} setKoOnly={setKoOnly} totalKo={koCount} />

        <div style={{ overflow: 'auto' }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead><tr>
              <th>Global</th>
              <th>Hóspede</th>
              <th>Apto</th>
              <th>Check-out</th>
              <th style={{ textAlign: 'center' }}>Diárias</th>
              <th style={{ textAlign: 'right' }}>Vl. Devido</th>
              <th style={{ textAlign: 'right' }}>Taxa Faturada</th>
              <th>Status</th>
              <th>Commento</th>
              <th style={{ textAlign: 'center' }}>Ação</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.global} style={{
                  background: !r.ok
                    ? 'rgba(239,68,68,0.05)'
                    : r.manualOK
                      ? 'rgba(59,130,246,0.05)'
                      : r.incluidaNaDiaria
                        ? 'rgba(139,92,246,0.05)'
                        : undefined,
                }}>
                  <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', fontWeight: 700 }}>{r.global}</td>
                  <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.hospede}>{r.hospede}</td>
                  <td>{r.apto}</td>
                  {/* CHECKOUT (não check-in) */}
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{r.checkout}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.totalDiarias}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-yellow)', fontWeight: 700 }}>{fmt(r.valorDevido)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.hasTaxaEntry ? 'var(--color-green)' : 'var(--color-text-muted)' }}>
                    {r.hasTaxaEntry ? fmt(r.taxaFaturada) : '—'}
                  </td>
                  <td><StatusBadge status={r.status} diff={r.diff} /></td>
                  {/* Comment column */}
                  <td style={{ maxWidth: 160, fontSize: 11, color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={r.manualComment}>
                    {r.manualComment || ''}
                  </td>
                  {/* Action column */}
                  <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {r.ok ? (
                      /* OK rows: edit to change comment or revoke */
                      <button
                        title="Editar riconciliação"
                        onClick={() => setRecon(r)}
                        style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--color-blue)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
                      >✏️ Edit</button>
                    ) : (
                      /* KO rows: manual reconcile */
                      <button
                        title="Reconciliar manualmente"
                        onClick={() => setRecon(r)}
                        style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--color-green)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', fontWeight: 700 }}
                      >✅ Rec.</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportModal>

      {/* Manual Reconcile Modal (on top of report modal) */}
      {reconciling && (
        <ReconcileModal
          row={reconciling}
          summaryFields={[
            ['Global',     reconciling.global],
            ['Hóspede',    reconciling.hospede],
            ['Apto',       reconciling.apto],
            ['Check-out',  reconciling.checkout],
            ['Diárias',    reconciling.totalDiarias],
            ['Vl. Devido', fmt(reconciling.valorDevido)],
          ]}
          onSave={(comment) => handleSave(reconciling, comment)}
          onRevoke={() => handleRevoke(reconciling)}
          onClose={() => setRecon(null)}
        />
      )}
    </>
  );
}

// ── Taxa Input Modal ──────────────────────────────────────────────────────────

function TaxaInputModal({ onConfirm, onClose }) {
  const [taxa, setTaxa] = useState('');
  const [err,  setErr]  = useState('');
  const handleConfirm = () => {
    const v = parseFloat(taxa.replace(',', '.'));
    if (!taxa.trim() || isNaN(v) || v <= 0) { setErr('Inserisci un valore valido maggiore di 0'); return; }
    onConfirm(v);
  };
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ width: 'min(420px,96vw)' }}>
        <h2 className="modal-title">🌿 Taxa Preservação</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
          Inserisci il valore della taxa per notte (in R$) per calcolare il dovuto per ogni conto.
        </p>
        <div className="form-group">
          <label className="form-label">Valor Taxa por Diária (R$)</label>
          <input className="form-input" type="number" min="0.01" step="0.01" placeholder="Ex: 12.00"
            value={taxa} onChange={e => { setTaxa(e.target.value); setErr(''); }}
            autoFocus onKeyDown={e => e.key === 'Enter' && handleConfirm()} />
          {err && <div style={{ color: 'var(--color-red)', fontSize: 12, marginTop: 4 }}>{err}</div>}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm}
            style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderColor: 'transparent' }}>
            ▶ Calcular
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function HitsAnalysisPanel({ empresaId, consumos }) {
  const { resumos, loading: loadingResumos } = useHitsResumo(empresaId);

  // Persistent overrides — separate localStorage key per report per empresa
  const [abOverrides,   setAbOverridesState]   = useState(() => loadOverrides(`${empresaId}_ab`));
  const [taxaOverrides, setTaxaOverridesState] = useState(() => loadOverrides(`${empresaId}_taxa`));

  const updateAbOverrides = useCallback((updated) => {
    setAbOverridesState(updated);
    saveOverrides(`${empresaId}_ab`, updated);
  }, [empresaId]);

  const updateTaxaOverrides = useCallback((updated) => {
    setTaxaOverridesState(updated);
    saveOverrides(`${empresaId}_taxa`, updated);
  }, [empresaId]);

  // Persist taxa value per empresa
  const [taxaValue, setTaxaValueState] = useState(() => {
    const s = localStorage.getItem(`hits_taxa_val_${empresaId}`);
    return s ? Number(s) : 0;
  });
  const updateTaxaValue = useCallback((v) => {
    setTaxaValueState(v);
    localStorage.setItem(`hits_taxa_val_${empresaId}`, String(v));
  }, [empresaId]);

  const [activeModal, setActiveModal] = useState(null);

  // Persist ISS rate per empresa (for A&B reconciliation)
  const [issRate, setIssRateState] = useState(() => {
    const s = localStorage.getItem(`hits_iss_rate_${empresaId}`);
    return s ? Number(s) : 10; // default 10%
  });
  const updateIssRate = useCallback((v) => {
    setIssRateState(v);
    localStorage.setItem(`hits_iss_rate_${empresaId}`, String(v));
  }, [empresaId]);

  const allRowsAB   = useMemo(() => activeModal === 'AB'  ? computeConsumosAB(resumos, consumos, abOverrides, issRate) : null, [activeModal, resumos, consumos, abOverrides, issRate]);
  const allRowsSPA  = useMemo(() => activeModal === 'SPA'  ? computeServicosSPA(consumos)                                 : null, [activeModal, consumos]);
  const allRowsTaxa = useMemo(() =>
    activeModal === 'TAXA'
      ? computeTaxaPreservacao(resumos, consumos, taxaValue, taxaOverrides)
      : null,
    [activeModal, taxaValue, resumos, consumos, taxaOverrides]
  );
  const allRowsAudit = useMemo(() => activeModal === 'AUDIT' ? computeIntegrityAudit(resumos, consumos) : null, [activeModal, resumos, consumos]);

  const isReady = !loadingResumos && resumos.length > 0 && consumos.length > 0;

  const BUTTONS = [
    { id: 'AB',    label: 'Consumos A&B',     icon: '🧾', color: '#a78bfa', gradient: 'linear-gradient(135deg,#7c3aed,#a78bfa)', onClick: () => setActiveModal('AB') },
    { id: 'SPA',   label: 'Serviços SPA',     icon: '💆', color: '#34d399', gradient: 'linear-gradient(135deg,#059669,#34d399)', onClick: () => setActiveModal('SPA') },
    { id: 'TAXA',  label: 'Taxa Preservação', icon: '🌿', color: '#f59e0b', gradient: 'linear-gradient(135deg,#d97706,#fbbf24)', onClick: () => setActiveModal('TAXA') },
    { id: 'AUDIT', label: 'Auditoria Integridade', icon: '🔍', color: '#3b82f6', gradient: 'linear-gradient(135deg,#2563eb,#3b82f6)', onClick: () => setActiveModal('AUDIT') },
  ];

  const handleClose = () => setActiveModal(null);

  return (
    <>
      {/* ── Buttons ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)', alignSelf: 'center', marginRight: 4 }}>📊 Análises:</span>
        {BUTTONS.map(btn => (
          <button key={btn.id} onClick={btn.onClick} disabled={!isReady}
            title={!isReady ? 'Carrega ambos os arquivos HITS para habilitar as análises' : undefined}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              cursor: isReady ? 'pointer' : 'not-allowed',
              background: isReady ? btn.gradient : 'var(--color-bg-hover)',
              color: isReady ? '#fff' : 'var(--color-text-muted)',
              fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: isReady ? `0 2px 10px ${btn.color}44` : 'none',
              transition: 'transform 0.15s, box-shadow 0.15s', opacity: isReady ? 1 : 0.6,
            }}
            onMouseEnter={e => { if (isReady) { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 4px 18px ${btn.color}66`; }}}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = isReady ? `0 2px 10px ${btn.color}44` : 'none'; }}
          >
            <span style={{ fontSize: 16 }}>{btn.icon}</span>{btn.label}
          </button>
        ))}
        {!isReady && (
          <span style={{ fontSize: 11, color: 'var(--color-yellow)', alignSelf: 'center' }}>
            ⚠️ {resumos.length === 0 ? 'Resumo de Conta não carregado' : 'Consumos não carregados'}
          </span>
        )}
      </div>

      {/* ── Modals ── */}
      {activeModal === 'AUDIT' && allRowsAudit && <ReportAudit allRows={allRowsAudit} onClose={handleClose} />}
      {activeModal === 'AB'    && allRowsAB    && (
        <ReportAB
          allRows={allRowsAB}
          issRate={issRate}
          onIssRateChange={updateIssRate}
          overrides={abOverrides}
          onOverridesChange={updateAbOverrides}
          onClose={handleClose}
        />
      )}
      {activeModal === 'SPA'   && allRowsSPA   && <ReportSPA allRows={allRowsSPA} onClose={handleClose} />}
      {activeModal === 'TAXA'  && allRowsTaxa  && (
        <ReportTaxa
          allRows={allRowsTaxa}
          taxa={taxaValue}
          onTaxaChange={updateTaxaValue}
          empresaId={empresaId}
          overrides={taxaOverrides}
          onOverridesChange={updateTaxaOverrides}
          onClose={handleClose}
        />
      )}
    </>
  );
}
