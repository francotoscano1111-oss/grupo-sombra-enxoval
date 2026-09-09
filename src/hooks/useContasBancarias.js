/**
 * useContasBancarias.js — CRUD for bank accounts (contas bancárias) per empresa
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbDel, dbEntries } from '../utils/db';

export function useContasBancarias(empresaId) {
  const [contas, setContas] = useState([]);
  const [loading, setLoading] = useState(true);

  const db = empresaId ? getDB(empresaId, 'contas_bancarias') : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) => a.nome.localeCompare(b.nome));
      setContas(list);
    } catch (err) {
      console.warn('[useContasBancarias] refresh error:', err);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  const addConta = useCallback(async (data) => {
    if (!db) return null;
    const nova = {
      id: uuidv4(),
      empresaId,
      nome:    data.nome?.trim() || 'Banco',
      agencia: data.agencia?.trim() || '',
      conta:   data.conta?.trim() || '',
      tipo:    data.tipo || 'Conta Corrente',
      moeda:   data.moeda || 'BRL',
      cor:     data.cor || '#5d7cf2',
      ativa:   true,
      criadoEm: new Date().toISOString(),
    };
    await dbSet(db, nova.id, nova); // throws if DB issue → caught by caller's finally
    setContas(prev => [...prev, nova].sort((a, b) => a.nome.localeCompare(b.nome)));
    return nova;
  }, [db, empresaId]);

  const updateConta = useCallback(async (updated) => {
    if (!db) return;
    const record = { ...updated, atualizadoEm: new Date().toISOString() };
    await dbSet(db, record.id, record);
    setContas(prev => prev.map(c => c.id === record.id ? record : c));
  }, [db]);

  const deleteConta = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setContas(prev => prev.filter(c => c.id !== id));
  }, [db]);

  return { contas, loading, addConta, updateConta, deleteConta, refresh };
}
