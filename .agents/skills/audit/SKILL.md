---
name: audit
description: Audit approfondito qualità app — GRUPO SOMBRA Finance Hub
---

# Workflow: Audit Qualità App

Eseguire periodicamente (ogni sessione di sviluppo significativa o prima di una release).
Produce un report `AUDIT_REPORT.md` nella root del progetto.

---

## Checklist Audit

### 1. BUILD CHECK
Verifica che l'app compili senza errori.

```powershell
cd c:\Users\ft\Desktop\WorkSpace_AntiGravity\GRUPO_SOMBRA
npm run build 2>&1
```

✅ Atteso: 0 errori, eventuali warning documentati.

---

### 2. ROUTE INTEGRITY
Verifica che ogni route in `App.jsx` abbia un componente importato e che il file esista.

```powershell
# Estrai tutte le route
Select-String -Path src\App.jsx -Pattern "path=" | Select-String -Pattern "element"
# Estrai tutti gli import di pagine
Select-String -Path src\App.jsx -Pattern "^import" | Select-String "pages"
```

✅ Atteso: ogni `element={<X />}` ha un import corrispondente e il file `src/pages/X.jsx` esiste.

---

### 3. DB MODULE CONSISTENCY
Verifica che ogni DB_MODULE in `db.js` sia usato in almeno un hook.

```powershell
# Lista moduli definiti
Select-String -Path src\utils\db.js -Pattern "'^  \w+:'"
# Verifica utilizzo nei hook
Get-ChildItem src\hooks -Filter "*.js" | ForEach-Object { Select-String -Path $_.FullName -Pattern "DB_MODULES\." }
```

✅ Atteso: tutti i moduli usati almeno una volta.

---

### 4. PT-BR TEXT AUDIT
Verifica assenza di testo italiano/inglese nelle pagine utente.

```powershell
# Parole italiane comuni nei JSX
$patterns = @("Abbinare","Abbinamento","Documenti","Pendenti","Conferma","Rifiutato","Analizza","Seleziona","Cercar","Nessun","Movimento abbinato","Forti","Azione","Motivi")
foreach ($p in $patterns) {
  $res = Get-ChildItem src\pages,src\components -Filter "*.jsx" -Recurse | Select-String -Pattern $p
  if ($res) { Write-Host "❌ TROVATO: $p"; $res | ForEach-Object { Write-Host "  $_" } }
  else { Write-Host "✅ OK: $p" }
}
```

✅ Atteso: nessun match.

---

### 5. CONSOLE.LOG AUDIT
Verifica presenza di console.log/warn/error nei file sorgente (da rimuovere in produzione).

```powershell
$logs = Get-ChildItem src -Filter "*.jsx","*.js" -Recurse |
  Select-String -Pattern "console\.(log|warn|error)\(" |
  Where-Object { $_.Line -notmatch "//.*console" }
$logs | ForEach-Object { Write-Host "$($_.Filename):$($_.LineNumber) → $($_.Line.Trim())" }
Write-Host "Totale: $($logs.Count)"
```

⚠️ Tollerato: console.warn nei service layer. Eliminare console.log nelle pagine.

---

### 6. TODO / FIXME AUDIT
Lista di tutti i TODO e FIXME nel codice sorgente.

```powershell
Get-ChildItem src -Filter "*.jsx","*.js","*.css" -Recurse |
  Select-String -Pattern "TODO|FIXME|HACK|XXX" |
  ForEach-Object { Write-Host "$($_.Filename):$($_.LineNumber) → $($_.Line.Trim())" }
```

---

### 7. CSS ORPHANS
Verifica che ogni file .jsx abbia il suo .css importato (se esiste) e viceversa.

```powershell
# CSS files senza import corrispondente
Get-ChildItem src\pages -Filter "*.css" | ForEach-Object {
  $css = $_.BaseName
  $jsx = Join-Path $_.Directory "$css.jsx"
  if (-not (Test-Path $jsx)) { Write-Host "⚠️ CSS senza JSX: $($_.Name)" }
}
```

---

### 8. HOOK PATTERN COMPLIANCE
Verifica che tutti i custom hooks rispettino il pattern (try/catch/finally, loading state, refresh).

```powershell
Get-ChildItem src\hooks -Filter "use*.js" | ForEach-Object {
  $content = Get-Content $_.FullName -Raw
  $hasLoading = $content -match "setLoading"
  $hasTryCatch = $content -match "try\s*\{"
  $hasFinally = $content -match "finally\s*\{"
  Write-Host "$($_.Name): loading=$hasLoading try=$hasTryCatch finally=$hasFinally"
}
```

✅ Atteso: tutti i hook hanno loading, try/catch, finally.

---

### 9. MISSING EXPORTS
Verifica che tutti i file hook esportino con `export function` o `export default`.

```powershell
Get-ChildItem src\hooks -Filter "*.js" | ForEach-Object {
  $exp = Select-String -Path $_.FullName -Pattern "^export"
  if (-not $exp) { Write-Host "❌ MISSING EXPORT: $($_.Name)" }
  else { Write-Host "✅ $($_.Name)" }
}
```

---

### 10. BUNDLE SIZE CHECK
Verifica che il bundle dopo build non superi soglie ragionevoli.

```powershell
# Dopo npm run build:
Get-ChildItem dist\assets -Filter "*.js" | Sort-Object Length -Descending |
  Select-Object Name, @{N="KB";E={[math]::Round($_.Length/1KB,0)}} |
  Format-Table -AutoSize
```

⚠️ Soglie: main bundle < 500KB, vendor < 1MB.

---

### 11. DEPENDENCY AUDIT
Verifica vulnerabilità nelle dipendenze.

```powershell
npm audit --audit-level=moderate 2>&1
```

---

### 12. PRODUCE AUDIT REPORT

Al termine, aggiorna `AUDIT_REPORT.md` nella root con:
- Data audit
- Risultati per ogni check (✅ OK / ⚠️ Warning / ❌ Errore)
- Numero issue trovate
- Piano di risoluzione per le issue critiche

---

## Frequenza consigliata

| Trigger | Azione |
|---|---|
| Fine sessione di sviluppo | Check 4 (PT-BR) + Check 5 (console.log) |
| Prima di backup settimanale | Check completo 1-11 |
| Dopo aggiunta nuovo modulo | Check 2 (routes) + Check 3 (DB) + Check 8 (hook pattern) |
