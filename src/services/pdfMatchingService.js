/**
 * pdfMatchingService.js — PDF text extraction + movement matching
 *
 * Uses pdfjs-dist to extract text from PDF files client-side.
 * Applies a scoring algorithm to match each PDF to a bank movement.
 *
 * Score breakdown:
 *   +60  — amount match (±0.02 tolerance)
 *   +30  — date match (within ±7 days)
 *   +10  — company/description text overlap
 *   ─────────────────────────────────────
 *   ≥ 70 → STRONG match (auto-link candidate)
 *   40–70 → POSSIBLE match (user confirmação needed)
 *   < 40  → NO MATCH
 *
 * Additionally supports filename rules:
 *   If the caller passes `filenameRules` (e.g. regex patterns or keywords),
 *   these are applied to the filename BEFORE text extraction for a quick
 *   pre-filter hint (+20 bonus points if filename hint matches).
 */

import * as pdfjsLib from 'pdfjs-dist';

// ── Worker setup (required by pdfjs-dist) ────────────────────────────────────
// Use the bundled worker via URL import (Vite-compatible)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

// ── Constants ─────────────────────────────────────────────────────────────────
export const SCORE_STRONG   = 70;
export const SCORE_POSSIBLE = 40;

// ── Text extraction ───────────────────────────────────────────────────────────

/**
 * Extract all text from a PDF File object.
 * @param {File} file
 * @returns {Promise<string>} full text content (all pages joined)
 */
export async function extractTextFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join('\n');
}

/**
 * Extract full metadata (amounts, dates, keywords) from a PDF File.
 * Convenience wrapper used during file upload.
 * @param {File} file 
 * @returns {Promise<{amounts: number[], dates: string[], keywords: string[], textPreview: string}>}
 */
export async function extractMetadataFromPDF(file) {
  if (/^scan_/i.test(file.name)) {
    // Format: SCAN_YYYY-MM-DD_VALOR_[NF{num}_]FORNITORE_EMPRESA_ID.ext
    const parts = file.name.replace(/\.[^/.]+$/, '').split('_');
    if (parts.length >= 4) {
      const d        = parts[1];
      const rawValor = parts[2].replace(',', '.');
      const a        = parseFloat(rawValor);

      // Detect optional NF field at parts[3]
      let fornIdx = 3;
      if (/^NF\d+$/i.test(parts[3])) fornIdx = 4;

      const slugParts = parts.slice(fornIdx, parts.length - 2);
      const slg = slugParts.join(' ').replace(/-/g, ' ');

      return {
        amounts:     !isNaN(a) && a > 0 ? [a] : [],
        dates:       [d],
        keywords:    [slg.toLowerCase(), 'scanner humano'],
        textPreview: 'METADATI CERTIFICATI (SombraScanner)'
      };
    }
  }

  const text = await extractTextFromFile(file);
  return {
    amounts: extractAmounts(text),
    dates: extractDates(text),
    keywords: extractKeywords(text).slice(0, 20),
    textPreview: text.slice(0, 300)
  };
}

// ── Data extraction from text ─────────────────────────────────────────────────

/**
 * Extract all BRL amounts from PDF text.
 * Handles: "R$ 1.260,00" | "1.260,00" | "1260.00" | "R$1260,00"
 * @returns {number[]}
 */
export function extractAmounts(text) {
  const amounts = new Set();

  // Pattern: R$ X.XXX,XX or R$X.XXX,XX
  const brlPattern = /R\$\s*[\d.,]+/g;
  for (const match of text.matchAll(brlPattern)) {
    const clean = match[0].replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(clean);
    if (!isNaN(n) && n > 0) amounts.add(Math.round(n * 100) / 100);
  }

  // Pattern: plain "1.260,00" or "1260,00" (comma decimal, dot thousands)
  const ptBRPattern = /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g;
  for (const match of text.matchAll(ptBRPattern)) {
    const n = parseFloat(match[0].replace(/\./g, '').replace(',', '.'));
    if (!isNaN(n) && n > 0) amounts.add(Math.round(n * 100) / 100);
  }

  return [...amounts];
}

/**
 * Extract dates from PDF text, returns ISO strings.
 * Handles: "22/03/2026" | "22-03-2026" | "22.03.2026"
 * @returns {string[]} ISO date strings "YYYY-MM-DD"
 */
