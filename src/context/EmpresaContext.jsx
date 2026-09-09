/**
 * EmpresaContext.jsx — Global context for empresa selection and management.
 * Handles: list of empresas, active empresa, CRUD operations.
 */
import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { GlobalDB } from '../utils/db';
import { todayISO } from '../utils/dateUtils';

const DEFAULT_EMPRESAS = [
  { id: 'empresa_001', name: 'Empresa Alpha',  color: '#5d7cf2', logo: null, active: true },
  { id: 'empresa_002', name: 'Empresa Beta',   color: '#34d399', logo: null, active: true },
  { id: 'empresa_003', name: 'Empresa Gamma',  color: '#f59e0b', logo: null, active: true },
];

const EmpresaContext = createContext(null);

// --- Reducer ---
function reducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return { ...state, empresas: action.payload, loading: false };
    case 'SELECT':
      return { ...state, activeEmpresa: action.payload };
    case 'ADD':
      return { ...state, empresas: [...state.empresas, action.payload] };
    case 'UPDATE':
      return {
        ...state,
        empresas: state.empresas.map(e => e.id === action.payload.id ? action.payload : e),
        activeEmpresa: state.activeEmpresa?.id === action.payload.id ? action.payload : state.activeEmpresa,
      };
    case 'DELETE':
      return {
        ...state,
        empresas: state.empresas.filter(e => e.id !== action.payload),
        activeEmpresa: state.activeEmpresa?.id === action.payload ? null : state.activeEmpresa,
      };
    default:
      return state;
  }
}

// --- Provider ---
export function EmpresaProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    empresas: [],
    activeEmpresa: null,
    loading: true,
  });

  // Load empresas from IndexedDB on mount
  useEffect(() => {
    (async () => {
      let saved = await GlobalDB.get('empresas');
      if (!saved || saved.length === 0) {
        saved = DEFAULT_EMPRESAS;
        await GlobalDB.set('empresas', saved);
      }
      dispatch({ type: 'INIT', payload: saved });
    })();
  }, []);

  // Persist whenever empresas change
  useEffect(() => {
    if (!state.loading) {
      GlobalDB.set('empresas', state.empresas);
    }
  }, [state.empresas, state.loading]);

  const selectEmpresa = useCallback((empresa) => {
    dispatch({ type: 'SELECT', payload: empresa });
  }, []);

  const addEmpresa = useCallback(async (data) => {
    const nova = {
      id: uuidv4(),
      name: data.name.trim(),
      cnpj: data.cnpj || '',
      color: data.color || '#5d7cf2',
      logo: data.logo || null,
      active: true,
      createdAt: todayISO(),
    };
    dispatch({ type: 'ADD', payload: nova });
    return nova;
  }, []);

  const updateEmpresa = useCallback((updated) => {
    dispatch({ type: 'UPDATE', payload: updated });
  }, []);

  const deleteEmpresa = useCallback((id) => {
    dispatch({ type: 'DELETE', payload: id });
  }, []);

  return (
    <EmpresaContext.Provider value={{
      empresas: state.empresas,
      activeEmpresa: state.activeEmpresa,
      loading: state.loading,
      selectEmpresa,
      addEmpresa,
      updateEmpresa,
      deleteEmpresa,
    }}>
      {children}
    </EmpresaContext.Provider>
  );
}

// --- Hook ---
export function useEmpresa() {
  const ctx = useContext(EmpresaContext);
  if (!ctx) throw new Error('useEmpresa must be used inside <EmpresaProvider>');
  return ctx;
}
