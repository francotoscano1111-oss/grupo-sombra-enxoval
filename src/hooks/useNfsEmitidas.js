/**
 * useNfsEmitidas.js — CRUD for Notas Fiscais de Serviço Emitidas per empresa
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbDel, dbEntries, DB_MODULES } from '../utils/db';

export function useNfsEmitidas(empresaId) {
  const [nfs,     setNfs]     = useState([]);
  const [loading, setLoading] = useState(true);

  const db = empresaId ? getDB(empresaId, DB_MODULES.NFS_EMITIDAS) : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) =>
        (b.dataEmissao || '').localeCompare(a.dataEmissao || '')
      );
      setNfs(list);
    } catch (err) {
      console.warn('[useNfsEmitidas] refresh error:', err);
      setNfs([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  /** Save a single NF (add or update). */
  const saveNf = useCallback(async (data) => {
    if (!db) return null;
    const record = {
      id:               data.id || uuidv4(),
      empresaId,
      numero:           data.numero           ?? '',
      dataEmissao:      data.dataEmissao       ?? '',
      competencia:      data.competencia       ?? '',
      codigoNfse:       data.codigoNfse        ?? '',
      situacaoNota:     data.situacaoNota      ?? 'Normal',
      situacaoPagamento:data.situacaoPagamento ?? 'Pendente',
      cnpjPrestador:    data.cnpjPrestador     ?? '',
      nomePrestador:    data.nomePrestador     ?? '',
      cnpjTomador:      data.cnpjTomador       ?? '',
      nomeTomador:      data.nomeTomador       ?? '',
      valorServico:     Number(data.valorServico)   || 0,
      deducoes:         Number(data.deducoes)        || 0,
      aliquota:         Number(data.aliquota)         || 0,
      retencao:         Number(data.retencao)         || 0,
      issqn:            Number(data.issqn)            || 0,
      tipoRetencao:     data.tipoRetencao      ?? '',
      descricao:        data.descricao         ?? '',
      localPrestacao:   data.localPrestacao    ?? '',
      localTomador:     data.localTomador      ?? '',
      lote:             data.lote              ?? null,
      criadoEm:         data.criadoEm          ?? new Date().toISOString(),
      atualizadoEm:     new Date().toISOString(),
    };
    await dbSet(db, record.id, record);
    setNfs(prev => {
      const filtered = prev.filter(n => n.id !== record.id);
      return [...filtered, record].sort((a, b) =>
        (b.dataEmissao || '').localeCompare(a.dataEmissao || '')
      );
    });
    return record;
  }, [db, empresaId]);

  /** Delete a single NF by id. */
  const deleteNf = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setNfs(prev => prev.filter(n => n.id !== id));
  }, [db]);

  /** Delete multiple NFs by an array of IDs. */
  const deleteMultipleNfs = useCallback(async (idsArray) => {
    if (!db || !idsArray || idsArray.length === 0) return;
    await Promise.all(idsArray.map(id => dbDel(db, id)));
    setNfs(prev => prev.filter(n => !idsArray.includes(n.id)));
  }, [db]);

  /** Batch import an array of raw NF objects (from Excel parser). */
  const importNfs = useCallback(async (rows) => {
    if (!db) return 0;

    const lote = uuidv4();
    const now  = new Date().toISOString();

    // Build all records in memory
    const records = [];
    for (const row of rows) {
      const numStr = String(row.numero || '').trim();
      records.push({
        id:                uuidv4(),
        empresaId,
        numero:            numStr,
        dataEmissao:       row.dataEmissao       ?? '',
        competencia:       row.competencia       ?? '',
        codigoNfse:        row.codigoNfse        ?? '',
        situacaoNota:      row.situacaoNota      ?? 'Normal',
        situacaoPagamento: row.situacaoPagamento ?? 'Pendente',
        cnpjPrestador:     row.cnpjPrestador     ?? '',
        nomePrestador:     row.nomePrestador     ?? '',
        cnpjTomador:       row.cnpjTomador       ?? '',
        nomeTomador:       row.nomeTomador       ?? '',
        valorServico:      Number(row.valorServico) || 0,
        deducoes:          Number(row.deducoes)     || 0,
        aliquota:          Number(row.aliquota)      || 0,
        retencao:          Number(row.retencao)      || 0,
        issqn:             Number(row.issqn)         || 0,
        tipoRetencao:      row.tipoRetencao     ?? '',
        descricao:         row.descricao        ?? '',
        localPrestacao:    row.localPrestacao   ?? '',
        localTomador:      row.localTomador     ?? '',
        lote,
        criadoEm:          now,
        atualizadoEm:      now,
      });
    }

    if (records.length === 0) return 0;

    // Write all in parallel (much faster than sequential)
    await Promise.all(records.map(r => dbSet(db, r.id, r)));

    // Update React state in one shot
    setNfs(prev => [...prev, ...records].sort((a, b) =>
      (b.dataEmissao || '').localeCompare(a.dataEmissao || '')
    ));

    return records.length;
  }, [db, empresaId]);

  const checkDuplicates = useCallback(async (newRows) => {
    if (!db) return { clean: [], duplicates: [] };
    const all = await dbEntries(db);
    const existing = all.map(([, v]) => v);

    const clean = [];
    const duplicates = [];

    newRows.forEach((row, index) => {
      let isDup = false;
      let existingMatch = null;
      const numStr = String(row.numero || '').trim();

      if (numStr) {
        for (const ext of existing) {
          if (String(ext.numero || '').trim() === numStr && ext.dataEmissao === row.dataEmissao) {
             isDup = true; existingMatch = ext; break;
          }
        }
      }

      if (isDup) duplicates.push({ row, index, existingRow: existingMatch });
      else clean.push({ row, index });
    });
    return { clean, duplicates };
  }, [db]);

  return { nfs, loading, saveNf, deleteNf, deleteMultipleNfs, importNfs, checkDuplicates, refresh };
}
