/**
 * useArchive.js — Sistema universale di archiviazione storica
 *
 * Funziona su TUTTI i moduli che accumulano dati nel tempo.
 * I record con data ≤ cutoffDate vengono SPOSTATI (move, non copy)
 * dal DB attivo → DB storico separato (stesso pattern naming).
 *
 * Architettura:
 *   sombra_{empresaId}_{module}          → DB attivo
 *   sombra_{empresaId}_{module}_storico  → DB storico
 */
import { useCallback, useState } from 'react';
import { dbEntries, dbKeys, archiveRecords, getDB, DB_MODULES } from '../utils/db';

// ── Configurazione moduli archiviabili ──────────────────────────────────────
//
// dateField: campo della data usato per il cutoff.
//   Può essere una stringa (campo singolo) o un array (controlla in ordine, usa il primo non vuoto).
// storicoModule: chiave di DB_MODULES del modulo storico corrispondente.
//
export const ARCHIVE_MODULES_CONFIG = [
  {
    key:           DB_MODULES.HITS_RESUMO,
    storicoKey:    DB_MODULES.HITS_RESUMO_STORICO,
    label:         'HITS Reservas',
    dateField:     'checkout',
    icon:          '🏨',
  },
  {
    key:           DB_MODULES.HITS_CONSUMOS,
    storicoKey:    DB_MODULES.HITS_CONSUMOS_STORICO,
    label:         'HITS Consumos',
    dateField:     ['dataOperacao', 'data'],
    icon:          '🍽️',
  },
  {
    key:           DB_MODULES.RECEITAS,
    storicoKey:    DB_MODULES.RECEITAS_STORICO,
    label:         'Receitas',
    dateField:     'data',
    icon:          '💰',
  },
  {
    key:           DB_MODULES.EXTRATOS,
    storicoKey:    DB_MODULES.EXTRATOS_STORICO,
    label:         'Extratos Bancários',
    dateField:     'data',
    icon:          '🏦',
  },
  {
    key:           DB_MODULES.NFS_EMITIDAS,
    storicoKey:    DB_MODULES.NFS_EMITIDAS_STORICO,
    label:         'NFs Emitidas',
    dateField:     'dataEmissao',
    icon:          '🧾',
  },
  {
    key:           DB_MODULES.NFS_CONSUMOS,
    storicoKey:    DB_MODULES.NFS_CONSUMOS_STORICO,
    label:         'NFs Consumos',
    dateField:     'data',
    icon:          '📋',
  },
  {
    key:           DB_MODULES.BOOKINGS,
    storicoKey:    DB_MODULES.BOOKINGS_STORICO,
    label:         'Bookings',
    dateField:     'checkin',
    icon:          '📅',
  },
  {
    key:           DB_MODULES.REGISTRO_RESERVAS,
    storicoKey:    DB_MODULES.REGISTRO_RESERVAS_STORICO,
    label:         'Reservas (legacy)',
    dateField:     ['checkin', 'checkout'],
    icon:          '📋',
  },
  {
    key:           DB_MODULES.CONTAS_PAGAR,
    storicoKey:    DB_MODULES.CONTAS_PAGAR_STORICO,
    label:         'Contas a Pagar',
    dateField:     'vencimento',
    icon:          '💸',
  },
];

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Normalises DD/MM/YYYY or ISO to YYYY-MM-DD. Returns '' on failure. */
function toIso(dStr) {
  if (!dStr) return '';
  const s = String(dStr).split(' ')[0];
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return s;
}

/** Reads the date field from a record (supports array of fallback fields). */
function getDateValue(record, dateField) {
  const fields = Array.isArray(dateField) ? dateField : [dateField];
  for (const f of fields) {
    const v = record[f];
    if (v) return toIso(v);
  }
  return '';
}

// ── Preview ──────────────────────────────────────────────────────────────────

/**
 * Returns, for each enabled module, how many records would be archived
 * for the given empresa up to cutoffDate (YYYY-MM-DD).
 * Returns an array of { key, label, icon, count }.
 *
 * Does NOT modify any data.
 */
export async function getArchivePreviewAll(empresaId, cutoffDate, moduleKeys = null) {
  if (!empresaId || !cutoffDate) return [];

  const configs = moduleKeys
    ? ARCHIVE_MODULES_CONFIG.filter(c => moduleKeys.includes(c.key))
    : ARCHIVE_MODULES_CONFIG;

  const results = await Promise.all(
    configs.map(async (cfg) => {
      let count = 0;
      try {
        const db = getDB(empresaId, cfg.key);
        const entries = await dbEntries(db);
        count = entries.filter(([, r]) => {
          const iso = getDateValue(r, cfg.dateField);
          return iso && iso <= cutoffDate;
        }).length;
      } catch { /* module may not exist */ }
      return { key: cfg.key, label: cfg.label, icon: cfg.icon, count };
    })
  );

  return results;
}

// ── Storico totals ───────────────────────────────────────────────────────────

/**
 * Returns total record counts across all storico DBs for a given empresa.
 * Returns an array of { key, label, icon, count } (only modules with count > 0).
 */
