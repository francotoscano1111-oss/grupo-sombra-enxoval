/**
 * parser.js — Multi-format file parser for GRUPO SOMBRA Finance Hub
 * Supports: CSV, Excel (.xlsx/.xls), OFX/OFC, PDF (metadata only)
 */
import * as XLSX from 'xlsx';
import { parseCurrency } from './formatters';
import { toISOLocal } from './dateUtils';

// --- CSV Parser ---
export async function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return resolve({ headers: [], rows: [] });

        // Detect delimiter: comma, semicolon, tab
        const delimiters = [',', ';', '\t'];
        const counts = delimiters.map(d => (lines[0].split(d).length));
        const delimiter = delimiters[counts.indexOf(Math.max(...counts))];

        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        const rows = lines.slice(1).map(line => {
          const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
          return Object.fromEntries(headers.map((h, i) => [h, cols[i] || '']));
        });
        resolve({ headers, rows, format: 'csv' });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

// --- Excel Parser ---
export async function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        resolve({ headers, rows, sheetNames: wb.SheetNames, format: 'excel' });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// --- OFX Parser (bank statements) ---
export async function parseOFX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        // OFX is SGML-like; we parse the STMTTRN blocks manually
        const transactions = [];
        const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
        let match;
        while ((match = trnRegex.exec(text)) !== null) {
          const block = match[1];
          const get = (tag) => {
            const m = new RegExp(`<${tag}>([^<]+)`, 'i').exec(block);
            return m ? m[1].trim() : '';
          };
          const rawDate = get('DTPOSTED'); // Format: YYYYMMDD or YYYYMMDDHHMMSS
          const dateStr = rawDate.length >= 8
            ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
            : rawDate;

          transactions.push({
            tipo:      get('TRNTYPE'),
            data:      dateStr,
            valor:     parseFloat(get('TRNAMT')) || 0,
            descricao: get('MEMO') || get('NAME') || '',
            fitid:     get('FITID'),
            checknum:  get('CHECKNUM'),
          });
        }

        // Extract account info
        const bankId  = (/<BANKID>([^<]+)/i.exec(text) || [])[1]?.trim() || '';
        const acctId  = (/<ACCTID>([^<]+)/i.exec(text) || [])[1]?.trim() || '';
        const currency = (/<CURSYM>([^<]+)/i.exec(text) || [])[1]?.trim() || 'BRL';

        resolve({
          format: 'ofx',
          bankId,
          acctId,
          currency,
          transactions,
          count: transactions.length,
        });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsText(file, 'latin1');
  });
}

// --- PDF (metadata only — returns file info, not parsed content) ---
export async function parsePDF(file) {
  return {
    format: 'pdf',
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: new Date(file.lastModified).toISOString(),
    // PDF is stored as base64 for preview; content parsing not supported
    note: 'PDF armazenado como anexo. Extração de texto: não suportada.',
  };
}

// --- File to base64 ---
export async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Auto-detect format and parse ---
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const name = file.name.toLowerCase();

  if (ext === 'csv' || (file.type === 'text/csv')) return parseCSV(file);
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(file);
  if (ext === 'ofx' || ext === 'ofc' || name.includes('.ofx')) return parseOFX(file);
  if (ext === 'pdf') return parsePDF(file);

  throw new Error(`Formato não suportado: .${ext}. Use CSV, Excel, OFX ou PDF.`);
}

// --- Column mapping: map parsed rows to standard Receita/Despesa shape ---
export function applyColumnMapping(rows, mapping) {
  /**
   * mapping: {
   *   data: 'colName',
   *   descricao: 'colName',
   *   valor: 'colName',
   *   status: 'colName',  (optional)
   *   parceiro: 'colName', (optional — cliente or fornecedor)
   * }
   */
  return rows.map((row, i) => ({
    _importIndex: i,
    data:      mapping.data      ? (row[mapping.data]      || '') : '',
    descricao: mapping.descricao ? (row[mapping.descricao] || '') : '',
    valor:     mapping.valor     ? parseCurrency(row[mapping.valor]) : 0,
    status:    mapping.status    ? (row[mapping.status]    || '') : 'Pendente',
    parceiro:  mapping.parceiro  ? (row[mapping.parceiro]  || '') : '',
    _raw: row,
  }));
}
