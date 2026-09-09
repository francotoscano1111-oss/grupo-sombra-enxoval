/**
 * modulosConfig.js — Single source of truth for RECEITAS and DESPESAS sub-modules.
 *
 * Both the Sidebar links and the EmpresaOverviewPage/GroupPage cards
 * are derived from these arrays. To add a new module, add ONE entry here.
 *
 * Each entry:
 *   key       — route segment (e.g. 'entradas' → /empresa/:id/entradas)
 *   label     — display name (PT-BR)
 *   icon      — emoji icon
 *   color     — accent color (CSS variable or hex)
 *   dimColor  — subtle background for hover
 *   sub       — card subtitle
 *   items     — bullet list shown inside the card
 */

export const RECEITAS_MODULOS = [
  {
    key:      'registro-reservas',
    label:    'Reservas (HITs)',
    icon:     '🏨',
    color:    '#38bdf8',
    dimColor: 'rgba(56,189,248,0.08)',
    sub:      'Arcoiris HITs',
    items:    ['📥 Import Excel', '🏷️ Vouchers', '📊 Export'],
  },
  {
    key:      'nfs-emitidas',
    label:    'NFs Emitidas',
    icon:     '🧾',
    color:    '#a78bfa',
    dimColor: 'rgba(167,139,250,0.08)',
    sub:      'Import OMIE pivot',
    items:    ['📥 Import Excel', '🔍 Filtros', '📊 Export'],
  },
  {
    key:      'entradas',
    label:    'Entradas',
    icon:     '📥',
    color:    'var(--color-green)',
    dimColor: 'var(--color-green-dim)',
    sub:      'Triagem Bancária',
    items:    ['🏦 Extratos de Crédito', '✓ Seleção Manual', '➡️ Envio à Reconciliação'],
  },
  {
    key:      'cartoes-credito',
    label:    'Cartões de Crédito',
    icon:     '💳',
    color:    'var(--color-purple)',
    dimColor: 'var(--color-purple-dim)',
    sub:      'Gestão Multi-Adquirentes',
    items:    ['💳 Stone, Sicoob, Bee2pay', '📥 Importação Unificada', '⚖️ Reconciliação'],
  },
  {
    key:      'bookings',
    label:    'Bookings',
    icon:     '📋',
    color:    '#fb923c',
    dimColor: 'rgba(251,146,60,0.08)',
    sub:      'Booking.com · RN auto',
    items:    ['📥 Import Excel', '🔢 Room Nights', '📊 Export'],
  },
  {
    key:      'conciliacao-receitas',
    label:    'Reconciliação',
    icon:     '🔄',
    color:    'var(--color-accent)',
    dimColor: 'var(--color-accent-dim)',
    sub:      'Reconciliar · Comparar módulos',
    items:    ['↔ Comparar A vs B', '✅ Salvar pares', '📊 Export Excel'],
  },
  /*
  {
    key:      'a-receber',
    label:    'A Receber',
    icon:     '💰',
    color:    '#10b981',
    dimColor: 'rgba(16, 185, 129, 0.08)',
    sub:      'Contas a Receber',
    items:    ['📋 Lançamentos', '⏰ Vencimentos', '✅ Status'],
  },
  */
];

export const DESPESAS_MODULOS = [
  {
    key:      'documentos',
    label:    'Documentos',
    icon:     '📁',
    color:    'var(--color-yellow)',
    dimColor: 'rgba(251,191,36,0.08)',
    sub:      'PDF · Auto-Match · Vínculos',
    items:    ['🤖 Auto-Match PDF', '📎 Vínculos', '⚠️ Pendentes'],
  },
  {
    key:      'saidas',
    label:    'Saídas',
    icon:     '💸',
    color:    'var(--color-red)',
    dimColor: 'var(--color-red-dim)',
    sub:      'Contas a Pagar',
    items:    ['📋 Lançamentos', '⏰ Vencimentos', '✅ Status'],
  },
  {
    key:      'conciliacao-despesas',
    label:    'Reconciliação',
    icon:     '🔄',
    color:    'var(--color-accent)',
    dimColor: 'var(--color-accent-dim)',
    sub:      'Saídas ↔ Documentos',
    items:    ['🧾 Lançamentos Saídas', '📎 Vincular Comprovantes', '✅ Validar Pares'],
  },
  /*
  {
    key:      'contas-pagar',
    label:    'Contas a Pagar',
    icon:     '💳',
    color:    '#f59e0b',
    dimColor: 'rgba(245,158,11,0.08)',
    sub:      'Import OMIE · 30 campos',
    items:    ['📥 Import Excel', '🏷️ Fornecedores', '📊 Export'],
  },
  */
];

export const getDynamicReceitasModulos = (empresa, adquirentes = []) => {
  return RECEITAS_MODULOS.map(mod => {
    // Inject dynamic adquirentes list into Cartões de Crédito subtitle items
    if (mod.key === 'cartoes-credito' && adquirentes.length > 0) {
      const adqNames = adquirentes.map(a => a.nome).join(', ');
      return { 
        ...mod, 
        items: [`💳 ${adqNames}`, ...mod.items.slice(1)]
      };
    }

    if (!empresa) return mod;
    const name = String(empresa.name || empresa.nome || '').toUpperCase();
    const isConcept  = name.includes('SAF ') || name.includes('JM SCP');
    const isGoyanna  = name.includes('GOYANNA');
    const isHits     = empresa.sistemaFrontend === 'hits';

    if (mod.key === 'registro-reservas') {
      if (isHits) {
        return {
          ...mod,
          label: 'Reservas & Consumos (HITS)',
          sub:   'Resumo de Conta · Consumos',
          items: ['📥 Resumo de Conta', '🍽️ Consumos Lançados', '📊 Export'],
        };
      } else if (isConcept) {
        return { 
          ...mod, 
          label: 'Reservas (Concept)',
          sub: 'SAF Concept',
          items: ['📥 Import Concept Excel/PDF', '🏷️ Vouchers Concept', '📊 Export']
        };
      } else if (isGoyanna) {
        return { 
          ...mod, 
          label: 'Reservas (Goyanna)',
          sub: 'Gestão de Reservas',
          items: ['📥 Import Excel', '🏷️ Reservas', '📊 Export']
        };
      }
    }

    if (mod.key === 'bookings') {
      if (isConcept || isGoyanna) return null;
    }

    return mod;
  }).filter(Boolean);
};