export async function getStoricoSummary(empresaId) {
  if (!empresaId) return [];

  const results = await Promise.all(
    ARCHIVE_MODULES_CONFIG.map(async (cfg) => {
      let count = 0;
      try {
        const db = getDB(empresaId, cfg.storicoKey);
        const keys = await dbKeys(db);
        count = keys.length;
      } catch { /* not yet created */ }
      return { key: cfg.key, storicoKey: cfg.storicoKey, label: cfg.label, icon: cfg.icon, count };
    })
  );

  return results.filter(r => r.count > 0);
}

// Legacy compat: getStoricoTotals returns { resumos, consumos } for backwards compat
export async function getStoricoTotals(empresaId) {
  if (!empresaId) return { resumos: 0, consumos: 0 };
  const summary = await getStoricoSummary(empresaId);
  const r = summary.find(s => s.key === DB_MODULES.HITS_RESUMO);
  const c = summary.find(s => s.key === DB_MODULES.HITS_CONSUMOS);
  return {
    resumos:  r?.count ?? 0,
    consumos: c?.count ?? 0,
    total:    summary.reduce((sum, s) => sum + s.count, 0),
  };
}

// ── Archive operation ────────────────────────────────────────────────────────

/**
 * Archives records from the given modules for the given empresa up to cutoffDate.
 * Calls onProgress(pct: 0-100) periodically if provided.
 *
 * Returns an array of { key, label, moved, errors } per module.
 */
export async function archiveModulesUpTo(empresaId, cutoffDate, moduleKeys, onProgress) {
  if (!empresaId || !cutoffDate || !moduleKeys?.length) {
    throw new Error('empresaId, cutoffDate e moduli sono obbligatori');
  }

  const configs = ARCHIVE_MODULES_CONFIG.filter(c => moduleKeys.includes(c.key));
  const results = [];
  let done = 0;

  for (const cfg of configs) {
    const sourceDb = getDB(empresaId, cfg.key);
    const targetDb = getDB(empresaId, cfg.storicoKey);

    let keysToArchive = [];
    try {
      const entries = await dbEntries(sourceDb);
      keysToArchive = entries
        .filter(([, r]) => {
          const iso = getDateValue(r, cfg.dateField);
          return iso && iso <= cutoffDate;
        })
        .map(([k]) => k);
    } catch { /* nothing to archive */ }

    let moved = 0;
    let errors = 0;

    if (keysToArchive.length > 0) {
      const result = await archiveRecords(sourceDb, targetDb, keysToArchive);
      moved  = result.moved;
      errors = result.errors;
    }

    results.push({ key: cfg.key, label: cfg.label, icon: cfg.icon, moved, errors });
    done++;
    onProgress?.(Math.round((done / configs.length) * 100));
  }

  return results;
}

// Legacy compat (used by existing ConfiguracaoPage before universal refactor)
export async function archiveUpTo(empresaId, cutoffDate, onProgress) {
  const results = await archiveModulesUpTo(
    empresaId,
    cutoffDate,
    [DB_MODULES.HITS_RESUMO, DB_MODULES.HITS_CONSUMOS],
    onProgress
  );
  const r = results.find(x => x.key === DB_MODULES.HITS_RESUMO)  ?? { moved: 0, errors: 0 };
  const c = results.find(x => x.key === DB_MODULES.HITS_CONSUMOS) ?? { moved: 0, errors: 0 };
  return { resumosMoved: r.moved, consumosMoved: c.moved, errors: r.errors + c.errors };
}

// Legacy compat for ConfiguracaoPage getArchivePreview
export async function getArchivePreview(empresaId, cutoffDate) {
  const all = await getArchivePreviewAll(empresaId, cutoffDate, [
    DB_MODULES.HITS_RESUMO,
    DB_MODULES.HITS_CONSUMOS,
  ]);
  const r = all.find(x => x.key === DB_MODULES.HITS_RESUMO)  ?? { count: 0 };
  const c = all.find(x => x.key === DB_MODULES.HITS_CONSUMOS) ?? { count: 0 };
  return { resumos: r.count, consumos: c.count };
}

// ── React hook ───────────────────────────────────────────────────────────────

export function useArchive() {
  const [archiving, setArchiving] = useState(false);
  const [progress,  setProgress]  = useState(0);

  const runArchive = useCallback(async (empresaId, cutoffDate, moduleKeys) => {
    setArchiving(true);
    setProgress(0);
    try {
      const results = await archiveModulesUpTo(empresaId, cutoffDate, moduleKeys, setProgress);
      return results;
    } finally {
      setArchiving(false);
      setProgress(0);
    }
  }, []);

  return { archiving, progress, runArchive };
}

// Legacy compat
export function useHitsArchive() {
  const { archiving, progress, runArchive: runUniversal } = useArchive();
  const runArchive = useCallback(async (empresaId, cutoffDate) => {
    const results = await runUniversal(empresaId, cutoffDate, [
      DB_MODULES.HITS_RESUMO,
      DB_MODULES.HITS_CONSUMOS,
    ]);
    const r = results.find(x => x.key === DB_MODULES.HITS_RESUMO)  ?? { moved: 0, errors: 0 };
    const c = results.find(x => x.key === DB_MODULES.HITS_CONSUMOS) ?? { moved: 0, errors: 0 };
    return { resumosMoved: r.moved, consumosMoved: c.moved, errors: r.errors + c.errors };
  }, [runUniversal]);
  return { archiving, progress, runArchive };
}
