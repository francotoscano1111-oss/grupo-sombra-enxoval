---
name: devlog
description: Come aggiornare il DEVLOG.md del progetto GRUPO SOMBRA Finance Hub
---

# Workflow: Aggiornamento Devlog

Esegui alla fine di ogni sessione di sviluppo o ogni volta che apporti una modifica significativa al progetto.

## Steps

1. **Apri `DEVLOG.md`** nella root del progetto (`c:\Users\ft\Desktop\WorkSpace_AntiGravity\GRUPO_SOMBRA\DEVLOG.md`)

2. **Aggiungi una nuova entry in cima al file** (ordine cronologico inverso) con il seguente formato:

```markdown
## [YYYY-MM-DD] — [Titolo breve della sessione]

**Status AS IS:** [Breve descrizione dello stato corrente dell'app]

### ✅ Fatto
- [Modifica / funzionalità implementata]
- [Bug risolto]

### 🔧 Decisioni tecniche
- [Decisione architetturale presa e motivazione]

### ⚠️ Problemi aperti / TODO prossima sessione
- [Issue aperta o task successivo]

---
```

3. **Salva il file** e verifica che il formato sia corretto.

4. **Aggiorna `TECHNICAL_DOC.md`** se è stato aggiunto o modificato un modulo significativo (usa il workflow `technical_doc_update.md`).

## Note

- La data deve essere nel formato ISO: `YYYY-MM-DD`
- Non cancellare le entry precedenti, aggiungi sempre in cima
- In caso di sessione di bugfix, usa il titolo `[YYYY-MM-DD] — Bugfix: [descrizione]`
