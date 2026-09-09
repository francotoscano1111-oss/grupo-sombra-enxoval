/**
 * useNfsConsumos.js — CRUD for "NFs Emitidas - Consumos" (Tinus export)
 *
 * Formato colonne Excel:
 *   Global | Tipo | Série | Num. | Pedido | Out | Data | Cancelamento |
 *   Empresa/Hóspede | Documento | Vl Pagto. | Comanda | Status
 *
 * Chave única: Num. (número da NF — único por nota fiscal emitida)
 */
import { useState, useEffect, useCallback } from 'react';
import { getDB, dbSet, dbDel, dbEntries, dbClear, DB_MODULES } from '../utils/db';

/**
 * Locale-smart currency parser: handles both BR ("25.049,20") and US ("25049.20") formats.
 * - If last separator is comma  → BR format: remove dots (thousands), replace comma with dot
 * - If last separator is dot    → US format: remove commas (thousands), keep dot as decimal
 * - If value is already a JS number → return as-is (SheetJS numeric cell)
 */
function parseBR(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).replace(/[R$\s%]/g, '').trim();
  if (!s) return 0;
  const lastDot   = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastComma > lastDot) {
    // Brazilian format: "25.049,20" or "182,50"
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // US / ISO format: "25049.20" or "1,234.56" — remove commas, keep dot
  return parseFloat(s.replace(/,/g, '')) || 0;
}

function excelDateToString(serial) {
  if (!serial || isNaN(Number(serial))) return String(serial ?? '');
  const d = new Date(Math.round((Number(serial) - 25569) * 86400 * 1000));
  return d.toLocaleDateString('pt-BR');
}

export function useNfsConsumos(empresaId) {
  const [nfsConsumos, setNfsConsumos] = useState([]);
  const [loading,     setLoading]     = useState(true);

  const db = empresaId ? getDB(empresaId, DB_MODULES.NFS_CONSUMOS) : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) =>
        (b.data || '').localeCompare(a.data || '')
      );
      setNfsConsumos(list);
    } catch (err) {
      console.warn('[useNfsConsumos] refresh error:', err);
      setNfsConsumos([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Importa righe dal file Excel "NF emitidas CONSUMOS".
   * Salta la prima riga vuota (row 0) — le intestazioni sono alla riga 1.
   * Dedup key: "Global|Num."
   * Restituisce { imported, skipped }
   */
  const importNfsConsumos = useCallback(async (rows) => {
    if (!db) return { imported: 0, skipped: 0 };

    const existing = await dbEntries(db);
    const existingKeys = new Set(existing.map(([k]) => k));

    let imported = 0;
    let skipped  = 0;

    for (const row of rows) {
      const num = String(row['Num.'] ?? '').trim();

      // Salta righe senza número NF
      if (!num) { skipped++; continue; }

      const compositeKey = num;

      if (existingKeys.has(compositeKey)) {
        skipped++;
        continue;
      }

      // Converti date Excel serial → stringa leggibile
      const dataRaw = row['Data'];
      const outRaw  = row['Out'];
      const dataStr = (typeof dataRaw === 'number') ? excelDateToString(dataRaw) : String(dataRaw ?? '');
      const outStr  = (typeof outRaw  === 'number') ? excelDateToString(outRaw)  : String(outRaw  ?? '');

      const global = String(row['Global'] ?? '').trim();

      const record = {
        id:             compositeKey,
        global,
        tipo:           String(row['Tipo']            ?? ''),
        serie:          row['Série']                  ?? '',
        numero:         num,
        pedido:         String(row['Pedido']          ?? ''),
        out:            outStr,
        data:           dataStr,
        cancelamento:   row['Cancelamento']           ?? null,
        empresaHospede: String(row['Empresa/Hóspede'] ?? ''),
        documento:      String(row['Documento']       ?? ''),
        vlPagto:        parseBR(row['Vl Pagto.']),
        comanda:        String(row['Comanda']         ?? ''),
        status:         String(row['Status']          ?? ''),
        importadoEm:    new Date().toISOString(),
        empresaId,
      };

      await dbSet(db, compositeKey, record);
      existingKeys.add(compositeKey);
      imported++;
    }

    await refresh();
    return { imported, skipped };
  }, [db, empresaId, refresh]);

  const clearNfsConsumos = useCallback(async () => {
    if (!db) return;
    await dbClear(db);
    setNfsConsumos([]);
  }, [db]);

  const deleteNfsConsumo = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setNfsConsumos(prev => prev.filter(c => c.id !== id));
  }, [db]);

  return { nfsConsumos, loading, importNfsConsumos, clearNfsConsumos, deleteNfsConsumo, refresh };
}
