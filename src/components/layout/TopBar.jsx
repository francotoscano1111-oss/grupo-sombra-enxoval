/**
 * TopBar.jsx — Top bar with breadcrumb, empresa chip, and actions
 */
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEmpresa } from '../../context/EmpresaContext';
import { exportFullBackup } from '../../utils/db';
import SpotlightSearch from './SpotlightSearch';
import './TopBar.css';

const ROUTE_LABELS = {
  // Macros
  receitas:             { label: 'Visão Geral Receitas',  icon: '📈', section: 'Financeiro' },
  despesas:             { label: 'Visão Geral Despesas',  icon: '📉', section: 'Financeiro' },
  
  // Receitas
  entradas:             { label: 'Contas a Receber',      icon: '💰', section: 'Financeiro' },
  'nfs-emitidas':       { label: 'Notas Fiscais Emitidas',icon: '🧾', section: 'Financeiro' },
  'cartoes-credito':    { label: 'Recebimentos Cartão',   icon: '💳', section: 'Financeiro' },
  'registro-reservas':  { label: 'Registro de Reservas',  icon: '📅', section: 'Operacional' },
  bookings:             { label: 'Bookings',              icon: '🔍', section: 'Operacional' },
  'conciliacao-receitas':{label: 'Conciliação Receitas',  icon: '🔗', section: 'Reconciliação' },
  'receitas-auditoria': { label: 'Auditoria do Extrato',  icon: '📋', section: 'Financeiro' },
  
  // Despesas
  saidas:               { label: 'Contas a Pagar',        icon: '💸', section: 'Financeiro' },
  'contas-pagar':       { label: 'Auditoria de Pagamentos',icon: '📋',section: 'Financeiro' },
  'conciliacao-despesas':{label: 'Conciliação Despesas',  icon: '🔗', section: 'Reconciliação' },
  'despesas-auditoria': { label: 'Auditoria do Extrato',  icon: '📋', section: 'Financeiro' },
  
  // Geral
  estratti:             { label: 'Extratos Bancários',    icon: '🏦', section: 'Geral' },
  documentos:           { label: 'Documentos',            icon: '📁', section: 'Geral' },
  fechamento:           { label: 'Fechamento Contábil',   icon: '🔒', section: 'Geral' },
  configuracoes:        { label: 'Configurações',         icon: '⚙️', section: 'Sistema' },
};

export default function TopBar({ onToggleSidebar }) {
  const { activeEmpresa } = useEmpresa();
  const location = useLocation();
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const segment = pathSegments[pathSegments.length - 1];
  const routeInfo = ROUTE_LABELS[segment] || { label: segment === activeEmpresa?.id ? 'Visão Geral' : 'Hub', icon: '🏠', section: '' };

  const handleExit = async () => {
    if (exiting) return;
    setExiting(true);
    try {
      // 1. Generate full backup
      const backup = await exportFullBackup();
      const json   = JSON.stringify(backup, null, 2);
      const blob   = new Blob([json], { type: 'application/json' });
      const url    = URL.createObjectURL(blob);

      // 2. Trigger download
      const ts   = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
      const link = document.createElement('a');
      link.href     = url;
      link.download = `grupo_sombra_backup_${ts}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // 3. Let the user close the tab manually (browsers block window.close)
      setTimeout(() => {
        setExiting(false);
        alert('✅ Backup salvo! Pode fechar o tab agora.');
      }, 600);
    } catch (err) {
      console.error('[Exit] Backup error:', err);
      setExiting(false);
      alert('Erro ao gerar backup: ' + err.message);
    }
  };

  return (
    <>
      <SpotlightSearch />
      <header className="topbar" id="topbar">
        <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onToggleSidebar} className="btn btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 16, marginLeft: -8 }} title="Alternar Menu Lateral">
            ☰
          </button>
          <div className="topbar-breadcrumbs fade-in">
            <button className="breadcrumb-btn" onClick={() => navigate('/')} title="Ir para o Hub Geral">
              🏠 Hub
            </button>
            <span className="breadcrumb-separator">›</span>
            
            {activeEmpresa && location.pathname !== '/' && (
              <>
                <button className="breadcrumb-btn" onClick={() => navigate(`/empresa/${activeEmpresa.id}`)} title="Visão Geral da Empresa">
                  🏢 {activeEmpresa.name}
                </button>
                <span className="breadcrumb-separator">›</span>
                
                {routeInfo.section && (
                  <>
                    <span className="breadcrumb-text">{routeInfo.section}</span>
                    <span className="breadcrumb-separator">›</span>
                  </>
                )}
              </>
            )}
            
            {location.pathname !== '/' && (
              <div className="breadcrumb-current">
                <span className="breadcrumb-icon">{routeInfo.icon}</span>
                <span className="breadcrumb-label">{routeInfo.label}</span>
              </div>
            )}
          </div>
        </div>

      <div className="topbar-right">
        {activeEmpresa && (
          <div
            className="topbar-empresa-chip"
            style={{ borderColor: activeEmpresa.color + '60', color: activeEmpresa.color }}
          >
            <span
              className="topbar-empresa-dot"
              style={{ backgroundColor: activeEmpresa.color }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontWeight: 600 }}>{activeEmpresa.name}</span>
              {activeEmpresa.cnpj && <span style={{ fontSize: 9, opacity: 0.7, fontFamily: 'var(--font-mono)' }}>{activeEmpresa.cnpj}</span>}
            </div>
          </div>
        )}
        
        <div className="topbar-shortcut-hint" title="Pesquisa Rápida (Ctrl+K)">
          <span>Ctrl</span>+<span>K</span>
        </div>
        <div className="topbar-date">
          {new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
        </div>

        {/* Exit with backup */}
        <button
          id="btn-exit-backup"
          onClick={handleExit}
          disabled={exiting}
          title="Salvar backup completo e sair do app"
          style={{
            display:        'flex',
            alignItems:     'center',
            gap:            6,
            padding:        '5px 12px',
            borderRadius:   20,
            border:         '1px solid rgba(248,113,113,0.35)',
            background:     exiting ? 'rgba(248,113,113,0.15)' : 'transparent',
            color:          'var(--color-red)',
            fontSize:       12,
            fontWeight:     600,
            cursor:         exiting ? 'not-allowed' : 'pointer',
            opacity:        exiting ? 0.7 : 1,
            transition:     'all 0.2s',
            whiteSpace:     'nowrap',
          }}
          onMouseEnter={e => { if (!exiting) e.currentTarget.style.background = 'rgba(248,113,113,0.12)'; }}
          onMouseLeave={e => { if (!exiting) e.currentTarget.style.background = 'transparent'; }}
        >
          {exiting
            ? <><span style={{ display: 'inline-block', width: 11, height: 11, border: '2px solid var(--color-red)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Salvando...</>
            : '⏻ Sair'}
        </button>
      </div>
    </header>
    </>
  );
}

