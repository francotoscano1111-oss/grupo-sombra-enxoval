/**
 * useDocumentos.js — CRUD for document↔movement links per empresa
 *
 * A "documento" record represents:
 *   - A PDF linked to a bank movement (docStatus: 'Documentado')
 *   - A movement explicitly exempted from documentation (docStatus: 'Dispensado')
 *   - A movement flagged as pending (docStatus: 'Pendente')
 */
import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDB, dbSet, dbDel, dbEntries, DB_MODULES } from '../utils/db';

/** Generate a human-readable reference: DOC-2026-001 */
function generateReference(allDocs) {
  const year  = new Date().getFullYear();
  const count = allDocs.filter(d => (d.reference || '').includes(String(year))).length;
  return `DOC-${year}-${String(count + 1).padStart(3, '0')}`;
}

export function useDocumentos(empresaId) {
  const [documentos, setDocumentos] = useState([]);
  const [loading,    setLoading]    = useState(true);

  const db = empresaId ? getDB(empresaId, DB_MODULES.DOCUMENTOS) : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) =>
        (b.criadoEm || '').localeCompare(a.criadoEm || '')
      );
      setDocumentos(list);
    } catch (err) {
      console.warn('[useDocumentos] refresh error:', err);
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  /** Save (create or update) a document record */
  const saveDocumento = useCallback(async (data) => {
    if (!db) return null;
    const all  = documentos; // current snapshot for reference generation
    const isNew = !data.id;
    const record = {
      id:                    data.id              || uuidv4(),
      empresaId,
      reference:             data.reference       || generateReference(all),
      fileName:              data.fileName        || '',
      fileSize:              data.fileSize        || 0,
      // Do NOT store file blob here — too heavy for IndexedDB in this context
      // The blob is only used ephemerally for display/download via URL.createObjectURL
      movimentoId:           data.movimentoId     || null,
      movimentoData:         data.movimentoData   || '',
      movimentoValor:        Number(data.movimentoValor)  || 0,
      movimentoDescricao:    data.movimentoDescricao      || '',
      contaBancariaId:       data.contaBancariaId || '',
      contaBancariaNome:     data.contaBancariaNome       || '',
      tipo:                  data.tipo            || 'Outro',
      notas:                 data.notas           || '',
      docStatus:             data.docStatus       || 'Documentado',
      // Optional: store small blob for preview (only if user uploads directly)
      fileDataUrl:           data.fileDataUrl     || null,
      // Metadata from PDF/filename extraction — used by auto-reconciliation engine
      metadata:              data.metadata        || { amounts: [], dates: [], keywords: [], textPreview: '' },
      criadoEm:              data.criadoEm        || new Date().toISOString(),
      atualizadoEm:          new Date().toISOString(),
    };

    await dbSet(db, record.id, record);
    setDocumentos(prev => {
      const filtered = prev.filter(d => d.id !== record.id);
      return [record, ...filtered].sort((a, b) =>
        (b.criadoEm || '').localeCompare(a.criadoEm || '')
      );
    });
    return record;
  }, [db, empresaId, documentos]);

  /** Delete a document record */
  const deleteDocumento = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setDocumentos(prev => prev.filter(d => d.id !== id));
  }, [db]);

  /** Delete ALL document records for this empresa */
  const clearAllDocumentos = useCallback(async () => {
    if (!db) return;
    const ents = await dbEntries(db);
    await Promise.all(ents.map(([key]) => dbDel(db, key)));
    setDocumentos([]);
  }, [db]);

  /** Get the set of movimentoIds that already have a record (for Pendenti filter) */
  const linkedMovimentoIds = useCallback(() =>
    new Set(documentos.map(d => d.movimentoId).filter(Boolean)),
    [documentos]
  );

  return { documentos, loading, saveDocumento, deleteDocumento, clearAllDocumentos, linkedMovimentoIds, refresh };
}
