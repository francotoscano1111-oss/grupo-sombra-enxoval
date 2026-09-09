/**
 * useBookings.js — CRUD for Bookings (Booking.com report) per empresa
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbDel, dbEntries, DB_MODULES } from '../utils/db';

export function useBookings(empresaId) {
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const db = empresaId ? getDB(empresaId, DB_MODULES.BOOKINGS) : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) =>
        (b.checkin || '').localeCompare(a.checkin || '')
      );
      setBookings(list);
    } catch (err) {
      console.warn('[useBookings] refresh error:', err);
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveBooking = useCallback(async (data) => {
    if (!db) return null;
    const record = {
      id:          data.id         || uuidv4(),
      empresaId,
      nReserva:    data.nReserva   ?? '',
      nomHospede:  data.nomHospede ?? '',
      checkin:     data.checkin    ?? '',
      checkout:    data.checkout   ?? '',
      tipo:        data.tipo       ?? 'Concluída',
      valor:       Number(data.valor)      || 0,
      commissao:   Number(data.commissao)  || 0,
      lote:        data.lote       ?? null,
      criadoEm:    data.criadoEm   ?? new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };
    await dbSet(db, record.id, record);
    setBookings(prev => {
      const filtered = prev.filter(b => b.id !== record.id);
      return [...filtered, record].sort((a, b) =>
        (b.checkin || '').localeCompare(a.checkin || '')
      );
    });
    return record;
  }, [db, empresaId]);

  const deleteBooking = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setBookings(prev => prev.filter(b => b.id !== id));
  }, [db]);

  const importBookings = useCallback(async (rows) => {
    if (!db) return 0;
    const lote = uuidv4();
    let count = 0;
    
    const newRecords = rows.map(row => ({
      id:          row.id         || uuidv4(),
      empresaId,
      nReserva:    row.nReserva   ?? '',
      nomHospede:  row.nomHospede ?? '',
      checkin:     row.checkin    ?? '',
      checkout:    row.checkout   ?? '',
      tipo:        row.tipo       ?? 'Concluída',
      valor:       Number(row.valor)      || 0,
      commissao:   Number(row.commissao)  || 0,
      lote:        lote           ?? null,
      criadoEm:    row.criadoEm   ?? new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    }));

    for (const record of newRecords) {
      await dbSet(db, record.id, record);
      count++;
    }

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
      let isDup = false;
      let existingMatch = null;
      for (const ext of existing) {
        if (ext.nReserva === row.nReserva && Number(ext.valor) === Number(row.valor)) {
           isDup = true; existingMatch = ext; break;
        }
      }
      if (isDup) duplicates.push({ row, index, existingRow: existingMatch });
      else clean.push({ row, index });
    });
    return { clean, duplicates };
  }, [db]);

  return { bookings, loading, saveBooking, deleteBooking, importBookings, checkDuplicates, refresh };
}
