/**
 * useHitsConsumos.js — CRUD for HITS "Consumos Lançados" (File 2)
 * ArcoIris only — chave única composta: "Conta|Comanda|Produto"
 */
import { useState, useEffect, useCallback } from 'react';
import { getDB, dbSet, dbDel, dbEntries, dbClear, DB_MODULES } from '../utils/db';

/**
 * Converts an Excel date serial number to a readable DD/MM/YYYY string.
 * Excel serial 1 = 1900-01-01, with the leap year bug (serial 60 = 1900-02-29).
 */
/**
 * Locale-smart currency parser: handles both BR ("25.049,20") and US ("25049.20") formats.
 */
function parseBR(raw) {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).replace(/[R$\s%]/g, '').trim();
  if (!s) return 0;
  const lastDot   = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastComma > lastDot) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(/,/g, '')) || 0;
}

function excelDateToString(serial) {
  if (!serial || isNaN(Number(serial))) return String(serial ?? '');
  const n = Number(serial);
  // Excel epoch: Dec 30 1899 (accounting for the 1900 leap year bug)
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return d.toLocaleDateString('pt-BR');
}

export function useHitsConsumos(empresaId) {
  const [consumos, setConsumos] = useState([]);
  const [loading,  setLoading]  = useState(true);

  const db = empresaId ? getDB(empresaId, DB_MODULES.HITS_CONSUMOS) : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) =>
        (b.dataOperacao || '').localeCompare(a.dataOperacao || '')
      );
      setConsumos(list);
    } catch (err) {
      console.warn('[useHitsConsumos] refresh error:', err);
      setConsumos([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Import bulk rows from Excel File 2.
   * Strategy: NEVER skip identical records — append a suffix (_dup1, _dup2…) so every row is
   * saved. Potentially duplicate rows are flagged with possibleDuplicate=true so the user can
   * review and delete them from the UI. Only rows with truly empty required fields are skipped.
   * Returns { imported, skipped, skippedRows, flaggedRows }
   */
  const importConsumos = useCallback(async (rows) => {
    if (!db) return { imported: 0, skipped: 0, skippedRows: [], flaggedRows: [] };

    const existing = await dbEntries(db);
    const existingKeys = new Set(existing.map(([k]) => k));

    let imported    = 0;
    let skipped     = 0;
    const skippedRows  = [];
    const flaggedRows  = [];

    for (const row of rows) {
      const conta   = String(row['Conta']    ?? '').trim();
      const comanda = String(row['Comanda']  ?? '').trim();
      const produto = String(row['Produto']  ?? '').trim();
      const qtd     = Number(row['Quantidade']) || 0;
      const vlr     = parseBR(row['Total']);
      const dt      = String(row['Data de operação'] || row['Data'] || '').trim();

      if (!conta || !comanda || !produto) {
        skipped++;
        skippedRows.push({ motivo: 'Campo obrigatório vazio (Conta/Comanda/Produto)', conta, comanda, produto, dt, qtd, vlr });
        continue;
      }

      const baseKey = `${conta}|${comanda}|${produto}|${dt}|${qtd}|${vlr}`;

      // If key already exists, generate a unique suffixed key instead of skipping
      let compositeKey = baseKey;
      let dupIndex = 1;
      let isPossibleDuplicate = false;
      while (existingKeys.has(compositeKey)) {
        compositeKey = `${baseKey}|_dup${dupIndex++}`;
        isPossibleDuplicate = true;
      }

      if (isPossibleDuplicate) {
        flaggedRows.push({ conta, comanda, produto, dt, qtd, vlr });
      }

      // Handle Excel date serial for "Data" column
      const dataRaw = row['Data'];
      const dataFormatada = (typeof dataRaw === 'number')
        ? excelDateToString(dataRaw)
        : String(dataRaw ?? '');

      let catHITS = 'AB';
      const dept = String(row['Departamento'] ?? '').trim().toUpperCase();
      const prod = String(row['Produto']      ?? '').trim().toUpperCase();

      if (prod.includes('TAXA DE CONTRIBUIÇÃO AMBIENTAL')) {
        catHITS = 'TAXA';
      } else if (dept === 'SERVIÇOS SPA') {
        catHITS = 'SPA';
      } else if (dept === 'RECEPÇÃO') {
        catHITS = 'OUTROS';
      }

      const record = {
        id:                compositeKey,
        conta,
        comanda,
        produto,
        catHITS,
        possibleDuplicate: isPossibleDuplicate,
        nomeHotel:         row['Nome do hotel']         ?? '',
        data:              dataFormatada,
        dataOperacao:      row['Data de operação']       ?? '',
        operacao:          row['Operação']               ?? '',
        categoria:         row['Categoria']              ?? '',
        departamento:      row['Departamento']           ?? '',
        familia:           row['Família']                ?? '',
        quantidade:        Number(row['Quantidade'])     || 0,
        valor:             parseBR(row['Valor']),
        total:             parseBR(row['Total']),
        apartamento:       row['Apartamento']            ?? '',
        pontoVenda:        row['Ponto de venda']         ?? '',
        subconta:          String(row['Subconta'] ?? ''),
        hospede:           row['Hóspede']                ?? '',
        empresa:           row['Empresa']                ?? '',
        usuario:           row['Usuário']                ?? '',
        hospedeOrigem:     row['Hóspede origem']         ?? '',
        importadoEm:       new Date().toISOString(),
        empresaId,
      };

      await dbSet(db, compositeKey, record);
      existingKeys.add(compositeKey);
      imported++;
    }

    await refresh();
    return { imported, skipped, skippedRows, flaggedRows };
  }, [db, empresaId, refresh]);

  const clearConsumos = useCallback(async () => {
    if (!db) return;
    await dbClear(db);
    setConsumos([]);
  }, [db]);

  const deleteConsumo = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setConsumos(prev => prev.filter(c => c.id !== id));
  }, [db]);

  const deleteMultipleConsumos = useCallback(async (ids) => {
    if (!db) return;
    const idSet = new Set(ids);
    for (const id of ids) {
      await dbDel(db, id);
    }
    setConsumos(prev => prev.filter(c => !idSet.has(c.id)));
  }, [db]);

  return { consumos, loading, importConsumos, clearConsumos, deleteConsumo, deleteMultipleConsumos, refresh };
}
