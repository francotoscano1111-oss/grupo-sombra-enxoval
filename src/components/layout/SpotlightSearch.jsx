import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmpresa } from '../../context/EmpresaContext';
import './SpotlightSearch.css';

const COMMANDS = [
  { id: 'hub', label: 'Ir para o Hub Geral', icon: '🏠', path: '/' },
  { id: 'config', label: 'Configurações do Sistema', icon: '⚙️', path: '/configuracoes' },
];

const MODULES = [
  { id: 'receitas', label: 'Resumo de Receitas', icon: '📈', cat: 'Financeiro', pathSegment: 'receitas' },
  { id: 'entradas', label: 'Contas a Receber (Entradas)', icon: '💰', cat: 'Financeiro', pathSegment: 'entradas' },
  { id: 'nfs', label: 'Notas Fiscais Emitidas', icon: '🧾', cat: 'Financeiro', pathSegment: 'nfs-emitidas' },
  { id: 'cartao', label: 'Recebimentos Cartão / Stone', icon: '💳', cat: 'Financeiro', pathSegment: 'cartoes-credito' },
  { id: 'reservas', label: 'Registro de Reservas', icon: '📅', cat: 'Operacional', pathSegment: 'registro-reservas' },
  { id: 'bookings', label: 'Auditoria Bookings', icon: '🔍', cat: 'Operacional', pathSegment: 'bookings' },
  { id: 'concil-rec', label: 'Conciliação de Receitas', icon: '🔗', cat: 'Reconciliação', pathSegment: 'conciliacao-receitas' },
  { id: 'despesas', label: 'Resumo de Despesas', icon: '📉', cat: 'Financeiro', pathSegment: 'despesas' },
  { id: 'saidas', label: 'Contas a Pagar (Saídas)', icon: '💸', cat: 'Financeiro', pathSegment: 'saidas' },
  { id: 'contas-pagar', label: 'Auditoria Contas a Pagar', icon: '📋', cat: 'Financeiro', pathSegment: 'contas-pagar' },
  { id: 'concil-desp', label: 'Conciliação de Despesas', icon: '🔗', cat: 'Reconciliação', pathSegment: 'conciliacao-despesas' },
  { id: 'estratti', label: 'Extratos Bancários', icon: '🏦', cat: 'Geral', pathSegment: 'estratti' },
  { id: 'documentos', label: 'Gestão de Documentos', icon: '📁', cat: 'Geral', pathSegment: 'documentos' },
  { id: 'fechamento', label: 'Fechamento Contábil', icon: '🔒', cat: 'Geral', pathSegment: 'fechamento' },
];

export default function SpotlightSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { activeEmpresa, empresas, selectEmpresa } = useEmpresa();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Keyboard listener for Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build search results
  const results = React.useMemo(() => {
    const q = query.toLowerCase();
    let res = [];

    // 1. Global Commands
    COMMANDS.forEach(c => {
      if (c.label.toLowerCase().includes(q) || c.id.includes(q)) {
        res.push({ ...c, type: 'comando' });
      }
    });

    // 2. Switch Empresa
    empresas.forEach(emp => {
      if (`mudar alterar empresa ${emp.name}`.toLowerCase().includes(q)) {
        res.push({
          id: `emp-${emp.id}`, label: `Mudar Empresa: ${emp.name}`, icon: '🏢',
          action: () => { selectEmpresa(emp); navigate(`/empresa/${emp.id}`); }, type: 'empresa'
        });
      }
    });

    // 3. Modules (if active empresa)
    if (activeEmpresa) {
      MODULES.forEach(m => {
        if (`${m.label} ${m.cat} ${m.pathSegment}`.toLowerCase().includes(q)) {
          res.push({
            id: `mod-${m.id}`, label: m.label, meta: m.cat, icon: m.icon,
            action: () => navigate(`/empresa/${activeEmpresa.id}/${m.pathSegment}`), type: 'modulo'
          });
        }
      });
    }

    return res;
  }, [query, activeEmpresa, empresas, navigate, selectEmpresa]);

  // Keyboard navigation inside modal
  useEffect(() => {
    if (!isOpen) return;
    const handleNavigation = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[selectedIndex];
        if (item) {
          if (item.action) item.action();
          else if (item.path) navigate(item.path);
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleNavigation);
    return () => window.removeEventListener('keydown', handleNavigation);
  }, [isOpen, results, selectedIndex, navigate]);

  // Scroll active item into view
  useEffect(() => {
    const el = document.getElementById(`spotlight-item-${selectedIndex}`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div className="spotlight-overlay" onClick={() => setIsOpen(false)}>
      <div className="spotlight-modal" onClick={e => e.stopPropagation()}>
        <div className="spotlight-header">
          <span className="spotlight-icon">🔍</span>
          <input
            ref={inputRef}
            className="spotlight-input"
            placeholder="Pesquise páginas, ações, ou empresas... (ex: NFs)"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
          <kbd className="spotlight-esc">ESC</kbd>
        </div>
        
        <div className="spotlight-results">
          {results.length === 0 ? (
            <div className="spotlight-empty">Nenhum resultado para "{query}"</div>
          ) : (
            results.map((item, i) => (
              <div
                key={item.id}
                id={`spotlight-item-${i}`}
                className={`spotlight-item ${i === selectedIndex ? 'active' : ''}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => {
                  if (item.action) item.action();
                  else if (item.path) navigate(item.path);
                  setIsOpen(false);
                }}
              >
                <div className="spotlight-item-icon">{item.icon}</div>
                <div className="spotlight-item-label">{item.label}</div>
                {item.meta && <div className="spotlight-item-meta">{item.meta}</div>}
                
                {i === selectedIndex && <div className="spotlight-item-enter">↵ To select</div>}
              </div>
            ))
          )}
        </div>
        <div className="spotlight-footer">
          <span>↑↓ para navegar</span>
          <span>↵ para abrir</span>
        </div>
      </div>
    </div>
  );
}
