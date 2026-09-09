/**
 * HubPage.jsx — Main hub: empresa selector cards + system overview
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmpresa } from '../context/EmpresaContext';
import { useToast } from '../context/ToastContext';
import EmpresaModal from '../components/shared/EmpresaModal';
import './HubPage.css';

export default function HubPage() {
  const navigate = useNavigate();
  const { empresas, selectEmpresa, addEmpresa, updateEmpresa, deleteEmpresa } = useEmpresa();
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState(null);

  const handleSelectReceitas = (emp) => {
    selectEmpresa(emp);
    navigate(`/empresa/${emp.id}/receitas`);
  };

  const handleSelectDespesas = (emp) => {
    selectEmpresa(emp);
    navigate(`/empresa/${emp.id}/despesas`);
  };

  const handleSelectEstratti = (emp) => {
    selectEmpresa(emp);
    navigate(`/empresa/${emp.id}/estratti`);
  };

  const handleSelectDocumentos = (emp) => {
    selectEmpresa(emp);
    navigate(`/empresa/${emp.id}/documentos`);
  };

  const handleAddEmpresa = async (data) => {
    await addEmpresa(data);
    toast.success(`Empresa "${data.name}" adicionada com sucesso!`);
    setShowModal(false);
  };

  const handleEditEmpresa = async (data) => {
    updateEmpresa({ ...editingEmpresa, ...data });
    toast.success('Empresa atualizada!');
    setShowModal(false);
    setEditingEmpresa(null);
  };

  const DELETE_PWD = 'GS123';

  const handleDeleteEmpresa = (emp) => {
    // Step 1: double-check confirm
    if (!window.confirm(`Deletar empresa "${emp.name}"?\nTodos os dados serão removidos permanentemente.`)) return;

    // Step 2: password gate
    const pwd = window.prompt('🔐 Digite a senha de administrador para confirmar:');
    if (pwd === null) return; // user cancelled
    if (pwd !== DELETE_PWD) {
      toast.error('❌ Senha incorreta. Operação cancelada.');
      return;
    }

    deleteEmpresa(emp.id);
    toast.info(`Empresa "${emp.name}" removida.`);
  };

  const openEdit = (emp, e) => {
    e.stopPropagation();
    setEditingEmpresa(emp);
    setShowModal(true);
  };

  return (
    <div className="hub-page">
      {/* Header */}
      <div className="hub-header">
        <div className="hub-header-text">
          <h1 className="hub-title">Finance Hub</h1>
          <p className="hub-subtitle">Selecione uma empresa para acessar os módulos financeiros</p>
        </div>
        <button className="btn btn-primary" id="btn-add-empresa" onClick={() => { setEditingEmpresa(null); setShowModal(true); }}>
          + Nova Empresa
        </button>
      </div>

      {/* Empresa Grid */}
      <div className="hub-grid">
        {empresas.map(emp => (
          <div key={emp.id} className="empresa-card card card-hover">
            {/* Header card — clicável → vai para visão geral da empresa */}
            <div
              className="empresa-card-header"
              style={{ borderColor: emp.color, cursor: 'pointer' }}
              onClick={() => { selectEmpresa(emp); navigate(`/empresa/${emp.id}`); }}
              title={`Abrir visão geral de ${emp.name}`}
            >
              <div
                className="empresa-card-icon"
                style={{ background: emp.color + '20', color: emp.color }}
              >
                {emp.name.charAt(0)}
              </div>
              <div className="empresa-card-info">
                <h2 className="empresa-card-name" style={{ marginBottom: 2 }}>{emp.name}</h2>
                {emp.cnpj && (
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                    {emp.cnpj}
                  </div>
                )}
                <span className="badge badge-accent">Ativa</span>
              </div>
              <button
                className="btn btn-ghost btn-sm empresa-card-edit"
                onClick={(e) => openEdit(emp, e)}
                title="Editar empresa"
              >
                ✏️
              </button>
            </div>

            {/* 2×2 Module Grid */}
            <div className="empresa-card-actions">
              <button
                className="empresa-action-btn module-receitas"
                id={`btn-receitas-${emp.id}`}
                onClick={() => handleSelectReceitas(emp)}
              >
                <span className="empresa-action-icon">💰</span>
                <div className="empresa-action-text">
                  <span className="empresa-action-label">A Receber</span>
                  <span className="empresa-action-sub">Receitas</span>
                </div>
                <span className="empresa-action-arrow">→</span>
              </button>

              <button
                className="empresa-action-btn module-despesas"
                id={`btn-despesas-${emp.id}`}
                onClick={() => handleSelectDespesas(emp)}
              >
                <span className="empresa-action-icon">💸</span>
                <div className="empresa-action-text">
                  <span className="empresa-action-label">Saidas</span>
                  <span className="empresa-action-sub">Despesas</span>
                </div>
                <span className="empresa-action-arrow">→</span>
              </button>

              <button
                className="empresa-action-btn module-estratti"
                id={`btn-estratti-${emp.id}`}
                onClick={() => handleSelectEstratti(emp)}
              >
                <span className="empresa-action-icon">🏦</span>
                <div className="empresa-action-text">
                  <span className="empresa-action-label">Extratos Bancários</span>
                  <span className="empresa-action-sub">Movimentos</span>
                </div>
                <span className="empresa-action-arrow">→</span>
              </button>

              <button
                className="empresa-action-btn module-documentos"
                id={`btn-documentos-${emp.id}`}
                onClick={() => handleSelectDocumentos(emp)}
              >
                <span className="empresa-action-icon">📁</span>
                <div className="empresa-action-text">
                  <span className="empresa-action-label">Documentos</span>
                  <span className="empresa-action-sub">PDF &amp; Vínculos</span>
                </div>
                <span className="empresa-action-arrow">→</span>
              </button>
            </div>

            {/* Delete */}
            <button
              className="empresa-card-delete btn btn-ghost btn-sm"
              onClick={() => handleDeleteEmpresa(emp)}
              title="Deletar empresa"
            >
              🗑️ Deletar
            </button>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {empresas.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🏢</div>
          <div className="empty-state-text">Nenhuma empresa cadastrada</div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Adicionar primeira empresa
          </button>
        </div>
      )}

      {/* Modal: Add/Edit empresa */}
      {showModal && (
        <EmpresaModal
          empresa={editingEmpresa}
          onSave={editingEmpresa ? handleEditEmpresa : handleAddEmpresa}
          onClose={() => { setShowModal(false); setEditingEmpresa(null); }}
        />
      )}
    </div>
  );
}
