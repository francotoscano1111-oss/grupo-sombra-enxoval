/**
 * useConciliacao.js — CRUD for saved conciliation pairs
 *
 * Each record:
 * {
 *   id,           // uuid
 *   empresaId,
 *   grupo,        // 'receitas' | 'despesas'
 *   moduloA,      // e.g. 'entradas', 'nfs_emitidas'
 *   moduloB,      // e.g. 'nfs_emitidas', 'bookings'
 *   recordIdA,    // id of record from module A
 *   recordIdB,    // id of record from module B
 *   valorA,
 *   valorB,
 *   dataA,
 *   dataB,
 *   descricaoA,
 *   descricaoB,
 *   criadoEm,
 * }
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { dbGet, dbSet, dbDel, dbEntries, getDB, DB_MODULES } from '../utils/db';

export function useConciliacao(empresaId) {
  const [pares, setPares] = useState([]);
  const [loading, setLoading] = useState(true);

  const dbName = empresaId ? getDB(empresaId, DB_MODULES.CONCILIACAO) : null;

  const refresh = useCallback(async () => {
    if (!dbName) { setLoading(false); return; }
    setLoading(true);
    try {
      const entries = await dbEntries(dbName);
      setPares(entries.map(([, v]) => v));
    } catch (err) {
      console.warn('[useConciliacao] refresh error:', err);
      setPares([]);
    } finally {
      setLoading(false);
    }
  }, [dbName]);

  useEffect(() => { refresh(); }, [refresh]);

  const savePar = useCallback(async (data) => {
    if (!dbName) return;
    const id   = data.id || uuidv4();
    const record = { ...data, id, empresaId, criadoEm: data.criadoEm || new Date().toISOString() };
    await dbSet(dbName, id, record);
    await refresh();
    return record;
  }, [dbName, empresaId, refresh]);

  const deletePar = useCallback(async (id) => {
    if (!dbName) return;
    await dbDel(dbName, id);
    await refresh();
  }, [dbName, refresh]);

  /** Returns a Set of record IDs already conciliated, keyed by moduloA or moduloB */
  const conciliadoIds = useCallback((modulo) => {
    const ids = new Set();
    pares.forEach(p => {
      if (p.moduloA === modulo) ids.add(p.recordIdA);
      if (p.moduloB === modulo) ids.add(p.recordIdB);
    });
    return ids;
  }, [pares]);

  return { pares, loading, savePar, deletePar, conciliadoIds, refresh };
}
