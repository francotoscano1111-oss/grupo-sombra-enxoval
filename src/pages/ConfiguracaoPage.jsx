/**
 * ConfiguracaoPage.jsx — Settings: empresa management + backup/restore system
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useEmpresa } from '../context/EmpresaContext';
import { useToast } from '../context/ToastContext';
import { exportFullBackup, importFullBackup, resetAllData } from '../utils/db';
import { getAutoBackupMeta, downloadAutoBackup } from '../hooks/useAutoBackup';
import {
  useArchive,
  ARCHIVE_MODULES_CONFIG,
  getArchivePreviewAll,
  getStoricoSummary,
} from '../hooks/useHitsArchive';
import EmpresaModal from '../components/shared/EmpresaModal';

/** Format bytes to human readable */
function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function CardSection({ title, icon, children }) {
  return (
    <div style={{
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 12,
      padding: 24,
      marginBottom: 20,
    }}>
      <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function ConfiguracaoPage() {
  const { empresas, addEmpresa, updateEmpresa, deleteEmpresa } = useEmpresa();
  const toast = useToast();

  const [showEmpresaModal, setShowEmpresaModal] = useState(false);
  const [editingEmpresa,   setEditingEmpresa]   = useState(null);
  const [restoring,  setRestoring]  = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [resetting,  setResetting]  = useState(false);
  const [autoMeta,   setAutoMeta]   = useState(null);

  // ── Archivio state ──
  const { archiving, progress, runArchive } = useArchive();
  const [archEmpresaId,  setArchEmpresaId]  = useState('');
  const [archCutoff,     setArchCutoff]     = useState(() => {
    const d = new Date(); d.setDate(0);
    return d.toISOString().slice(0, 10);
  });
  // Which modules are selected (all enabled by default)
  const [archModules,    setArchModules]    = useState(() => ARCHIVE_MODULES_CONFIG.map(c => c.key));
  const [archPreview,    setArchPreview]    = useState(null);  // array of { key, label, icon, count }
  const [storicoSummary, setStoricoSummary] = useState([]);   // array of { key, label, icon, count }

  const toggleModule = (key) =>
    setArchModules(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // Refresh preview whenever empresa, cutoff or selected modules change
  useEffect(() => {
    if (!archEmpresaId || !archCutoff) { setArchPreview(null); return; }
    setArchPreview(null);
    getArchivePreviewAll(archEmpresaId, archCutoff, archModules).then(setArchPreview);
  }, [archEmpresaId, archCutoff, archModules]);

  // Refresh storico summary whenever empresa changes
  useEffect(() => {
    if (!archEmpresaId) { setStoricoSummary([]); return; }
    getStoricoSummary(archEmpresaId).then(setStoricoSummary);
  }, [archEmpresaId]);

  const totalToArchive = archPreview?.reduce((s, m) => s + m.count, 0) ?? 0;

  const handleArchive = useCallback(async () => {
    if (!archEmpresaId || !archCutoff || archModules.length === 0) return;
    const emp = empresas.find(e => e.id === archEmpresaId);
    const lines = (archPreview ?? []).filter(m => m.count > 0)
      .map(m => `  ${m.icon} ${m.label}: ${m.count}`).join('\n');
    if (!window.confirm(
      `📦 Archiviare i seguenti dati di "${emp?.name}" (data ≤ ${archCutoff})?\n\n${lines}\n\nI dati saranno SPOSTATI nel database storico.\nNessun rollback automatico.`
    )) return;
    if (!window.confirm('✅ Conferma definitiva. Procedere?')) return;
    try {
      const results = await runArchive(archEmpresaId, archCutoff, archModules);
      const totalMoved  = results.reduce((s, r) => s + r.moved,  0);
      const totalErrors = results.reduce((s, r) => s + r.errors, 0);
      const msg = totalErrors > 0
        ? `⚠️ ${totalMoved} record archiviati, ${totalErrors} errori.`
        : `✅ ${totalMoved} record archiviati con successo!`;
      toast.success(msg);
      setArchPreview(null);
      getArchivePreviewAll(archEmpresaId, archCutoff, archModules).then(setArchPreview);
      getStoricoSummary(archEmpresaId).then(setStoricoSummary);
    } catch (e) {
      toast.error('Erro ao arquivar: ' + e.message);
    }
  }, [archEmpresaId, archCutoff, archModules, archPreview, empresas, runArchive, toast]);

  // ── Manual export ──
  const handleExport = async () => {
    setExporting(true);
    try {
      const backup = await exportFullBackup();
      const blob   = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url    = URL.createObjectURL(blob);
      const a      = document.createElement('a');
      a.href       = url;
      a.download   = `sombra_backup_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('✅ Backup exportado com sucesso!');
    } catch (e) {
      toast.error('Erro ao exportar: ' + e.message);
    }
    setExporting(false);
  };

  // ── Auto-backup download ──
  const handleDownloadAuto = () => {
    const ok = downloadAutoBackup();
    if (ok) toast.success('Auto-backup baixado!');
    else toast.error('Nenhum auto-backup disponível ainda.');
  };

  // ── Restore ──
  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let backup;
    try { backup = JSON.parse(text); } catch { toast.error('Arquivo inválido'); return; }
    if (!window.confirm('⚠️ Restaurar irá SUBSTITUIR todos os dados atuais. Confirma?')) return;
    setRestoring(true);
    try {
      await importFullBackup(backup);
      toast.success('✅ Dados restaurados! Recarregue a página.');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast.error('Erro ao restaurar: ' + err.message);
    }
    setRestoring(false);
    e.target.value = '';
  };

  // ── Reset system ──
  const handleReset = async () => {
    if (!window.confirm('\u26a0\ufe0f ATEN\u00c7\u00c3O: Apaga TODOS OS DADOS (empresas, bancos, extratos, receitas, despesas) e localStorage.\n\nFa\u00e7a um backup antes!\n\nConfirma?')) return;
    if (!window.confirm('Tem certeza absoluta? N\u00e3o h\u00e1 como desfazer.')) return;
    setResetting(true);
    try {
      await resetAllData();
      toast.success('Sistema reiniciado. Recarregando...');
      setTimeout(() => window.location.replace('/'), 1200);
    } catch (e) {
      toast.error('Erro ao reiniciar: ' + e.message);
      setResetting(false);
    }
  };

  // ── Empresa handlers ──
  const handleSaveEmpresa = async (data) => {
    if (editingEmpresa) updateEmpresa({ ...editingEmpresa, ...data });
    else await addEmpresa(data);
    setShowEmpresaModal(false);
    setEditingEmpresa(null);
  };

  const handleDeleteEmpresa = (emp) => {
    if (!window.confirm(`Deletar "${emp.name}"? Todos os dados associados ficam no banco.`)) return;
    deleteEmpresa(emp.id);
    toast.info(`Empresa "${emp.name}" removida.`);
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 780, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 28 }}>⚙️ Configurações</h1>

      {/* ── BACKUP DADOS ── */}
      <CardSection title="Segurança dos Dados — Backup & Restauração" icon="🛡️">

        {/* Auto-backup status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: autoMeta ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${autoMeta ? 'rgba(52,211,153,0.25)' : 'rgba(248,113,113,0.25)'}`,
        }}>
          <span style={{ fontSize: 20 }}>{autoMeta ? '🟢' : '🔴'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13,
              color: autoMeta ? 'var(--color-green)' : 'var(--color-red)' }}>
              Auto-backup {autoMeta ? 'ativo' : 'ainda não executado'}
            </div>
            {autoMeta && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                Último: {fmtTs(autoMeta.ts)} · Tamanho: {fmtBytes(autoMeta.size)} · Atualizado a cada 8h
              </div>
            )}
          </div>
          {autoMeta && (
            <button className="btn btn-ghost btn-sm" onClick={handleDownloadAuto} title="Baixar último auto-backup">
              ⬇️ Baixar
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Export manual */}
          <div style={{ background: 'var(--color-bg-hover)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>📤 Exportar Backup Completo</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              Baixe todos os dados em um arquivo JSON. Use periodicamente e guarde em local seguro.
            </div>
            <button
              id="btn-export-backup"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? '⏳ Exportando...' : '💾 Exportar agora'}
            </button>
          </div>

          {/* Restaurar */}
          <div style={{ background: 'var(--color-bg-hover)', borderRadius: 8, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>📥 Restaurar Backup</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
              ⚠️ Substitui todos os dados atuais pelo backup selecionado.
            </div>
            <label style={{ display: 'block' }}>
              <span className="btn btn-secondary" style={{ width: '100%', display: 'block', textAlign: 'center', cursor: 'pointer' }}>
                {restoring ? '⏳ Restaurando...' : '📂 Selecionar arquivo .json'}
              </span>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleRestore}
                disabled={restoring}
                id="input-restore-backup"
              />
            </label>
          </div>
        </div>

        {/* Aviso boas práticas */}
        <div style={{
          marginTop: 14, padding: '10px 14px', borderRadius: 8,
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
          fontSize: 12, color: 'var(--color-yellow)', lineHeight: 1.6,
        }}>
          💡 <strong>Boa prática:</strong> Exporte um backup manual pelo menos 1× por semana e salve num lugar seguro (OneDrive, Google Drive, pendrive).
          O arquivo .bat faz backup automático do código a cada abertura do app.
        </div>
      </CardSection>

      {/* ── EMPRESAS ── */}
      <CardSection title="Gestão de Empresas" icon="🏢">
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {empresas.map(emp => (
            <div
              key={emp.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8,
                background: 'var(--color-bg-hover)',
                borderLeft: `4px solid ${emp.color}`,
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: '50%', background: emp.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, color: '#fff', fontSize: 12, flexShrink: 0,
              }}>
                {emp.name.slice(0, 2).toUpperCase()}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{emp.name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{emp.id}</div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setEditingEmpresa(emp); setShowEmpresaModal(true); }}
              >✏️</button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-red)' }}
                onClick={() => handleDeleteEmpresa(emp)}
              >×</button>
            </div>
          ))}
        </div>
        <button
          className="btn btn-secondary"
          id="btn-add-empresa-config"
          onClick={() => { setEditingEmpresa(null); setShowEmpresaModal(true); }}
        >
          + Adicionar Empresa
        </button>
      </CardSection>

      {/* ── INFO ── */}
      <CardSection title="Informações do Sistema" icon="ℹ️">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
          {[
            ['Versão', '0.1.0'],
            ['Armazenamento', 'IndexedDB (browser local)'],
            ['Empresas', empresas.length],
            ['Store DB', "'data' (\u00fanico)"],
            ['Auto-backup', 'localStorage · a cada 8h'],
            ['Backup de código', '_backups/codice/ · a cada abertura'],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '8px 12px', background: 'var(--color-bg-hover)', borderRadius: 6 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>{k}:</span>{' '}
              <strong style={{ color: 'var(--color-text-secondary)' }}>{v}</strong>
            </div>
          ))}
        </div>
      </CardSection>

      {/* ── ARCHIVIO STORICO ── */}
      <CardSection title="Archivio Storico" icon="📦">
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          Sposta i dati riconciliati in un DB storico separato per mantenere il DB attivo leggero.
          I dati archiviati non interferiscono con le funzionalità normali e sono accessibili su richiesta.
        </div>

        {/* Empresa + Cutoff */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Empresa</label>
            <select className="form-input" value={archEmpresaId} onChange={e => setArchEmpresaId(e.target.value)} style={{ width: '100%', fontSize: 13 }}>
              <option value="">Selecionar empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>Archivia dati con data ≤</label>
            <input type="date" className="form-input" value={archCutoff} onChange={e => setArchCutoff(e.target.value)} style={{ width: '100%', fontSize: 13 }} />
          </div>
        </div>

        {/* Module checkboxes */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600 }}>Moduli da archiviare</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
            {ARCHIVE_MODULES_CONFIG.map(cfg => (
              <label key={cfg.key} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 6, cursor: 'pointer', fontSize: 12,
                background: archModules.includes(cfg.key) ? 'rgba(99,102,241,0.1)' : 'var(--color-bg-hover)',
                border: `1px solid ${archModules.includes(cfg.key) ? 'rgba(99,102,241,0.4)' : 'var(--color-border)'}`,
                transition: 'all 0.15s',
              }}>
                <input type="checkbox"
                  checked={archModules.includes(cfg.key)}
                  onChange={() => toggleModule(cfg.key)}
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setArchModules(ARCHIVE_MODULES_CONFIG.map(c => c.key))}>Tutti</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setArchModules([])}>Nessuno</button>
          </div>
        </div>

        {/* Preview grid */}
        {archEmpresaId && archCutoff && (
          <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 16, background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Anteprima — record da archiviare</div>
            {archPreview === null ? (
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>⏳ Calcolo in corso...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                {archPreview.map(m => (
                  <div key={m.key} style={{
                    padding: '8px 12px', borderRadius: 6, background: 'var(--color-bg-secondary)',
                    border: `1px solid ${m.count > 0 ? 'rgba(99,102,241,0.3)' : 'var(--color-border)'}`,
                  }}>
                    <span style={{ fontSize: 14 }}>{m.icon}</span>
                    {' '}
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{m.label}</span>
                    <div style={{ fontWeight: 700, fontSize: 15, color: m.count > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)', marginTop: 2 }}>
                      {m.count}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10, fontWeight: 700, fontSize: 13 }}>
              Totale: <span style={{ color: totalToArchive > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{totalToArchive} record</span>
            </div>
            {storicoSummary.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)', fontSize: 11, color: 'var(--color-text-muted)' }}>
                🗄️ Storico esistente: {storicoSummary.map(s => `${s.icon} ${s.label}: ${s.count}`).join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* Progress bar */}
        {archiving && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: 'var(--color-text-muted)' }}>⏳ Archiviazione in corso...</span>
              <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>{progress}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--color-bg-hover)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--color-accent)', transition: 'width 0.3s ease', borderRadius: 4 }} />
            </div>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleArchive}
          disabled={archiving || !archEmpresaId || !archCutoff || archModules.length === 0 || totalToArchive === 0}
          style={{ width: '100%', marginBottom: 4 }}
        >
          {archiving ? `⏳ Archiviando... ${progress}%` : `📦 Archivia ${totalToArchive > 0 ? `(${totalToArchive} record)` : ''}`}
        </button>

        {archPreview !== null && totalToArchive === 0 && archEmpresaId && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 6 }}>
            ℹ️ Nessun record da archiviare per i moduli e la data selezionati.
          </div>
        )}

        <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 12, color: 'var(--color-yellow)', lineHeight: 1.6 }}>
          ⚠️ <strong>Attenzione:</strong> l&apos;operazione è irreversibile (nessun rollback automatico).
          Si consiglia di <strong>esportare un backup completo</strong> prima di procedere.
        </div>
      </CardSection>

      {/* ── REINICIAR ── */}
      <CardSection title="Reiniciar Sistema" icon="🗑️">
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 14,
          background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)',
          fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--color-red)' }}>⚠️ Zona de perigo</strong><br />
          Apaga <strong>TODOS os dados</strong> do sistema: empresas, banco, extratos, receitas e despesas.
          Use apenas para começar do zero. <strong>Faça um backup antes!</strong>
        </div>
        <button
          id="btn-reset-sistema"
          className="btn"
          style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--color-red)', border: '1px solid rgba(248,113,113,0.4)', fontWeight: 700 }}
          onClick={handleReset}
          disabled={resetting}
        >
          {resetting ? '⏳ Reiniciando...' : '🗑️ Reiniciar banco de dados'}
        </button>
      </CardSection>

      {/* Empresa modal */}
      {showEmpresaModal && (
        <EmpresaModal
          empresa={editingEmpresa}
          onSave={handleSaveEmpresa}
          onClose={() => { setShowEmpresaModal(false); setEditingEmpresa(null); }}
        />
      )}
    </div>
  );
}
