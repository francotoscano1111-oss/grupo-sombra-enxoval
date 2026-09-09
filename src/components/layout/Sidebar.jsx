/**
 * Sidebar.jsx — Main sidebar navigation with grouped macro sections
 */
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEmpresa } from '../../context/EmpresaContext';
import { DESPESAS_MODULOS, getDynamicReceitasModulos } from '../../config/modulosConfig';
import { useAdquirentes } from '../../hooks/useAdquirentes';
import './Sidebar.css';

export default function Sidebar({ collapsed }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { empresas, activeEmpresa, selectEmpresa } = useEmpresa();
  const { adquirentes } = useAdquirentes(activeEmpresa?.id);

  const isActive = (path) => location.pathname === path;


  const handleSelectEmpresa = (emp) => {
    selectEmpresa(emp);
    navigate(`/empresa/${emp.id}`);
  };

  const [openReceitas, setOpenReceitas] = useState(false);
  const [openDespesas, setOpenDespesas] = useState(false);
  const [openHub, setOpenHub] = useState(false);

  const id = activeEmpresa?.id;

  // ── Group definitions ─────────────────────────────────────────────────────
  const grupos = id ? [
    {
      key:    'receitas',
      label:  'RECEITAS',
      icon:   '📈',
      color:  'var(--color-green)',
      path:   `/empresa/${id}/receitas`,
      open:   openReceitas,
      toggle: () => setOpenReceitas(f => !f),
      links:  getDynamicReceitasModulos(activeEmpresa, adquirentes).map(m => ({
        path: `/empresa/${id}/${m.key}`,
        label: m.label,
        icon:  m.icon,
        id:    `nav-${m.key}`,
      })),
    },
    {
      key:    'despesas',
      label:  'DESPESAS',
      icon:   '📉',
      color:  'var(--color-red)',
      path:   `/empresa/${id}/despesas`,
      open:   openDespesas,
      toggle: () => setOpenDespesas(f => !f),
      links:  DESPESAS_MODULOS.map(m => ({
        path: `/empresa/${id}/${m.key}`,
        label: m.label,
        icon:  m.icon,
        id:    `nav-${m.key}`,
      })),
    },
  ] : [];

  // ── Standalone links (bottom of company nav) ───────────────────────────────
  const standalone = id ? [
    { path: `/empresa/${id}/estratti`, label: 'Extratos Bancários', icon: '🏦', id: 'nav-estratti' },
    { path: `/empresa/${id}/fechamento`, label: 'Fechamento Contábil', icon: '🔒', id: 'nav-fechamento' },
  ] : [];

  // ── Early return if collapsed ──
  if (collapsed) return null;

  return (
    <aside className="sidebar">
      {/* logo... */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">GS</div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">GRUPO SOMBRA</span>
          <span className="sidebar-logo-sub">Finance Hub</span>
        </div>
      </div>

      {/* ── Global Hub ── */}
      <div className="sidebar-nav" style={{ paddingBottom: 0 }}>
        <div className="sidebar-section-label">IMPORT HUB</div>
        <div className="sidebar-group">
          <div className="sidebar-group-header" style={{ '--group-color': '#f472b6' }}>
            <button 
              className="sidebar-group-header-label" 
              onClick={() => {
                navigate('/');
                selectEmpresa(null);
                setOpenReceitas(false);
                setOpenDespesas(false);
                setOpenHub(f => !f);
              }} 
              style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
            >
              <span className="sidebar-group-icon">📥</span>
              <span className="sidebar-group-label" style={{ fontSize: 13 }}>Geral Hub</span>
            </button>
            <button 
              className="sidebar-group-chevron-btn" 
              onClick={() => setOpenHub(f => !f)} 
              style={{ color: 'inherit', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
            >
              <span className={`sidebar-group-chevron ${openHub ? 'open' : ''}`}>›</span>
            </button>
          </div>
          <div className={`sidebar-group-content ${openHub ? 'open' : ''}`}>
            <div className="sidebar-group-inner">
              <button 
                className={`sidebar-group-link ${isActive('/import-hub/cc-stone') ? 'active' : ''}`} 
                onClick={() => navigate('/import-hub/cc-stone')}
              >
                <span className="nav-icon">💳</span>
                CC STONE
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* ── Empresas ── */}
      <div className="sidebar-empresa-section" style={{ marginTop: 'var(--space-4)' }}>
        <div className="sidebar-section-label">Empresas</div>
        {empresas.map(emp => (
          <button
            key={emp.id}
            className={`sidebar-empresa-btn ${activeEmpresa?.id === emp.id ? 'active' : ''}`}
            onClick={() => handleSelectEmpresa(emp)}
            title={emp.name}
          >
            <span className="empresa-dot" style={{ backgroundColor: emp.color }} />
            <span className="empresa-name">{emp.name}</span>
          </button>
        ))}
      </div>

      {/* ── Navigation ── */}
      {activeEmpresa && (
        <nav className="sidebar-nav">
          <div className="sidebar-section-label" style={{ marginTop: 'var(--space-4)' }}>
            {activeEmpresa.name}
          </div>

          {/* Grouped macro sections */}
          {grupos.map(grupo => (
            <div key={grupo.key} className="sidebar-group">

              {/* Group header: label navigates, chevron toggles */}
              <div className="sidebar-group-header" style={{ '--group-color': grupo.color }}>
                <button
                  className="sidebar-group-header-label"
                  onClick={() => navigate(grupo.path)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
                >
                  <span className="sidebar-group-icon">{grupo.icon}</span>
                  <span className="sidebar-group-label">{grupo.label}</span>
                </button>
                <button
                  className="sidebar-group-chevron-btn"
                  onClick={grupo.toggle}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: 'inherit' }}
                >
                  <span className={`sidebar-group-chevron ${grupo.open ? 'open' : ''}`}>›</span>
                </button>
              </div>

              {/* Group links (animated) */}
              <div className={`sidebar-group-content ${grupo.open ? 'open' : ''}`}>
                <div className="sidebar-group-inner">
                  {grupo.links.map(link => (
                    <button
                      key={link.path}
                      id={link.id}
                      className={`sidebar-group-link ${isActive(link.path) ? 'active' : ''}`}
                      style={isActive(link.path) ? { '--link-color': grupo.color } : {}}
                      onClick={() => navigate(link.path)}
                    >
                      <span className="nav-icon">{link.icon}</span>
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Standalone divider + links */}
          {standalone.length > 0 && (
            <>
              <div className="sidebar-standalone-divider" />
              {standalone.map(link => (
                <button
                  key={link.path}
                  id={link.id}
                  className={`sidebar-nav-link ${isActive(link.path) ? 'active' : ''}`}
                  onClick={() => navigate(link.path)}
                >
                  <span className="nav-icon">{link.icon}</span>
                  {link.label}
                </button>
              ))}
            </>
          )}
        </nav>
      )}

      {/* ── Bottom ── */}
      <div className="sidebar-bottom">
        <button className="sidebar-hub-btn" onClick={() => navigate('/configuracoes')} id="nav-configuracoes">
          ⚙️ Configurações
        </button>
        <button className="sidebar-hub-btn" onClick={() => {
          navigate('/');
          selectEmpresa(null);
          setOpenReceitas(false);
          setOpenDespesas(false);
        }} id="nav-hub">
          🏠 Hub
        </button>
      </div>

    </aside>
  );
}
