import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEmpresa } from '../context/EmpresaContext';
import './EmpresaOverviewPage.css';

export default function ConciliacaoHub() {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const { empresas, activeEmpresa } = useEmpresa();
  const empresaContext = empresas.find(e => e.id === empresaId) || activeEmpresa;

  return (
    <div className="overview-page fade-in">
      <div className="overview-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button 
          onClick={() => navigate(`/empresa/${empresaId}/receitas`)}
          className="btn btn-secondary"
          style={{ padding: '8px 12px', fontSize: 13, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 6, cursor: 'pointer', alignSelf: 'flex-start', marginTop: 4 }}
        >
          ← Voltar
        </button>
        <span style={{ fontSize: 28 }}>🔄</span>
        <div style={{ flex: 1 }}>
          <h1 className="overview-title">Hub de Reconciliação</h1>
          <p className="overview-subtitle">Escolha o tipo de reconciliação para {empresaContext?.name || 'a empresa'}</p>
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>⚡</span> Reconciliações Padrão (Recorrentes)
        </h2>
        <div className="overview-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          
          <button
            className="overview-card"
            style={{ '--card-color': 'var(--color-purple)', '--card-dim': 'var(--color-purple-dim)' }}
            onClick={() => navigate(`/empresa/${empresaId}/conciliacao-receitas/tinus-hits`)}
          >
            <div className="overview-card-bar" />
            <div className="overview-card-top">
              <span className="overview-card-icon">🏨</span>
              <div>
                <div className="overview-card-label">Tinus vs HITs</div>
                <div className="overview-card-sub">NFs Emitidas vs Reservas</div>
              </div>
              <span className="overview-card-arrow">→</span>
            </div>
            <ul className="overview-card-items">
              <li>↔ Match Automático (Regras)</li>
              <li>📅 Filtro de Período</li>
              <li>✅ Aprovação em Lote</li>
            </ul>
          </button>

          <button
            className="overview-card"
            style={{ '--card-color': 'var(--color-green)', '--card-dim': 'var(--color-green-dim)' }}
            onClick={() => navigate(`/empresa/${empresaId}/conciliacao-receitas/tinus-banco`)}
          >
            <div className="overview-card-bar" />
            <div className="overview-card-top">
              <span className="overview-card-icon">🏦</span>
              <div>
                <div className="overview-card-label">Receitas por Competência</div>
                <div className="overview-card-sub">Tinus vs Banco</div>
              </div>
              <span className="overview-card-arrow">→</span>
            </div>
            <ul className="overview-card-items">
              <li>↔ Match Automático (Regras)</li>
              <li>📅 Filtro e Tolerância</li>
              <li>⚡ Assistente de Aprovação</li>
            </ul>
          </button>



        </div>
      </div>
      <div>
        <h2 style={{ fontSize: 18, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>🛠️</span> Reconciliação Ad-Hoc
        </h2>
        <div className="overview-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          
          <button
            className="overview-card"
            style={{ '--card-color': 'var(--color-accent)', '--card-dim': 'var(--color-accent-dim)' }}
            onClick={() => navigate(`/empresa/${empresaId}/conciliacao-receitas/avancada`)}
          >
            <div className="overview-card-bar" />
            <div className="overview-card-top">
              <span className="overview-card-icon">⚖️</span>
              <div>
                <div className="overview-card-label">Reconciliação Avançada</div>
                <div className="overview-card-sub">Modelo Flexível (Data/Valor)</div>
              </div>
              <span className="overview-card-arrow">→</span>
            </div>
            <ul className="overview-card-items">
              <li>⚙️ Mapeamento Manual</li>
              <li>🎚️ Tolerância Fuzzy</li>
              <li>💾 Salvar Presets</li>
            </ul>
          </button>

        </div>
      </div>
    </div>
  );
}
