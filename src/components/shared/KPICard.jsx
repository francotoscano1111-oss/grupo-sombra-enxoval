/**
 * KPICard.jsx — Reusable KPI metric card
 */
import React from 'react';

export default function KPICard({ label, value, sub, color, icon, trend }) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${color || 'var(--color-accent)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span className="kpi-label">{label}</span>
        {icon && <span style={{ fontSize: 20, opacity: 0.6 }}>{icon}</span>}
      </div>
      <div className="kpi-value" style={{ color: color || 'var(--color-text-primary)' }}>
        {value ?? '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {sub && <span className="kpi-sub">{sub}</span>}
        {trend !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: trend > 0 ? 'var(--color-green)' : trend < 0 ? 'var(--color-red)' : 'var(--color-text-muted)'
          }}>
            {trend > 0 ? `▲ ${trend}%` : trend < 0 ? `▼ ${Math.abs(trend)}%` : '—'}
          </span>
        )}
      </div>
    </div>
  );
}
