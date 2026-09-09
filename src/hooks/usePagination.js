import { useState, useMemo, useEffect } from 'react';

/**
 * usePagination - Hook generico per la paginazione tabellare lato client
 * @param {Array} data - L'intero array di dati (già filtrato/ordinato se necessario)
 * @param {number} itemsPerPage - Numero di elementi visibili per pagina (default 50)
 */
export function usePagination(data = [], itemsPerPage = 50) {
  const [currentPage, setCurrentPage] = useState(1);

  // Se i dati cambiano (es. applico un filtro), torna alla pagina 1
  useEffect(() => {
    setCurrentPage(1);
  }, [data]);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  const currentRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return data.slice(start, start + itemsPerPage);
  }, [data, currentPage, itemsPerPage]);

  const goToPage = (page) => {
    const pageNum = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(pageNum);
  };

  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);

  return {
    currentRows,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    nextPage,
    prevPage,
    itemsPerPage
  };
}
