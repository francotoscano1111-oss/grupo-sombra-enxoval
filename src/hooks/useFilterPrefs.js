/**
 * useFilterPrefs.js — Persiste le preferenze dei filtri per pagina in localStorage
 * Chiave: sombra_filtros_{empresaId}_{module}
 */
import { useState, useEffect } from 'react';

function getKey(empresaId, module) {
  return `sombra_filtros_${empresaId}_${module}`;
}

/**
 * @param {string} empresaId
 * @param {string} module — 'receitas' | 'despesas'
 * @param {object} defaults — valores padrão dos filtros
 */
export function useFilterPrefs(empresaId, module, defaults) {
  const key = empresaId && module ? getKey(empresaId, module) : null;

  const [prefs, setPrefs] = useState(() => {
    if (!key) return defaults;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        // dataInicio and dataFim are session-only — always reset to defaults.
        // Everything else (showExtrato, contaBancariaId, tipoExtrato, status, search) persists.
        return {
          ...defaults,
          ...parsed,
          dataInicio: defaults.dataInicio,
          dataFim:    defaults.dataFim,
        };
      }
    } catch {}
    return defaults;
  });

  // Persist whenever prefs change
  useEffect(() => {
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(prefs)); } catch {}
  }, [prefs, key]);

  const setFilter = (field, value) =>
    setPrefs(prev => ({ ...prev, [field]: value }));

  const resetFilters = () => setPrefs(defaults);

  return { prefs, setFilter, resetFilters };
}
