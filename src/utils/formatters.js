/**
 * formatters.js — Currency and number display helpers (PT-BR)
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Format a number as BRL currency.
 * @param {number} value
 * @returns {string} e.g. "R$ 1.234,56"
 */
export function fmtCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return BRL.format(value);
}

/**
 * Format a number with 2 decimal places.
 * @param {number} value
 * @returns {string} e.g. "1.234,56"
 */
export function fmtNumber(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return NUM.format(value);
}

/**
 * Parse a currency/number string to float (handles "1.234,56" → 1234.56).
 * @param {string|number} str
 * @returns {number}
 */
export function parseCurrency(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  // Remove currency symbol, thousands dots, replace decimal comma
  const cleaned = String(str)
    .replace(/R\$\s?/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}
