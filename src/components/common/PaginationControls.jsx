import React from 'react';

export default function PaginationControls({ 
  currentPage, 
  totalPages, 
  totalItems, 
  nextPage, 
  prevPage, 
  goToPage 
}) {
  if (totalItems === 0 || totalPages <= 1) return null;

  return (
    <div style={{
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '12px 16px',
      background: 'var(--color-bg-hover)',
      borderTop: '1px solid var(--color-border)',
      borderBottomLeftRadius: 8,
      borderBottomRightRadius: 8,
      marginTop: 'auto'
    }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        Mostrando <strong style={{ color: 'var(--color-text-primary)' }}>{totalItems}</strong> itens
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button 
          className="btn btn-secondary" 
          onClick={prevPage} 
          disabled={currentPage === 1}
          style={{ padding: '6px 12px', fontSize: 12 }}
        >
          &larr; Anterior
        </button>

        <span style={{ fontSize: 13, fontWeight: 500 }}>
          Página {currentPage} de {totalPages}
        </span>

        <button 
          className="btn btn-secondary" 
          onClick={nextPage} 
          disabled={currentPage === totalPages}
          style={{ padding: '6px 12px', fontSize: 12 }}
        >
          Próxima &rarr;
        </button>
      </div>
    </div>
  );
}
