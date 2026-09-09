/**
 * useRegistroReservas.js — CRUD for Registro de Reservas (HITs) per empresa
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbDel, dbEntries, DB_MODULES } from '../utils/db';

export function useRegistroReservas(empresaId) {
  const [reservas, setReservas] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const db = empresaId ? getDB(empresaId, DB_MODULES.REGISTRO_RESERVAS) : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) =>
        (b.checkin || '').localeCompare(a.checkin || '')
      );
      setReservas(list);
    } catch (err) {
      console.warn('[useRegistroReservas] refresh error:', err);
      setReservas([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveReserva = useCallback(async (data) => {
    if (!db) return null;
    const record = {
      id:           data.id           || uuidv4(),
      empresaId,
      voucher:      data.voucher      ?? '',
      inclusao:     data.inclusao     ?? '',
      checkin:      data.checkin      ?? '',
      checkout:     data.checkout     ?? '',
      rn:           Number(data.rn)   || 0,
      pax:          data.pax          ?? '',
      diarias:      Number(data.diarias)     || 0,
      valorReserva: Number(data.valorReserva) || 0,
      hospede:      data.hospede      ?? '',
      empresa:      data.empresa      ?? '',
      apto:         data.apto         ?? '',
      categoria:    data.categoria    ?? '',
      tarifa:       data.tarifa       ?? '',
      credito:      data.credito      ?? '',
      status:       data.status       ?? 'Realizada',
      lote:         data.lote         ?? null,
      criadoEm:     data.criadoEm     ?? new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    await dbSet(db, record.id, record);
    setReservas(prev => {
      const filtered = prev.filter(r => r.id !== record.id);
      return [...filtered, record].sort((a, b) =>
        (b.checkin || '').localeCompare(a.checkin || '')
      );
    });
    return record;
  }, [db, empresaId]);

  const deleteReserva = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setReservas(prev => prev.filter(r => r.id !== id));
  }, [db]);

  const clearReservas = useCallback(async () => {
    if (!db) return;
    try {
      const all = await dbEntries(db);
      for (const [key] of all) {
        await dbDel(db, key);
      }
      setReservas([]);
    } catch (err) {
      console.error('Failed to clear reservas:', err);
    }
  }, [db]);

  const importReservas = useCallback(async (rows) => {
    if (!db) return 0;
    const lote = uuidv4();
    let count = 0;
    
    // Generate all records avoiding state updates per row
    const newRecords = rows.map(row => ({
      id:           row.id           || uuidv4(),
      empresaId,
      voucher:      row.voucher      ?? '',
      inclusao:     row.inclusao     ?? '',
      checkin:      row.checkin      ?? '',
      checkout:     row.checkout     ?? '',
      rn:           Number(row.rn)   || 0,
      pax:          row.pax          ?? '',
      diarias:      Number(row.diarias)     || 0,
      valorReserva: Number(row.valorReserva) || 0,
      hospede:      row.hospede      ?? '',
      empresa:      row.empresa      ?? '',
      apto:         row.apto         ?? '',
      categoria:    row.categoria    ?? '',
      tarifa:       row.tarifa       ?? '',
      credito:      row.credito      ?? '',
      status:       row.status       ?? 'Realizada',
      lote:         lote             ?? null,
      criadoEm:     row.criadoEm     ?? new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    }));

    // Sequential bulk insert
    for (const record of newRecords) {
      await dbSet(db, record.id, record);
      count++;
    }

    // Single state refresh
    await refresh();
    return count;
  }, [db, empresaId, refresh]);

  const checkDuplicates = useCallback(async (newRows) => {
    if (!db) return { clean: [], duplicates: [] };
    const all = await dbEntries(db);
    const existing = all.map(([, v]) => v);

    const clean = [];
    const duplicates = [];

    newRows.forEach((row, index) => {
      const isConcept = row.empresa?.toLowerCase().includes('concept');
      let isDup = false;
      let existingMatch = null;

      for (const ext of existing) {
        if (isConcept) {
           if (ext.voucher === row.voucher && ext.hospede === row.hospede && Number(ext.valorReserva) === Number(row.valorReserva)) {
              isDup = true; existingMatch = ext; break;
           }
        } else {
           if (ext.voucher === row.voucher && ext.hospede === row.hospede) {
              isDup = true; existingMatch = ext; break;
           }
        }
      }

      if (isDup) {
        duplicates.push({ row, index, existingRow: existingMatch });
      } else {
        clean.push({ row, index });
      }
    });

    return { clean, duplicates };
  }, [db]);

  return { reservas, loading, saveReserva, deleteReserva, clearReservas, importReservas, checkDuplicates, refresh };
}
