/**
 * App.jsx — Root component with routing, providers, and layout shell
 */
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { EmpresaProvider } from './context/EmpresaContext';
import { ToastProvider } from './context/ToastContext';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import HubPage from './pages/HubPage';
import ReceitasPage from './pages/ReceitasPage';
import EntradasPage from './pages/EntradasPage';
import DespesasPage from './pages/DespesasPage';
import EstratiPage from './pages/EstratiPage';
import NfsEmitidasPage from './pages/NfsEmitidasPage';
import CartoesCreditoPage from './pages/CartoesCreditoPage';
import RegistroReservasPage from './pages/RegistroReservasPage';
import ContasPagarPage from './pages/ContasPagarPage';
import BookingsPage from './pages/BookingsPage';
import DocumentosPage from './pages/DocumentosPage';
import ReceitasHubPage from './pages/ReceitasHubPage';
import FechamentoPage from './pages/FechamentoPage';
import AuditoriaSectorialPage from './pages/AuditoriaSectorialPage';

import EmpresaOverviewPage from './pages/EmpresaOverviewPage';
import ConfiguracaoPage from './pages/ConfiguracaoPage';
import ConciliacaoReceitas from './pages/ConciliacaoReceitas';
import ConciliacaoHub from './pages/ConciliacaoHub';
import TinusVsHitsReconciliation from './pages/TinusVsHitsReconciliation';
import TinusVsBancoReconciliation from './pages/TinusVsBancoReconciliation';
import ConciliacaoDespesas from './pages/ConciliacaoDespesas';
import ReceitasGroupPage from './pages/ReceitasGroupPage';
import DespesasGroupPage from './pages/DespesasGroupPage';
import { useAutoBackup } from './hooks/useAutoBackup';
import { ErrorBoundary } from './components/ErrorBoundary';

function AppLayout() {
  const location = useLocation();
  useAutoBackup(); // auto-save to localStorage every 5 min
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--color-bg)',
    }}>
      {/* Sidebar always visible unless toggled */}
      <Sidebar collapsed={!sidebarOpen} />

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar onToggleSidebar={() => setSidebarOpen(v => !v)} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<HubPage />} />
              <Route path="/empresa/:empresaId/receitas"              element={<ReceitasGroupPage />} />
              <Route path="/empresa/:empresaId/a-receber"             element={<ReceitasPage />} />
              <Route path="/empresa/:empresaId/entradas"              element={<EntradasPage />} />
              <Route path="/empresa/:empresaId/nfs-emitidas"          element={<NfsEmitidasPage />} />
              <Route path="/empresa/:empresaId/cartoes-credito"       element={<CartoesCreditoPage />} />
              <Route path="/import-hub/cc-stone"                      element={<ReceitasHubPage />} />

              <Route path="/empresa/:empresaId/registro-reservas"     element={<RegistroReservasPage />} />
              <Route path="/empresa/:empresaId/bookings"              element={<BookingsPage />} />
              <Route path="/empresa/:empresaId/conciliacao-receitas"  element={<ConciliacaoHub />} />
              <Route path="/empresa/:empresaId/conciliacao-receitas/avancada"  element={<ConciliacaoReceitas />} />
              <Route path="/empresa/:empresaId/conciliacao-receitas/tinus-hits"  element={<TinusVsHitsReconciliation />} />
              <Route path="/empresa/:empresaId/conciliacao-receitas/tinus-banco" element={<TinusVsBancoReconciliation />} />
              <Route path="/empresa/:empresaId/receitas-auditoria"    element={<AuditoriaSectorialPage sector="receitas" />} />
              
              <Route path="/empresa/:empresaId/despesas"              element={<DespesasGroupPage />} />
              <Route path="/empresa/:empresaId/saidas"                element={<DespesasPage />} />
              <Route path="/empresa/:empresaId/contas-pagar"          element={<ContasPagarPage />} />
              <Route path="/empresa/:empresaId/conciliacao-despesas"  element={<ConciliacaoDespesas />} />
              <Route path="/empresa/:empresaId/despesas-auditoria"    element={<AuditoriaSectorialPage sector="despesas" />} />
              
              <Route path="/empresa/:empresaId/estratti"              element={<EstratiPage />} />
              <Route path="/empresa/:empresaId/documentos"            element={<DocumentosPage />} />
              <Route path="/empresa/:empresaId/fechamento"            element={<FechamentoPage />} />
              <Route path="/empresa/:empresaId"                       element={<EmpresaOverviewPage />} />
              <Route path="/configuracoes" element={<ConfiguracaoPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}



export default function App() {
  return (
    <BrowserRouter>
      <EmpresaProvider>
        <ToastProvider>
          <AppLayout />
        </ToastProvider>
      </EmpresaProvider>
    </BrowserRouter>
  );
}
