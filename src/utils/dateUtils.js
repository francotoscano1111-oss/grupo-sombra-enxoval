/**
 * dateUtils.js — Safe date handling (UTC Trap Fix)
 * ISO date strings "YYYY-MM-DD" are parsed as UTC midnight,
 * which shifts them 1 day back in UTC-3. This file fixes that.
 */

/**
 * Parse "YYYY-MM-DD" safely without UTC shift.
 * @param {string} dateStr
 * @returns {Date}
 */
export function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr) ? null : dateStr;
  
  if (typeof dateStr === 'string') {
    // DD/MM/YYYY handling
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length >= 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        return new Date(y, m - 1, d);
      }
    }
    // YYYY-MM-DD handling
    if (dateStr.includes('-')) {
      const parts = dateStr.split('T')[0].split('-');
      if (parts.length >= 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        return new Date(y, m - 1, d);
      }
    }
  }
  
  // Fallback
  const parsed = new Date(dateStr);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Format a Date to "YYYY-MM-DD" in local timezone.
 * @param {Date|string} date
 * @returns {string}
 */
export function toISOLocal(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fmtDate(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

/**
 * Returns YYYY-MM for the given date.
 */
export function getMonthStr(date) {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Today's date as "YYYY-MM-DD" local.
 * @returns {string}
 */
export function todayISO() {
  return toISOLocal(new Date());
}

/**
 * Number of days until a date (negative = overdue).
 * @param {string} dateStr YYYY-MM-DD
 * @returns {number}
 */
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date is overdue.
 * @param {string} dateStr YYYY-MM-DD
 * @returns {boolean}
 */
export function isOverdue(dateStr) {
  const d = daysUntil(dateStr);
  return d !== null && d < 0;
}
