/**
 * useReceitasHub.js — Hook for multi-empresa consolidated receipts.
 * Handles parsing a file with a CNPJ column and splitting rows into target empresa DBs.
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbEntries, DB_MODULES, dbDel } from '../utils/db';
import { useEmpresa } from '../context/EmpresaContext';

export function useReceitasHub(activeEmpresaId) {
  const { empresas } = useEmpresa();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // If activeEmpresaId is null (Geral Hub), we could fetch for all companies
  // but for now let's just use it to show the active company's shard.
  const refresh = useCallback(async () => {
    if (!activeEmpresaId) {
       setData([]);
       return;
    }
    setLoading(true);
    try {
      const dbName = getDB(activeEmpresaId, DB_MODULES.ENTRADAS_CONSOLIDADO);
      const entries = await dbEntries(dbName);
      const list = entries.map(([, v]) => v).sort((a, b) => 
        (b.data || '').localeCompare(a.data || '')
      );
      setData(list);
    } catch (err) {
      console.warn('[useReceitasHub] refresh error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId]);

  useEffect(() => { refresh(); }, [refresh]);

  /** 
   * Main feature: Import a list of rows from any company.
   * Splits rows by CNPJ and saves to respective DBs.
   */
  const importConsolidado = useCallback(async (rows) => {
    const stats = { total: rows.length, success: 0, skipped: 0, split: {}, skippedCnpjs: new Set() };
    const now = new Date().toISOString();
    const lote = uuidv4();

    // Map for fast lookup (normalized CNPJ -> Empresa)
    const cnpjMap = {};
    empresas.forEach(e => {
      const clean = (e.cnpj || '').replace(/\D/g, '');
      if (clean) cnpjMap[clean] = e;
    });

    // Group rows by target DB to minimize opening/closing transactions
    const dbGroups = {};
    
    rows.forEach(row => {
      const rawCnpj = String(row.cnpj || '').replace(/\D/g, '');
      const target = cnpjMap[rawCnpj];

      if (!target) {
        stats.skipped++;
        if (rawCnpj) stats.skippedCnpjs.add(rawCnpj);
        return;
      }

      const dbName = getDB(target.id, DB_MODULES.ENTRADAS_CONSOLIDADO);
      if (!dbGroups[dbName]) {
        dbGroups[dbName] = { target, pairs: [] };
      }

      const record = {
        ...row,
        id:           row.id || uuidv4(),
        empresaId:    target.id,
        importadoEm:  now,
        lote,
      };

      dbGroups[dbName].pairs.push({ key: record.id, val: record });
      stats.success++;
      stats.split[target.name] = (stats.split[target.name] || 0) + 1;
    });

    // Execute sequentially to avoid any browser IDB concurrency/bulk limits
    for (const [dbName, { pairs }] of Object.entries(dbGroups)) {
      for (const { key, val } of pairs) {
        await dbSet(dbName, key, val);
      }
    }

    await refresh();
    return stats;
  }, [empresas, refresh]);

  const deleteMovements = useCallback(async (idsArray) => {
    if (!activeEmpresaId || !idsArray || idsArray.length === 0) return;
    try {
      const dbName = getDB(activeEmpresaId, DB_MODULES.ENTRADAS_CONSOLIDADO);
      for (const id of idsArray) {
        await dbDel(dbName, id);
      }
      await refresh();
    } catch (err) {
      console.error('[useReceitasHub] Error deleting movements:', err);
    }
  }, [activeEmpresaId, refresh]);

  return { data, loading, importConsolidado, deleteMovements, refresh };
}
