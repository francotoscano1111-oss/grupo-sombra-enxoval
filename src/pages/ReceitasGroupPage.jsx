/**
 * ReceitasGroupPage.jsx — Overview page for RECEITAS group
 * Cards derived from central modulosConfig.js — auto-updates when new modules are added.
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDynamicReceitasModulos } from '../config/modulosConfig';
import { useEmpresa } from '../context/EmpresaContext';
import { useAdquirentes } from '../hooks/useAdquirentes';
import './EmpresaOverviewPage.css';

export default function ReceitasGroupPage() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const { empresas, activeEmpresa } = useEmpresa();
  const { adquirentes }   = useAdquirentes(empresaId);
  const empresaContext = empresas.find(e => e.id === empresaId) || activeEmpresa;

  return (
    <div className="overview-page">
      <div className="overview-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button 
          onClick={() => navigate(`/empresa/${empresaId}`)}
          className="btn btn-secondary"
          style={{ padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-start', marginTop: 4 }}
        >
          ← Voltar
        </button>
        <span style={{ fontSize: 28 }}>📈</span>
        <div style={{ flex: 1 }}>
          <h1 className="overview-title">RECEITAS</h1>
          <p className="overview-subtitle">Selecione um módulo de entradas</p>
        </div>
        
        <button 
          className="btn"
          onClick={() => navigate(`/empresa/${empresaId}/receitas-auditoria`)}
          style={{ 
            padding: '12px 24px', 
            fontSize: 16, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            background: 'var(--color-green, #22c55e)',
            color: '#fff',
            border: 'none',
            boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
            borderRadius: 12
          }}
        >
          <span style={{ fontSize: 22 }}>📋</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.2 }}>
            <strong style={{ fontWeight: 700, letterSpacing: '0.3px' }}>Auditoria do Extrato</strong>
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Painel Operacional</span>
          </div>
        </button>
      </div>

      <div className="overview-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {getDynamicReceitasModulos(empresaContext, adquirentes).map(mod => (
          <button
            key={mod.key}
            className="overview-card"
            style={{ '--card-color': mod.color, '--card-dim': mod.dimColor }}
            onClick={() => navigate(`/empresa/${empresaId}/${mod.key}`)}
          >
            <div className="overview-card-bar" />
            <div className="overview-card-top">
              <span className="overview-card-icon">{mod.icon}</span>
              <div>
                <div className="overview-card-label">{mod.label}</div>
                <div className="overview-card-sub">{mod.sub}</div>
              </div>
              <span className="overview-card-arrow">→</span>
            </div>
            <ul className="overview-card-items">
              {mod.items.map(item => <li key={item}>{item}</li>)}
            </ul>
          </button>
        ))}
      </div>
    </div>
  );
}
