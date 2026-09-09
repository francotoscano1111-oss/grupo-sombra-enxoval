/**
 * useContasPagar.js — CRUD for Contas a Pagar per empresa
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbDel, dbEntries, DB_MODULES } from '../utils/db';

export function useContasPagar(empresaId) {
  const [contas,  setContas]  = useState([]);
  const [loading, setLoading] = useState(true);

  const db = empresaId ? getDB(empresaId, DB_MODULES.CONTAS_PAGAR) : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) =>
        (a.vencimento || '').localeCompare(b.vencimento || '')
      );
      setContas(list);
    } catch (err) {
      console.warn('[useContasPagar] refresh error:', err);
      setContas([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveConta = useCallback(async (data) => {
    if (!db) return null;
    const record = {
      id:               data.id             || uuidv4(),
      empresaId,
      empresaNome:      data.empresaNome     ?? '',
      previsao:         data.previsao        ?? '',
      cnpjFornecedor:   data.cnpjFornecedor  ?? '',
      fornecedor:       data.fornecedor      ?? '',
      tags:             data.tags            ?? '',
      emissao:          data.emissao         ?? '',
      vencimento:       data.vencimento      ?? '',
      registro:         data.registro        ?? '',
      categoria:        data.categoria       ?? '',
      contaCorrente:    data.contaCorrente   ?? '',
      notaFiscal:       data.notaFiscal      ?? '',
      parcela:          data.parcela         ?? '',
      documento:        data.documento       ?? '',
      numero:           data.numero          ?? '',
      pedidoVenda:      data.pedidoVenda     ?? '',
      vendedor:         data.vendedor        ?? '',
      projeto:          data.projeto         ?? '',
      origem:           data.origem          ?? '',
      valorConta:       Number(data.valorConta)   || 0,
      valorPIS:         Number(data.valorPIS)     || 0,
      valorCOFINS:      Number(data.valorCOFINS)  || 0,
      valorCSLL:        Number(data.valorCSLL)     || 0,
      valorIR:          Number(data.valorIR)       || 0,
      valorISS:         Number(data.valorISS)      || 0,
      valorINSS:        Number(data.valorINSS)     || 0,
      valorLiquido:     Number(data.valorLiquido)  || 0,
      valorPago:        Number(data.valorPago)     || 0,
      aPagar:           Number(data.aPagar)        || 0,
      lote:             data.lote           ?? null,
      criadoEm:         data.criadoEm       ?? new Date().toISOString(),
      atualizadoEm:     new Date().toISOString(),
    };
    await dbSet(db, record.id, record);
    setContas(prev => {
      const filtered = prev.filter(c => c.id !== record.id);
      return [...filtered, record].sort((a, b) =>
        (a.vencimento || '').localeCompare(b.vencimento || '')
      );
    });
    return record;
  }, [db, empresaId]);

  const deleteConta = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setContas(prev => prev.filter(c => c.id !== id));
  }, [db]);

  const importContas = useCallback(async (rows) => {
    if (!db) return 0;
    const lote = uuidv4();
    let count = 0;

    const newRecords = rows.map(row => ({
      id:               row.id             || uuidv4(),
      empresaId,
      empresaNome:      row.empresaNome     ?? '',
      previsao:         row.previsao        ?? '',
      cnpjFornecedor:   row.cnpjFornecedor  ?? '',
      fornecedor:       row.fornecedor      ?? '',
      tags:             row.tags            ?? '',
      emissao:          row.emissao         ?? '',
      vencimento:       row.vencimento      ?? '',
      registro:         row.registro        ?? '',
      categoria:        row.categoria       ?? '',
      contaCorrente:    row.contaCorrente   ?? '',
      notaFiscal:       row.notaFiscal      ?? '',
      parcela:          row.parcela         ?? '',
      documento:        row.documento       ?? '',
      numero:           row.numero          ?? '',
      pedidoVenda:      row.pedidoVenda     ?? '',
      vendedor:         row.vendedor        ?? '',
      projeto:          row.projeto         ?? '',
      origem:           row.origem          ?? '',
      valorConta:       Number(row.valorConta)   || 0,
      valorPIS:         Number(row.valorPIS)     || 0,
      valorCOFINS:      Number(row.valorCOFINS)  || 0,
      valorCSLL:        Number(row.valorCSLL)     || 0,
      valorIR:          Number(row.valorIR)       || 0,
      valorISS:         Number(row.valorISS)      || 0,
      valorINSS:        Number(row.valorINSS)     || 0,
      valorLiquido:     Number(row.valorLiquido)  || 0,
      valorPago:        Number(row.valorPago)     || 0,
      aPagar:           Number(row.aPagar)        || 0,
      lote:             lote                ?? null,
      criadoEm:         row.criadoEm        ?? new Date().toISOString(),
      atualizadoEm:     new Date().toISOString(),
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
        if (ext.cnpjFornecedor === row.cnpjFornecedor && ext.vencimento === row.vencimento && Number(ext.valorConta) === Number(row.valorConta)) {
           isDup = true; existingMatch = ext; break;
        }
      }
      if (isDup) duplicates.push({ row, index, existingRow: existingMatch });
      else clean.push({ row, index });
    });
    return { clean, duplicates };
  }, [db]);

  return { contas, loading, saveConta, deleteConta, importContas, checkDuplicates, refresh };
}
