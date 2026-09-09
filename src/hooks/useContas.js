/**
 * useContas.js — Generic hook for Receitas and Despesas CRUD + reconciliation
 * @param {string} empresaId
 * @param {'receitas'|'despesas'} module
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbGet, dbSet, dbDel, dbEntries } from '../utils/db';
import { todayISO } from '../utils/dateUtils';

export function useContas(empresaId, module) {
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);

  const db = empresaId && module ? getDB(empresaId, module) : null;

  // Load all records from IndexedDB
  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const records = ents.map(([, v]) => v).sort((a, b) => {
        if (!a.vencimento && !b.vencimento) return 0;
        if (!a.vencimento) return 1;
        if (!b.vencimento) return -1;
        return new Date(a.vencimento) - new Date(b.vencimento);
      });
      setContas(records);
    } catch (err) {
      console.warn('[useContas] refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  // Add a new conta
  const addConta = useCallback(async (data) => {
    if (!db) return;
    const nova = {
      id: uuidv4(),
      empresaId,
      module,
      ...data,
      status: data.status || 'Pendente',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    await dbSet(db, nova.id, nova);
    setContas(prev => [...prev, nova].sort((a, b) => {
      if (!a.vencimento) return 1;
      if (!b.vencimento) return -1;
      return new Date(a.vencimento) - new Date(b.vencimento);
    }));
    return nova;
  }, [empresaId, module, db]);

  // Update a conta
  const updateConta = useCallback(async (id, updates) => {
    if (!db) return;
    const existing = await dbGet(db, id);
    if (!existing) return;
    const updated = { ...existing, ...updates, atualizadoEm: new Date().toISOString() };
    await dbSet(db, id, updated);
    setContas(prev => prev.map(c => c.id === id ? updated : c));
    return updated;
  }, [db]);

  // Delete a conta
  const deleteConta = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setContas(prev => prev.filter(c => c.id !== id));
  }, [db]);

  // Bulk import (from file parser)
  const importContas = useCallback(async (rows) => {
    if (!db) return 0;
    let count = 0;
    for (const row of rows) {
      const nova = {
        id: uuidv4(),
        empresaId,
        module,
        ...row,
        status: row.status || 'Pendente',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        _imported: true,
      };
      await dbSet(db, nova.id, nova);
      count++;
    }
    await refresh();
    return count;
  }, [empresaId, module, db, refresh]);

  // KPI aggregations
  const kpis = {
    total: contas.reduce((s, c) => s + (Number(c.valor) || 0), 0),
    pendente: contas.filter(c => c.status === 'Pendente').reduce((s, c) => s + (Number(c.valor) || 0), 0),
    vencidas: contas.filter(c => {
      if (!c.vencimento || c.status === 'Conciliado' || c.status === 'Pago' || c.status === 'Recebido') return false;
      return new Date(c.vencimento + 'T00:00:00') < new Date();
    }).reduce((s, c) => s + (Number(c.valor) || 0), 0),
    conciliado: contas.filter(c => c.status === 'Conciliado').reduce((s, c) => s + (Number(c.valor) || 0), 0),
    count: contas.length,
    countPendente: contas.filter(c => c.status === 'Pendente').length,
    countVencidas: contas.filter(c => {
      if (!c.vencimento || c.status === 'Conciliado' || c.status === 'Pago' || c.status === 'Recebido') return false;
      return new Date(c.vencimento + 'T00:00:00') < new Date();
    }).length,
  };

  return {
    contas,
    loading,
    kpis,
    addConta,
    updateConta,
    deleteConta,
    importContas,
    refresh,
  };
}
