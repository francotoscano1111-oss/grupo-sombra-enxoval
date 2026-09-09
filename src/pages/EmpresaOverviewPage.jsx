/**
 * EmpresaOverviewPage.jsx — Landing page for a selected empresa
 * Shows 4 large module cards: RECEITAS, DESPESAS, Estratti Conto, Documentos
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmpresa } from '../context/EmpresaContext';
import './EmpresaOverviewPage.css';

import { DESPESAS_MODULOS, getDynamicReceitasModulos } from '../config/modulosConfig';
import { useAdquirentes } from '../hooks/useAdquirentes';

export default function EmpresaOverviewPage() {
  const { empresaId } = useParams();
  const navigate      = useNavigate();
  const { activeEmpresa } = useEmpresa();
  const { adquirentes }   = useAdquirentes(empresaId);

  const dynamicReceitas = getDynamicReceitasModulos(activeEmpresa, adquirentes);

  const MODULES = [
    {
      key:     'estratti',
      path:    'estratti',
      icon:    '🏦',
      label:   'EXTRATOS BANCÁRIOS',
      sub:     'Movimentos bancários · Import OFX/Excel',
      color:   'var(--color-accent)',
      dimColor:'var(--color-accent-dim)',
      items:   ['📥 Import OFX / Excel', '🔍 Filtros avançados', '📊 Export'],
    },
    {
      key:     'despesas',
      path:    'despesas',
      icon:    '📉',
      label:   'DESPESAS',
      sub:     DESPESAS_MODULOS.map(m => m.label).join(' · '),
      color:   'var(--color-red)',
      dimColor:'var(--color-red-dim)',
      items:   DESPESAS_MODULOS.map(m => `${m.icon} ${m.label}`),
    },
    {
      key:     'receitas',
      path:    'receitas',
      icon:    '📈',
      label:   'RECEITAS',
      sub:     dynamicReceitas.map(m => m.label).join(' · '),
      color:   'var(--color-green)',
      dimColor:'var(--color-green-dim)',
      items:   dynamicReceitas.map(m => `${m.icon} ${m.label}`),
    },
  ];

  return (
    <div className="overview-page">

      {/* Header */}
      <div className="overview-header">
        <div className="overview-empresa-dot"
          style={{ background: activeEmpresa?.color ?? 'var(--color-accent)' }} />
        <div>
          <h1 className="overview-title">{activeEmpresa?.nome ?? activeEmpresa?.name ?? '—'}</h1>
          <p className="overview-subtitle">Selecione um módulo para começar</p>
        </div>
      </div>

      {/* 2×2 module grid */}
      <div className="overview-grid">
        {MODULES.map(mod => (
          <button
            key={mod.key}
            className="overview-card"
            style={{ '--card-color': mod.color, '--card-dim': mod.dimColor }}
            onClick={() => navigate(`/empresa/${empresaId}/${mod.path}`)}
          >
            {/* Top accent bar */}
            <div className="overview-card-bar" />

            {/* Icon + label */}
            <div className="overview-card-top">
              <span className="overview-card-icon">{mod.icon}</span>
              <div>
                <div className="overview-card-label">{mod.label}</div>
                <div className="overview-card-sub">{mod.sub}</div>
              </div>
              <span className="overview-card-arrow">→</span>
            </div>

            {/* Sub-items list */}
            <ul className="overview-card-items">
              {mod.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
    </div>
  );
}