export function extractDates(text) {
  const dates = new Set();
  const pattern = /\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/g;
  for (const match of text.matchAll(pattern)) {
    const [, day, month, year] = match;
    if (Number(month) >= 1 && Number(month) <= 12) {
      dates.add(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    }
  }
  return [...dates];
}

/**
 * Extract significant words from PDF text for description matching.
 * Filters out common stopwords and short words.
 * @returns {string[]}
 */
export function extractKeywords(text) {
  const STOPWORDS = new Set(['de','da','do','dos','das','a','o','e','em','para','com','por','que',
    'no','na','se','são','ao','os','as','um','uma','nos','nas','isso','este','esta','mais','não']);
  return text.toLowerCase()
    .replace(/[^a-záéíóúàâêôãõç\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Calculate match score between PDF data and a bank movement.
 *
 * @param {{ amounts: number[], dates: string[], keywords: string[], filename: string }} pdfData
 * @param {{ data: string, valor: number, descricao: string, historico: string }} movement
 * @param {string[]} filenameRules — optional filename keyword hints (e.g. ['CNPJ', 'NF-'])
 * @returns {{ score: number, reasons: string[] }}
 */
export function scoreMatch(pdfData, movement, filenameRules = []) {
  let score   = 0;
  const reasons = [];

  const movValor = Math.abs(Number(movement.valor) || 0);
  const movData  = movement.data || '';
  const movDesc  = ((movement.descricao || '') + ' ' + (movement.historico || '')).toLowerCase();

  // ── Amount match (+60) ────────────────────────────────────────────────────
  const amountMatch = pdfData.amounts.some(a => Math.abs(a - movValor) <= 0.02);
  if (amountMatch) {
    score += 60;
    reasons.push(`Valor coincide (${movValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`);
  }

  // ── Date match (+30) ──────────────────────────────────────────────────────
  if (movData) {
    const movDateMs  = new Date(movData + 'T12:00:00').getTime();
    const dateMatch  = pdfData.dates.some(d => {
      const pdfDateMs = new Date(d + 'T12:00:00').getTime();
      return Math.abs(pdfDateMs - movDateMs) <= 7 * 24 * 3600 * 1000;
    });
    if (dateMatch) {
      score += 30;
      reasons.push(`Data próxima (±7 dias de ${movData})`);
    }
  }

  // ── Keyword/description match (+10) ───────────────────────────────────────
  if (pdfData.keywords.length > 0 && movDesc) {
    const kwMatch = pdfData.keywords.some(kw => movDesc.includes(kw));
    if (kwMatch) {
      score += 10;
      reasons.push('Palavras-chave coincidem na descrição');
    }
  }

  // ── Filename rule bonus (+20) ─────────────────────────────────────────────
  if (filenameRules.length > 0) {
    const fn = pdfData.filename.toLowerCase();
    const ruleMatch = filenameRules.some(rule => fn.includes(rule.toLowerCase()));
    if (ruleMatch) {
      score += 20;
      reasons.push(`Nome arquivo correspondente às regras (${filenameRules.join(', ')})`);
    }
  }

  return { score, reasons };
}

// ── Main matching function ────────────────────────────────────────────────────

/**
 * @typedef {Object} MatchResult
 * @property {Object} pdfInfo — { name, size, handle, text?, amounts, dates }
 * @property {Object|null} bestMatch — the movement with highest score
 * @property {number} bestScore
 * @property {string[]} bestReasons
 * @property {'strong'|'possible'|'none'} confidence
 * @property {{ movement: Object, score: number }[]} allCandidates — top 3 alternatives
 */

/**
 * Match a list of PDF files against a list of bank movements.
 * Extracts text from each PDF (async), scores against all movements.
 *
 * @param {Array<{name, size, handle}>} pdfFiles — from folderService.listPDFs()
 * @param {Array} movements — all extratos (débito)
 * @param {string[]} filenameRules — optional filename patterns
 * @param {function(number, number)} onProgress — progress callback (current, total)
 * @returns {Promise<MatchResult[]>}
 */
export async function matchPDFsToMovements(pdfFiles, movements, filenameRules = [], onProgress = null) {
  const results = [];

  for (let i = 0; i < pdfFiles.length; i++) {
    const pdfInfo = pdfFiles[i];
    if (onProgress) onProgress(i + 1, pdfFiles.length);

    let text = '';
    let amounts = [];
    let dates   = [];
    let keywords = [];

    try {
      const file = await pdfInfo.handle.getFile();
      
      if (file.name.startsWith('SCAN_')) {
        // Format: SCAN_YYYY-MM-DD_VALOR_[NF{num}_]FORNITORE_EMPRESA_ID.ext
        const parts = file.name.replace(/\.[^/.]+$/, '').split('_');
        // parts[0] = 'SCAN', parts[1] = date, parts[2] = valor, parts[3...] = [NF?] forn empresa id
        if (parts.length >= 4) {
          const d = parts[1]; // date: YYYY-MM-DD

          // Valor: try parts[2] — handle both '887' and '53297.07' (dot decimal from JS)
          const rawValor = parts[2].replace(',', '.');
          const a = parseFloat(rawValor);

          // Detect optional NF field at parts[3] (starts with 'NF' followed by digits)
          let fornIdx = 3;
          if (/^NF\d+$/i.test(parts[3])) fornIdx = 4;

          // Supplier slug: join remaining parts until second-to-last-2 (skip empresa + id)
          const slugParts = parts.slice(fornIdx, parts.length - 2);
          const slg = slugParts.join(' ').replace(/-/g, ' ');

          if (!isNaN(a) && a > 0) amounts = [a];
          dates    = [d];
          keywords = [slg.toLowerCase(), 'scanner humano'];

          console.debug(`[SCAN] file=${file.name} → data=${d}, valor=${a}, forn="${slg}"`);
        }
      } else {
        text     = await extractTextFromFile(file);
        amounts  = extractAmounts(text);
        dates    = extractDates(text);
        keywords = extractKeywords(text).slice(0, 20); // limit for perf
      }
    } catch (err) {
      console.warn(`[pdfMatching] Failed to extract from ${pdfInfo.name}:`, err);
    }

    const pdfData = { amounts, dates, keywords, filename: pdfInfo.name };

    // Score against all movements
    const scored = movements
      .map(mov => {
        const { score, reasons } = scoreMatch(pdfData, mov, filenameRules);
        return { movement: mov, score, reasons };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = scored[0] || null;
    const confidence =
      !best                        ? 'none'     :
      best.score >= SCORE_STRONG   ? 'strong'   :
      best.score >= SCORE_POSSIBLE ? 'possible' : 'none';

    results.push({
      pdfInfo:        { ...pdfInfo, textPreview: text.slice(0, 300) },
      bestMatch:      best?.movement  ?? null,
      bestScore:      best?.score     ?? 0,
      bestReasons:    best?.reasons   ?? [],
      confidence,
      allCandidates:  scored.slice(0, 3),
    });
  }

  return results;
}
