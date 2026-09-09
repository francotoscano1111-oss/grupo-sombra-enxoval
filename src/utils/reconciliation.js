/**
 * reconciliation.js — Motore matematico per l\'incrocio (matching) di due basi dati finanziarie.
 * Implementa tolleranze su Date (Offset giorni) e Valori (Delta percentuale).
 */

export function parseDateSafe(dateStr) {
  if (!dateStr) return 0;
  let f = String(dateStr).trim();
  if (f.includes('/')) {
    const p = f.split('/');
    if (p[0].length === 2 && p[2].length === 4) f = `${p[2]}-${p[1]}-${p[0]}`;
  }
  // Force noon UTC to prevent timezone shifts
  const d = new Date(f + 'T12:00:00Z');
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function checkDateProximity(dateA, dateB, maxDaysOffset) {
  const tA = parseDateSafe(dateA);
  const tB = parseDateSafe(dateB);
  if (!tA || !tB) return false;
  
  const diffDays = Math.abs(tA - tB) / (1000 * 60 * 60 * 24);
  return diffDays <= maxDaysOffset;
}

export function checkValueTolerance(valA, valB, maxPercentDiff) {
  const a = Math.abs(Number(valA) || 0);
  const b = Math.abs(Number(valB) || 0);
  
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return false;

  const maxV = Math.max(a, b);
  const diff = Math.abs(a - b);
  const percentDiff = (diff / maxV) * 100;
  
  return percentDiff <= maxPercentDiff;
}

export function extractField(item, key) {
  if (!key || !item) return null;
  if (item[key] !== undefined) return item[key];
  if (item.original && item.original[key] !== undefined) return item.original[key];
  return null;
}

/**
 * Esegue il matching massivo tra due origini dati (A = Riferimento, B = Target).
 */
export function runReconciliation(sourceA, sourceB, rules) {
  const { 
    dateTolerance = 0, 
    valueTolerance = 0,
    mapA = { dateKey: 'data', valueKey: 'valor' },
    mapB = { dateKey: 'data', valueKey: 'valor' }
  } = rules;
  
  const auto = [];
  const suggested = [];
  const orphansA = [];
  const orphansB = [];

  const usedB = new Set();
  const candidatesMap = new Map();

  // Pass 1: Identifica tutti i possibili candidati in B per ogni record in A
  sourceA.forEach(a => {
    let exactMatches = [];
    let fuzzyMatches = [];

    const dateA = extractField(a, mapA.dateKey);
    const valA = extractField(a, mapA.valueKey);

    sourceB.forEach(b => {
      const dateB = extractField(b, mapB.dateKey);
      const valB = extractField(b, mapB.valueKey);

      const isDateValid = checkDateProximity(dateA, dateB, dateTolerance);
      const isValueValid = checkValueTolerance(valA, valB, valueTolerance);

      if (isDateValid && isValueValid) {
        // Verifica se è matematicamente identico
        const isPerfectDate = String(dateA) === String(dateB);
        const isPerfectValue = Math.abs((Number(valA) || 0) - (Number(valB) || 0)) < 0.01;
        
        if (isPerfectDate && isPerfectValue) {
          exactMatches.push(b);
        } else {
          // Pass backward compatibility gap for UI
          b._gap = Math.abs((Number(valA) || 0) - (Number(valB) || 0));
          fuzzyMatches.push(b);
        }
      }
    });
    
    candidatesMap.set(a.id, { a, exactMatches, fuzzyMatches });
  });

  // Pass 2: Assegnazione (Greedy Matching)
  sourceA.forEach(a => {
    const data = candidatesMap.get(a.id);
    
    const availableExact = data.exactMatches.filter(b => !usedB.has(b.id));
    const availableFuzzy = data.fuzzyMatches.filter(b => !usedB.has(b.id));
    const totalAvailable = availableExact.length + availableFuzzy.length;

    if (totalAvailable === 0) {
      orphansA.push(a);
    } 
    else if (totalAvailable === 1 && availableExact.length === 1) {
      // Matching Pefetto 1-a-1
      const b = availableExact[0];
      usedB.add(b.id);
      auto.push({ a, b, confidence: 'exact' });
    }
    else if (totalAvailable === 1 && availableFuzzy.length === 1) {
      // Matching Matematico Fuzzy 1-a-1 (Supera le regole tolleranza!)
      const b = availableFuzzy[0];
      usedB.add(b.id);
      auto.push({ a, b, confidence: 'fuzzy', gap: Math.abs(a.valor - b.valor) });
    }
    else {
      // Ambiguo: Più candidati plausibili. Necessita revisione umana.
      suggested.push({ a, candidates: [...availableExact, ...availableFuzzy] });
    }
  });

  // Pass 3: Raccogli tutti gli elementi di B non toccati
  sourceB.forEach(b => {
    if (!usedB.has(b.id)) {
      // Lo includiamo solo se non è temporaneamente parcheggiato in "suggested"
      const isPendingSuggestion = suggested.some(s => s.candidates.find(c => c.id === b.id));
      if (!isPendingSuggestion) {
        orphansB.push(b);
      }
    }
  });

  return { auto, suggested, orphansA, orphansB };
}
