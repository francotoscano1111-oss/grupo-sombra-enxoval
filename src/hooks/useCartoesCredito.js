/**
 * useCartoesCredito.js — Hook for multi-empresa consolidated credit card receipts.
 * Replaces useReceitasHub and adds support for the `adquirente_id` flag.
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbEntries, DB_MODULES, dbDel } from '../utils/db';
import { useEmpresa } from '../context/EmpresaContext';
import { useAdquirentes } from './useAdquirentes';

export const getAdquirenteDbName = (empId, adqId) => {
  if (adqId === 'stone') return getDB(empId, DB_MODULES.ENTRADAS_CONSOLIDADO);
  return getDB(empId, `cartoes_${adqId}`); // Fallback pattern for dynamic acquirers
};

export function useCartoesCredito(activeEmpresaId, adquirente_id) {
  const { empresas } = useEmpresa();
  const { adquirentes } = useAdquirentes(activeEmpresaId);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeEmpresaId || !adquirente_id) {
       setData([]);
       return;
    }
    setLoading(true);
    try {
      let allEntries = [];
      if (adquirente_id === 'todos') {
        for (const a of adquirentes) {
          const dbName = getAdquirenteDbName(activeEmpresaId, a.id);
          const entries = await dbEntries(dbName);
          allEntries.push(...entries.map(([, v]) => v));
        }
      } else {
        const dbName = getAdquirenteDbName(activeEmpresaId, adquirente_id);
        const entries = await dbEntries(dbName);
        allEntries = entries.map(([, v]) => v);
      }

      const list = allEntries.sort((a, b) => 
        (b.data || '').localeCompare(a.data || '')
      );
      setData(list);
    } catch (err) {
      console.warn('[useCartoesCredito] refresh error:', err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, adquirente_id, adquirentes]);

  useEffect(() => { refresh(); }, [refresh]);

  /** 
   * Import generic rows (must already be parsed).
   * Automatically adds adquirente_id to all rows.
   */
  const importCartoes = useCallback(async (rows, adquirente_id) => {
    const stats = { total: rows.length, success: 0, skipped: 0, split: {}, skippedCnpjs: new Set() };
    const now = new Date().toISOString();
    const lote = uuidv4();

    const cnpjMap = {};
    empresas.forEach(e => {
      const clean = (e.cnpj || '').replace(/\D/g, '');
      if (clean) cnpjMap[clean] = e;
    });

    const dbGroups = {};
    
    rows.forEach(row => {
      let target = null;
      if (row.empresaId) {
        target = empresas.find(e => e.id === row.empresaId);
      } else {
        const rawCnpj = String(row.cnpj || '').replace(/\D/g, '');
        target = cnpjMap[rawCnpj];
      }

      if (!target) {
        stats.skipped++;
        if (rawCnpj) stats.skippedCnpjs.add(rawCnpj);
        return;
      }

      const dbName = getAdquirenteDbName(target.id, adquirente_id);
      if (!dbGroups[dbName]) {
        dbGroups[dbName] = { target, pairs: [] };
      }

      const record = {
        ...row,
        id:           row.id || uuidv4(), // usually predefined by the parser for anti-duplication
        empresaId:    target.id,
        adquirente_id: adquirente_id,     // THE NEW FLAG!
        importadoEm:  now,
        lote,
      };

      dbGroups[dbName].pairs.push({ key: record.id, val: record });
      stats.success++;
      stats.split[target.name] = (stats.split[target.name] || 0) + 1;
    });

    for (const [dbName, { pairs }] of Object.entries(dbGroups)) {
      for (const { key, val } of pairs) {
        await dbSet(dbName, key, val);
      }
    }

    await refresh();
    return stats;
  }, [empresas, refresh]);

  const deleteMovements = useCallback(async (idsArray) => {
    if (!activeEmpresaId || !adquirente_id || !idsArray || idsArray.length === 0) return;
    try {
      if (adquirente_id === 'todos') {
        for (const a of adquirentes) {
          const dbName = getAdquirenteDbName(activeEmpresaId, a.id);
          for (const id of idsArray) { await dbDel(dbName, id); }
        }
      } else {
        const dbName = getAdquirenteDbName(activeEmpresaId, adquirente_id);
        for (const id of idsArray) { await dbDel(dbName, id); }
      }
      await refresh();
    } catch (err) {
      console.error('[useCartoesCredito] Error deleting movements:', err);
    }
  }, [activeEmpresaId, adquirente_id, adquirentes, refresh]);

  return { data, loading, importCartoes, deleteMovements, refresh };
}
