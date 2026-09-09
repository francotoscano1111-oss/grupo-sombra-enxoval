import { useState, useEffect, useCallback } from 'react';
import { GlobalDB } from '../utils/db';

const DEFAULT_ADQUIRENTES = [
  { id: 'stone', nome: 'STONE' },
  { id: 'sicoob', nome: 'SICOOB' },
  { id: 'bee2pay', nome: 'BEE2PAY' }
];

export function useAdquirentes(empresaId) {
  const [adquirentes, setAdquirentes] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const key = empresaId ? `adquirentes_config_${empresaId}` : 'adquirentes_config';
    setLoading(true);
    try {
      let saved = await GlobalDB.get(key);
      if (!saved || saved.length === 0) {
        await GlobalDB.set(key, DEFAULT_ADQUIRENTES);
        saved = DEFAULT_ADQUIRENTES;
      }
      setAdquirentes(saved);
    } catch (err) {
      console.warn('Erro ao carregar adquirentes', err);
      setAdquirentes(DEFAULT_ADQUIRENTES);
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveAdquirentes = async (newList) => {
    const key = empresaId ? `adquirentes_config_${empresaId}` : 'adquirentes_config';
    await GlobalDB.set(key, newList);
    setAdquirentes(newList);
  };

  return { adquirentes, loading, saveAdquirentes, refresh };
}
