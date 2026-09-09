/**
 * useHitsResumo.js — CRUD for HITS "Resumo de Conta Fechada" (File 1)
 * ArcoIris only — chave única: campo "Global"
 */
import { useState, useEffect, useCallback } from 'react';
import { getDB, dbSet, dbDel, dbEntries, dbClear, DB_MODULES } from '../utils/db';

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

export function useHitsResumo(empresaId) {
  const [resumos, setResumos]   = useState([]);
  const [loading, setLoading]   = useState(true);

  const db = empresaId ? getDB(empresaId, DB_MODULES.HITS_RESUMO) : null;

  const refresh = useCallback(async () => {
    if (!db) { setLoading(false); return; }
    setLoading(true);
    try {
      const ents = await dbEntries(db);
      const list = ents.map(([, v]) => v).sort((a, b) =>
        (b.checkout || '').localeCompare(a.checkout || '')
      );
      setResumos(list);
    } catch (err) {
      console.warn('[useHitsResumo] refresh error:', err);
      setResumos([]);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Import bulk rows from Excel File 1.
   * Dedup key: campo "Global" (ex: "9871-19683")
   * Returns { imported, skipped }
   */
  const importResumos = useCallback(async (rows, issRate = 10) => {
    if (!db) return { imported: 0, skipped: 0, skippedRows: [] };

    // Load existing keys
    const existing = await dbEntries(db);
    const existingKeys = new Set(existing.map(([k]) => k));

    let imported  = 0;
    let skipped   = 0;
    const skippedRows = [];

    for (const row of rows) {
      const globalKey = String(row['Global'] ?? '').trim();
      if (!globalKey) {
        skipped++;
        skippedRows.push({ motivo: 'Campo Global vazio', global: '', nomeHospede: row['Nome do Hóspede/Empresa'] ?? '', checkout: row['Check-out'] ?? '', voucher: row['Voucher'] ?? '' });
        continue;
      }

      if (existingKeys.has(globalKey)) {
        skipped++;
        skippedRows.push({ motivo: 'Global já existente na base', global: globalKey, nomeHospede: row['Nome do Hóspede/Empresa'] ?? '', checkout: row['Check-out'] ?? '', voucher: row['Voucher'] ?? '' });
        continue;
      }

      const record = {
        id:                  globalKey,
        global:              globalKey,
        nomeHotel:           row['Nome do hotel']                       ?? '',
        apartamento:         row['Apartamento']                         ?? '',
        categoriaApto:       row['Categoria de Apartamento']            ?? '',
        tarifario:           row['Tarifário']                           ?? '',
        checkin:             row['Check-in']                            ?? '',
        horaCheckin:         row['Hora do Check-in']                    ?? '',
        primeiroCheckout:    row['Primeiro Check-out']                  ?? '',
        checkout:            row['Check-out']                           ?? '',
        horaCheckout:        row['Hora do Check-out']                   ?? '',
        adt:                 Number(row['Adt'])                        || 0,
        crianca:             Number(row['Criança'])                     || 0,
        cpfCnpjPassaporte:   String(row['CPF/CNPJ/PASSPORT'] ?? ''),
        im:                  row['IM']                                   ?? '',
        rgInscricao:         row['RG/Incrição Estadual']                ?? '',
        nomeHospede:         row['Nome do Hóspede/Empresa']             ?? '',
        categoriaHospede:    row['Categoria do hóspede']                ?? '',
        nacionalidade:       row['Nacionalidade']                       ?? '',
        celular:             String(row['Celular'] ?? ''),
        email:               row['E-mail']                              ?? '',
        endereco:            row['Endereço']                            ?? '',
        numero:              String(row['Número'] ?? ''),
        complemento:         row['Complemento']                         ?? '',
        bairro:              row['Bairro']                              ?? '',
        cep:                 String(row['CEP'] ?? ''),
        cidade:              row['Cidade']                              ?? '',
        uf:                  row['UF']                                  ?? '',
        pais:                row['País']                                ?? '',
        totalDiarias:        Number(row['Total de Diárias'] || row['Total Diárias'] || 0),
        vlDiarias:           parseBR(row['Diárias'] || row['Vlr. Diárias']),
        vlEventos:           parseBR(row['Eventos'] || row['Eventi']),
        vlConsumos:          parseBR(row['Consumos'] || row['Consumi']),
        vlTaxas:             parseBR(row['Taxas'] || row['Tasse']),
        // Rule 1: Calculate Net A&B Consumption from Taxa (ISS)
        vlConsumoCALC_AB:    parseBR(row['Taxas'] || row['Tasse']) / ((Number(issRate) || 10) / 100),
        vlTotal:             parseBR(row['Total']),
        credito:             parseBR(row['Crédito'] || row['Credito']),
        diariasMedia:        parseBR(row['Diária Média']),
        totalProdutos:       parseBR(row['Total produtos'] || row['Total Produtos']),
        totalServicos:       parseBR(row['Total serviços'] || row['Total Serviços']),
        abertoPor:           row['Aberto por']                         ?? '',
        fechadoPor:          row['Fechado por']                        ?? '',
        empresaAgencia:      row['Empresa / agência de viagem / tmc / ota'] ?? '',
        reservaInseridaPor:  row['Reserva inserida por']               ?? '',
        voucher:             String(row['Voucher'] ?? ''),
        dataInclusaoReserva: row['Data de inclusão da reserva']        ?? '',
        canalOrigem:         row['Canal de origem (RM)']               ?? '',
        rps:                 String(row['RPS'] ?? ''),
        importadoEm:         new Date().toISOString(),
        empresaId,
      };

      await dbSet(db, globalKey, record);
      existingKeys.add(globalKey);
      imported++;
    }

    await refresh();
    return { imported, skipped, skippedRows };
  }, [db, empresaId, refresh]);

  const clearResumos = useCallback(async () => {
    if (!db) return;
    await dbClear(db);
    setResumos([]);
  }, [db]);

  const deleteResumo = useCallback(async (id) => {
    if (!db) return;
    await dbDel(db, id);
    setResumos(prev => prev.filter(r => r.id !== id));
  }, [db]);

  const deleteMultipleResumos = useCallback(async (ids) => {
    if (!db) return;
    const idSet = new Set(ids);
    for (const id of ids) {
      await dbDel(db, id);
    }
    setResumos(prev => prev.filter(r => !idSet.has(r.id)));
  }, [db]);

  return { resumos, loading, importResumos, clearResumos, deleteResumo, deleteMultipleResumos, refresh };
}
