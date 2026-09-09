/**
 * useExtratos.js — CRUD for bank statement movements (extratos) per empresa + banca
 * Key feature: deduplication on import (data + valor + descrição + contaBancariaId)
 * Fuzzy dedup: same date + |valor|, description similarity 60-89% → propose to user
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbDel, dbEntries } from '../utils/db';

/**
 * Generate a deduplication fingerprint for a movement.
 */
function dedupKey(mov) {
  const d    = (mov.data || '').trim();
  const v    = String(Math.abs(Number(mov.valor)) || 0);
  const desc = (mov.descricao || '').trim().toLowerCase().slice(0, 40);
  const conta = mov.contaBancariaId || '';
  return `${conta}|${d}|${v}|${desc}`;
}

/**
 * Dice coefficient similarity between two strings (bigram-based).
 * Returns a value 0.0 (completely different) to 1.0 (identical).
 */
function strSimilarity(a, b) {
  const normalize = s => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const s1 = normalize(a);
  const s2 = normalize(b);
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const bigrams1 = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  let intersect = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      intersect++;
      bigrams1.set(bg, count - 1);
    }
  }

  return (2 * intersect) / (s1.length - 1 + s2.length - 1);
}

// Similarity thresholds
const SIMILARITY_EXACT  = 0.90; // auto-skip
const SIMILARITY_FUZZY  = 0.60; // propose to user

