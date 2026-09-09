/**
 * ConciliacaoReceitas.jsx — Reconciliation page for RECEITAS group
 * Loads data from all Receitas modules and dynamic credit cards, and passes it to ConciliacaoPage.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ConciliacaoPage from './ConciliacaoPage';
import { useContas }          from '../hooks/useContas';
import { useNfsEmitidas }     from '../hooks/useNfsEmitidas';
import { useRegistroReservas } from '../hooks/useRegistroReservas';
import { useBookings }        from '../hooks/useBookings';
import { dbEntries }          from '../utils/db';
import { useAdquirentes }     from '../hooks/useAdquirentes';
import { getAdquirenteDbName }from '../hooks/useCartoesCredito';
import { useExtratos }        from '../hooks/useExtratos';
import { useContasBancarias } from '../hooks/useContasBancarias';

export default function ConciliacaoReceitas() {
  const { empresaId } = useParams();

  const { contas: entradas }          = useContas(empresaId, 'receitas');
  const { nfs }                       = useNfsEmitidas(empresaId);
  const { reservas }                  = useRegistroReservas(empresaId);
  const { bookings }                  = useBookings(empresaId);
  const { extratos }                  = useExtratos(empresaId);
  const { contas: bankAccounts }      = useContasBancarias(empresaId);
  
  const extratosReceitas = (extratos || []).filter(e => e.moduloDestino === 'receitas');
  
  const { adquirentes } = useAdquirentes(empresaId);
  const [cartoesData, setCartoesData] = useState({});

  useEffect(() => {
    async function loadCartoes() {
      if (!empresaId || !adquirentes || adquirentes.length === 0) return;
      const loaded = {};
      for (const adq of adquirentes) {
        try {
          const dbName = getAdquirenteDbName(empresaId, adq.id);
          const entries = await dbEntries(dbName);
          loaded[adq.id] = entries.map(([, v]) => v);
        } catch (e) {
             console.warn('Erro load cartoes', e);
        }
      }
      setCartoesData(loaded);
    }
    loadCartoes();
  }, [empresaId, adquirentes]);

  const cartoesModulos = adquirentes.map((adq) => ({
    key: `cartao_${adq.id}`,
    label: `💳 ${adq.nome}`,
    dbKey: adq.id === 'stone' ? 'entradas_consolidado' : `cartoes_${adq.id}`,
    data: cartoesData[adq.id] || []
  }));

  const extratosModulos = bankAccounts.map(banco => ({
    key: `extrato_${banco.id}`,
    label: `🏦 ${banco.nome} (Entradas)`,
    dbKey: 'extratos',
    data: extratosReceitas.filter(e => e.contaBancariaId === banco.id)
  }));

  const baseModulos = [
    { key: 'estratos_todos',   label: '🏦 Estratos Bancários (Todos)', dbKey: 'extratos', data: extratosReceitas },
    ...extratosModulos,
    { key: 'entradas',         label: 'A Receber',       dbKey: 'receitas',            data: entradas  ?? [] },
    { key: 'nfs_emitidas',     label: 'NFs Emitidas',        dbKey: 'nfs_emitidas',   data: nfs       ?? [] },
    { key: 'registro_reservas',label: 'Reservas (HITs)', dbKey: 'registro_reservas',   data: reservas  ?? [] },
    { key: 'bookings',         label: 'Bookings',        dbKey: 'bookings',            data: bookings  ?? [] },
  ];

  const modulos = [...cartoesModulos, ...baseModulos];

  return (
    <ConciliacaoPage
      titulo="Reconciliação RECEITAS"
      grupo="receitas"
      empresaId={empresaId}
      modulos={modulos}
    />
  );
}