export function useExtratos(empresaId, contaBancariaId = null, dateFrom = null, dateTo = null) {
  const [extratos, setExtratos] = useState([]);
  const [loading, setLoading] = useState(true);

  const db = empresaId ? getDB(empresaId, 'extratos') : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      
      // Filter the array *before* mapping to reduce RAM usage for large datasets
      const filteredEnts = ents.filter(([, v]) => {
        if (contaBancariaId && v.contaBancariaId !== contaBancariaId) return false;
        if (dateFrom && (v.data || '') < dateFrom) return false;
        if (dateTo && (v.data || '') > dateTo) return false;
        return true;
      });

      let list = filteredEnts.map(([, v]) => {
        if (!v.moduloDestino) {
           const isCred = (v.tipo === 'crédito' || Number(v.valor) >= 0);
           return { ...v, moduloDestino: isCred ? 'receitas' : 'despesas' };
        }
        return v;
      });
      list.sort((a, b) => (a.data > b.data ? -1 : a.data < b.data ? 1 : 0));
      setExtratos(list);
    } catch (err) {
      console.warn('[useExtratos] refresh error:', err);
      setExtratos([]);
    } finally {
      setLoading(false);
    }
  }, [db, contaBancariaId, dateFrom, dateTo]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Bulk import with deduplication — skips movements already in db.
   * Returns { imported, skipped, lote }.
   */
  const importExtratos = useCallback(async (rows, contaBancariaIdTarget) => {
    if (!db) return { imported: 0, skipped: 0 };

    // Build dedup set from ALL existing extratos for this empresa
    const all = await dbEntries(db);
    const allRows = all.map(([, v]) => v);
    const existingKeys  = new Set(allRows.map(v => dedupKey(v)).filter(Boolean));

    const lote = uuidv4();
    let imported = 0, skipped = 0;
    const skippedRows = [];
    const sessionImportedRows = [];

    for (const row of rows) {
      const mov = {
        id:              uuidv4(),
        empresaId,
        contaBancariaId: contaBancariaIdTarget,
        data:            row.data || '',
        descricao:       (row.descricao || '').trim(),
        valor:           Number(row.valor) || 0,
        tipo:            row.tipo || (Number(row.valor) >= 0 ? 'crédito' : 'débito'),
        moduloDestino:   row.moduloDestino || (Number(row.valor) >= 0 ? 'receitas' : 'despesas'),
        saldo:           row.saldo != null ? Number(row.saldo) : null,
        documento:       row.documento || '',
        historico:       row.historico || '',
        categoria:       row.categoria || '',
        conciliado:      false,
        conciliadoCom:   null,
        conciliadoTipo:  null,
        lote,
        fonte:           row._fonte || 'excel',
        criadoEm:        new Date().toISOString(),
      };

      const key = dedupKey(mov);
      if (existingKeys.has(key)) {
        skipped++;
        const existingMatch = allRows.find(v => dedupKey(v) === key) || sessionImportedRows.find(v => dedupKey(v) === key) || null;
        if (existingMatch && !allRows.includes(existingMatch)) {
          existingMatch._fromSession = true;
        }
        skippedRows.push({ incoming: mov, existing: existingMatch });
        continue;
      }
      existingKeys.add(key);
      sessionImportedRows.push(mov);
      await dbSet(db, mov.id, mov);
      imported++;
    }

    await refresh();
    return { imported, skipped, lote, skippedRows };
  }, [db, empresaId, refresh]);

  /**
   * Force-insert rows bypassing dedup (used when user overrides a skip).
   */
  const forceInsertExtratos = useCallback(async (rows, contaBancariaIdTarget) => {
    if (!db || !rows.length) return;
    const lote = uuidv4();
    for (const row of rows) {
      const mov = {
        id:              uuidv4(),
        empresaId,
        contaBancariaId: contaBancariaIdTarget,
        data:            row.data || '',
        descricao:       (row.descricao || '').trim(),
        valor:           Number(row.valor) || 0,
        tipo:            row.tipo || (Number(row.valor) >= 0 ? 'crédito' : 'débito'),
        moduloDestino:   row.moduloDestino || (Number(row.valor) >= 0 ? 'receitas' : 'despesas'),
        saldo:           row.saldo != null ? Number(row.saldo) : null,
        documento:       row.documento || '',
        historico:       row.historico || '',
        categoria:       row.categoria || '',
        conciliado:      false,
        conciliadoCom:   null,
        conciliadoTipo:  null,
        lote,
        fonte:           row.fonte || row._fonte || 'excel',
        criadoEm:        new Date().toISOString(),
      };
      await dbSet(db, mov.id, mov);
    }
    await refresh();
  }, [db, empresaId, refresh]);

  const addExtrato = useCallback(async (data) => {
    if (!db) return;
    const mov = {
      id: uuidv4(),
      empresaId,
      ...data,
      moduloDestino: data.moduloDestino || (Number(data.valor) >= 0 ? 'receitas' : 'despesas'),
      conciliado: false,
      conciliadoCom: null,
      conciliadoTipo: null,
      fonte: 'manual',
      lote: null,
      criadoEm: new Date().toISOString(),
    };
    await dbSet(db, mov.id, mov);
    await refresh();
    return mov;
  }, [db, empresaId, refresh]);

  const updateExtrato = useCallback(async (id, updates) => {
    if (!db) return;
    const all = await dbEntries(db);
    const existing = all.find(([k]) => k === id)?.[1];
    if (!existing) return;
    const updated = { ...existing, ...updates, atualizadoEm: new Date().toISOString() };
    await dbSet(db, id, updated);
    setExtratos(prev => prev.map(e => e.id === id ? updated : e));
    return updated;
  }, [db]);

  const bulkUpdateExtratos = useCallback(async (idsArray, updates) => {
    if (!db || !idsArray || !idsArray.length) return;
    const all = await dbEntries(db);
    const existingMap = new Map(all);
    const now = new Date().toISOString();
    
    // Batch save
    for (const id of idsArray) {
      const current = existingMap.get(id);
      if (current) {
        await dbSet(db, id, { ...current, ...updates, atualizadoEm: now });
      }
    }
    await refresh();
  }, [db, refresh]);

  const deleteExtrato = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setExtratos(prev => prev.filter(e => e.id !== id));
  }, [db]);

  const deleteLote = useCallback(async (lote) => {
    if (!db) return 0;
    const all = await dbEntries(db);
    const toDelete = all.filter(([, v]) => v.lote === lote);
    for (const [k] of toDelete) await dbDel(db, k);
    await refresh();
    return toDelete.length;
  }, [db, refresh]);

  const kpis = {
    totalCreditos:    extratos.filter(e => e.tipo === 'crédito' || Number(e.valor) > 0).reduce((s, e) => s + Math.abs(Number(e.valor)), 0),
    totalDebitos:     extratos.filter(e => e.tipo === 'débito'  || Number(e.valor) < 0).reduce((s, e) => s + Math.abs(Number(e.valor)), 0),
    saldoAtual:       extratos.length > 0 && extratos[0].saldo != null ? Number(extratos[0].saldo) : null,
    totalMovimentos:  extratos.length,
    naoConcilidados:  extratos.filter(e => !e.conciliado).length,
  };

  /**
   * Check new rows against existing extratos for fuzzy duplicates.
   * Returns { clean, fuzzy, exact } where:
   *   clean  — no match, safe to import
   *   exact  — similarity >= 0.90 (same date+amount), auto-skip
   *   fuzzy  — similarity 0.60–0.89 (same date+amount), propose to user
   *            Each entry: { newRow, existingRow, similarity, index }
   */
  const checkFuzzyDups = useCallback(async (newRows, contaBancariaIdTarget) => {
    if (!db) return { clean: newRows, fuzzy: [], exact: [] };

    const all = await dbEntries(db);
    const existing = all
      .map(([, v]) => {
        if (!v.moduloDestino) {
           const isCred = (v.tipo === 'crédito' || Number(v.valor) >= 0);
           return { ...v, moduloDestino: isCred ? 'receitas' : 'despesas' };
        }
        return v;
      })
      .filter(v => v.contaBancariaId === contaBancariaIdTarget);

    // Index existing by "date|absValor" for fast candidate lookup
    const byDateVal = new Map();
    for (const mov of existing) {
      const key = `${(mov.data || '').trim()}|${String(Math.abs(Number(mov.valor)) || 0)}`;
      if (!byDateVal.has(key)) byDateVal.set(key, []);
      byDateVal.get(key).push(mov);
    }

    const clean = [], fuzzy = [], exact = [];

    newRows.forEach((row, index) => {
      const key = `${(row.data || '').trim()}|${String(Math.abs(Number(row.valor)) || 0)}`;
      const candidates = byDateVal.get(key) || [];

      if (candidates.length === 0) {
        clean.push({ row, index });
        return;
      }

      // Find the best similarity among candidates with same date+amount
      let bestSim = 0, bestExisting = null;
      for (const cand of candidates) {
        const sim = strSimilarity(row.descricao, cand.descricao);
        if (sim > bestSim) { bestSim = sim; bestExisting = cand; }
      }

      if (bestSim >= SIMILARITY_EXACT) {
        exact.push({ row, index, existingRow: bestExisting, similarity: bestSim });
      } else if (bestSim >= SIMILARITY_FUZZY) {
        fuzzy.push({ row, index, existingRow: bestExisting, similarity: bestSim });
      } else {
        clean.push({ row, index });
      }
    });

    return { clean, fuzzy, exact };
  }, [db]);

  /**
   * Scan existing movements for internal fuzzy duplicates.
   * Finds pairs with same date + |valor| and description similarity 60–99%.
   * Returns an array of { movA, movB, similarity } pairs (no duplicates A-B/B-A).
   */
  const findInternalDups = useCallback(async (contaBancariaIdTarget) => {
    if (!db) return [];

    const all = await dbEntries(db);
    const movs = all
      .map(([, v]) => {
        if (!v.moduloDestino) {
           const isCred = (v.tipo === 'crédito' || Number(v.valor) >= 0);
           return { ...v, moduloDestino: isCred ? 'receitas' : 'despesas' };
        }
        return v;
      })
      .filter(v => !contaBancariaIdTarget || v.contaBancariaId === contaBancariaIdTarget);

    // Index by "date|absValor"
    const byDateVal = new Map();
    for (const mov of movs) {
      const key = `${(mov.data || '').trim()}|${String(Math.abs(Number(mov.valor)) || 0)}`;
      if (!byDateVal.has(key)) byDateVal.set(key, []);
      byDateVal.get(key).push(mov);
    }

    const pairs = [];
    const seen  = new Set();

    for (const candidates of byDateVal.values()) {
      if (candidates.length < 2) continue;
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const a = candidates[i], b = candidates[j];
          const pairKey = [a.id, b.id].sort().join('|');
          if (seen.has(pairKey)) continue;
          seen.add(pairKey);
          const sim = strSimilarity(a.descricao, b.descricao);
          if (sim >= SIMILARITY_FUZZY && sim < 1.0) {
            pairs.push({ movA: a, movB: b, similarity: sim });
          }
        }
      }
    }

    // Sort by similarity descending (most suspicious first)
    pairs.sort((a, b) => b.similarity - a.similarity);
    return pairs;
  }, [db]);

  return { extratos, loading, kpis, importExtratos, forceInsertExtratos, checkFuzzyDups, findInternalDups, addExtrato, updateExtrato, bulkUpdateExtratos, deleteExtrato, deleteLote, refresh };
}
