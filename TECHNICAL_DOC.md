# GRUPO SOMBRA Finance Hub — Technical Documentation (AS IS)

> Ultimo aggiornamento: **2026-04-18**
> Versione app: **0.4.0**
> URL locale: `http://localhost:5180/` (o 5181 se la porta è occupata)

---

## Changelog Architettura

| Data | Tipo | Descrizione |
|------|------|-------------|
| 2026-03-22 | ADD | Bootstrap completo: Hub, Receitas, Despesas, Import wizard, Configuração |
| 2026-03-22 | ADD | Sessione 2: NFs Emitidas, Reg. Reservas, Contas a Pagar, Bookings, Documentos + auto-match PDF, sidebar macro-gruppi |
| 2026-03-22 | ADD | Sessione 3: EmpresaOverviewPage, GroupPages Receitas/Despesas, Modulo Conciliação, PT-BR audit |
| 2026-03-26 | MODIFY| Sessione 4: Centralizzazione `modulosConfig.js` per routing dinamico modules-by-empresa. Parallel DB bulk-inserts. |
| 2026-03-26 | MODIFY| Sessione 5: Reconciliação N:M (Cart UI), Global Breadcrumbs, Spotlight Search (Ctrl+K) |
| 2026-03-26 | ADD   | Sessione 6: `AuditoriaSectorialPage` integrata in Receitas/Despesas (manual doc attach & check) |
| 2026-03-26 | ADD   | Sessione 7: Esecuzione Workflow `@/audit` e generazione `AUDIT_REPORT.md` |
| 2026-04-17 | ADD   | Sessione 8: `SombraScanner.html` standalone — Zero-Sync OCR bypass, GDrive API save, manual metadata encoding |
| 2026-04-18 | MODIFY| Sessione 9: SombraScanner v2 — zoom PDF fix, NF field, deduplication, custom fornecedores, wide layout, Empresa persistence |
| 2026-04-18 | MODIFY| Sessione 10: Export Arquivo Contábil (HYPERLINK) e validazione umane loop-in. |
| 2026-04-18 | ADD   | Sessione 11: Modulo Triagem Entradas; oscuramento modulo A Receber |
| 2026-09-09 | ADD | Release v3.0: SOMBRA ENXOVAL PRO (Gestão & Auditoria de Enxoval), Manuale 6 Capitoli PDF, Deploy Vercel |

---

## 1. Overview & Obiettivi

App web localhost per il settore finanziario del **Grupo Sombra** (gruppo alberghiero).
Gestisce Receitas (A/R) e Despesas (A/P) per più società in modo isolato,
con import di file Excel, OFX e PDF. Modulo Dokumentos per abbinamento PDF ↔ movimento bancario.

**Filosofia:** Zero backend — tutto in IndexedDB locale. Backup ZIP automatico.

---

## 2. Stack Tecnologico

| Layer | Tecnologia | Versione |
|---|---|---|
| Framework | Vite + React | Vite 6.4, React 18.3 |
| Routing | React Router | v6.28 |
| State | React Context + useState/useCallback | — |
| Storage | IndexedDB nativo (browser API) | — |
| Parse Excel | xlsx.js | 0.18.5 |
| PDF/Report | jsPDF + jsPDF-autotable | 2.5.2 / 3.8.4 |
| PDF Extract | pdfjs-dist | 4.x |
| UUID | uuid | 11.x |
| Font | Inter + JetBrains Mono (Google Fonts) | — |
| Styling | Vanilla CSS (CSS Variables) | — |

---

## 3. Empresas Configurate

| ID | Nome | Colore |
|----|------|--------|
| `empresa_001` | ARCO-IRIS | configurable |
| `empresa_002` | SAF HOSPEDAGEM | configurable |
| `empresa_003` | GOYANNA | configurable |

> Le empresas sono gestibili dinamicamente da UI: Configurações → Aggiungere/Modificare/Eliminare.

---

## 4. Architettura File

```
GRUPO_SOMBRA/
├── src/
│   ├── App.jsx                        # Root: BrowserRouter + Providers + Layout + Routes
│   ├── main.jsx
│   ├── styles/
│   │   └── global.css                 # Design system (CSS Variables, dark theme)
│   ├── context/
│   │   ├── EmpresaContext.jsx         # Empresa list + selezione + CRUD
│   │   └── ToastContext.jsx
│   ├── hooks/
│   │   ├── useContas.js               # CRUD Receitas/Despesas + KPIs
│   │   ├── useNfsEmitidas.js          # CRUD NFs Emitidas
│   │   ├── useRegistroReservas.js     # CRUD Reg. Reservas
│   │   ├── useContasPagar.js          # CRUD Contas a Pagar OMIE
│   │   ├── useBookings.js             # CRUD Bookings
│   │   ├── useDocumentos.js           # CRUD abbinamenti PDF ↔ movimento
│   │   ├── useConciliacao.js          # CRUD coppie conciliate
│   │   └── useAutoBackup.js           # Auto-backup localStorage ogni 5 min
│   ├── services/
│   │   ├── folderService.js           # File System Access API (browse Drive locale)
│   │   └── pdfMatchingService.js      # pdfjs-dist estrazione + scoring match
│   ├── pages/
│   │   ├── HubPage.jsx                # Landing page con lista aziende
│   │   ├── EmpresaOverviewPage.jsx    # Dashboard azienda (KPIs)
│   │   ├── AuditoriaSectorialPage.jsx # Master Table per operatività settoriale
│   │   ├── ReceitasGroupPage.jsx      # Overview gruppo RECEITAS: 5 card
│   │   ├── DespesasGroupPage.jsx      # Overview gruppo DESPESAS: 3 card
│   │   ├── ReceitasPage.jsx           # Contas a Receber (A Receber — Oculto)
│   │   ├── EntradasPage.jsx           # Triagem de Entradas (Créditos)
│   │   ├── DespesasPage.jsx           # Contas a Pagar (Saidas)
│   │   ├── NfsEmitidasPage.jsx        # NFs Emitidas OMIE
│   │   ├── RegistroReservasPage.jsx   # Registro Reservas HITs
│   │   ├── ContasPagarPage.jsx        # Contas a Pagar OMIE
│   │   ├── BookingsPage.jsx           # Bookings (Booking.com)
│   │   ├── EstratiPage.jsx            # Estratti Conto (OFX/Excel)
│   │   ├── DocumentosPage.jsx         # Gestione PDF + Auto-Match
│   │   ├── ConciliacaoPage.jsx        # Panel Conciliação condiviso
│   │   ├── ConciliacaoReceitas.jsx    # Wrapper Conciliação RECEITAS
│   │   ├── ConciliacaoDespesas.jsx    # Wrapper Conciliação DESPESAS
│   │   └── ConfiguracaoPage.jsx       # Settings: empresas + backup
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx/css        # Sidebar: gruppi collassabili + header navigabile
│   │   │   ├── TopBar.jsx/css         # Breadcrumbs e Header
│   │   │   └── SpotlightSearch.jsx/css# Command Palette (Ctrl+K)
│   │   ├── shared/
│   │   │   ├── KPICard.jsx
│   │   │   ├── ContaModal.jsx
│   │   │   ├── ImportModal.jsx
│   │   │   └── EmpresaModal.jsx
│   │   └── documentos/
│   │       └── AbbinamentoModal.jsx   # Modal vincolo PDF ↔ movimento
│   └── utils/
│       ├── db.js                      # IndexedDB wrapper nativo
│       ├── dateUtils.js               # Date safe (UTC-3 fix)
│       ├── formatters.js              # BRL currency formatter
│       └── parser.js                  # CSV/Excel/OFX parser
├── SombraScanner.html                 ★ STANDALONE — Portale ingestione remota documenti
├── _backups/
│   ├── codice/                        # ZIP backup automatici START_APP.bat
│   └── SombraScanner_YYYY-MM-DD.html  # Backup puntuali del scanner
├── .agent/workflows/
│   ├── devlog.md
│   ├── technical_doc_update.md
│   ├── backup.md
│   └── architecture_review.md
├── DEVLOG.md
├── TECHNICAL_DOC.md
├── ARCHITECTURE.md
├── START_APP.bat                      # Avvio rapido + backup automatico
├── package.json
└── vite.config.js
```

---

## 5. Moduli Funzionali

### 5.1 Hub — Selettore Empresa (`/`)
- Card per ogni empresa con 4 bottoni modulo in griglia 2×2: RECEITAS, DESPESAS, Estratti, Documentos
- Navigazione: Hub → EmpresaOverviewPage → GroupPage → ModulePage

### 5.2 EmpresaOverviewPage (`/empresa/:id`)
- 4 card: RECEITAS, DESPESAS, Estratti Conto, Documentos
- Navigazione diretta da click empresa in sidebar

### 5.3 RECEITAS Group (`/empresa/:id/receitas`)
- Overview con 5 card sub-moduli

| Route | Modulo | Descrizione |
|---|---|---|
| `/receitas` | ReceitasGroupPage | Overview gruppo |
| `/conciliacao-receitas` | ConciliacaoReceitas | Riconciliazione Receitas |
| `/entradas` | EntradasPage | Triagem Bancária de Entradas |
| `/a-receber` | ReceitasPage | Contas a Receber (Oculto) |
| `/nfs-emitidas` | NfsEmitidasPage | NFs Emitidas OMIE |
| `/registro-reservas` | RegistroReservasPage | Arcoiris HITs |
| `/bookings` | BookingsPage | Booking.com |

### 5.4 DESPESAS Group (`/empresa/:id/despesas`)
- Overview con 3 card sub-moduli

| Route | Modulo | Descrizione |
|---|---|---|
| `/despesas` | DespesasGroupPage | Overview gruppo |
| `/conciliacao-despesas` | ConciliacaoDespesas | Riconciliazione Despesas |
| `/saidas` | DespesasPage | Contas a Pagar (Saidas) |
| `/contas-pagar` | ContasPagarPage | Contas a Pagar OMIE |

### 5.5 Estratti Conto (`/empresa/:id/estratti`)
- Multi-banca: tab per conto corrente
- Import OFX / Excel (auto-detect)
- Filtri data (da… a…), export Excel/PDF
- KPIs: Total Entradas, Total Saidas, Saldo

### 5.6 Documentos (`/empresa/:id/documentos`)
| Feature | Dettaglio |
|---|---|
| Tab Documentos | Lista abbinamenti PDF ↔ movimento salvati |
| Tab Pendentes | Movimenti débito senza documento |
| Tab Pasta Drive + Auto-Match | File System Access API → legge cartella Drive locale |
| PDF Extraction | `pdfjs-dist` estrazione testo client-side |
| Scoring Match | valor ±0,02 (+60) · data ±7gg (+30) · keyword (+10) · filename rule (+20) |
| Threshold | ≥70 pts → match forte · 40-70 pts → possibile · <40 → nessun match |
| Vincular | 1 PDF → 1 movimento · reference auto `DOC-YYYY-NNN` |
| Status | Documentado · Dispensado |
| Export | Excel + PDF |

### 5.7 Conciliação
| Feature | Dettaglio |
| --- | --- |
| Selezione | Due dropdown: Módulo A e Módulo B |
| Matching | Valor esatto ±R$0,02 (Auto 1:1) o combinazioni multiple (N:M) via Carrinho |
| Persistenza | Coppie e lotti salvati in IndexedDB `sombra_{id}_conciliacao` |
| Sezioni | Conciliados · Sugestões · Só em A · Só em B |
| Azioni | Confirmar singular · Confirmar todos · Desvincular |
| Export | Excel dei conciliados |

### 5.8 SombraScanner (`SombraScanner.html`) ★ Standalone

Webapp HTML/JS/CSS zero-dipendenze per operatori remoti (chi fa scansioni fisiche). Totalmente autonoma dall'app principale — comunicazione tramite filename encoding.

| Feature | Dettaglio |
|---|---|
| **Formato filename** | `SCAN_YYYY-MM-DD_VALOR_[NF{num}]_FORNITORE_EMPRESA_ID.ext` |
| **Campi** | Data (default oggi), Valor (R$), Nº Nota Fiscal (opt.), Fornecedor, Empresa do Grupo |
| **Persistenza campi** | Solo Empresa persiste tra doc; Data/Valor/NF/Fornitore resettati al nuovo file |
| **Anteprima** | PDF (iframe Chrome viewer) + Immagini (CSS zoom) con toolbar ➖/➕/🔄/⛶ |
| **Zoom PDF** | `about:blank` → `#zoom=NNN` trick per forzare ricarico iframe |
| **Salvataggio GDrive** | File System Access API (`showDirectoryPicker`) — Chrome/Edge only |
| **Salvataggio Fallback** | `<a download>` classico per qualsiasi browser |
| **Cartella persistente** | Handle salvato in IndexedDB (`sombra-scanner-v1`) — sopravvive al ricaricamento |
| **Anti-duplicati** | Firma `SCAN_DATA_VALOR_NF_FORNITORE_EMPRESA` — scansione cartella (GDrive) o sessionStorage (Download) |
| **Fornecedores** | Lista base 984 fornitori + custom appresi da `localStorage` (`sombra-scanner-fornecedores`) |
| **Zero-Sync** | `DocumentosPage` e `pdfMatchingService.js` riconoscono prefisso `SCAN_` e bypassano OCR |
| **Compatibilità** | Chrome/Edge (tutte funzioni) · Firefox (solo Download, no cartella, no zoom param) |

---


### 6.1 Schema IndexedDB per Empresa

| Database | Object Store | Contenuto |
|---|---|---|
| `sombra_global` | `data` | Lista empresas config |
| `sombra_{id}_receitas` | `data` | Contas a receber |
| `sombra_{id}_despesas` | `data` | Contas a pagar (Saidas) |
| `sombra_{id}_nfs_emitidas` | `data` | NFs Emitidas |
| `sombra_{id}_registro_reservas` | `data` | Registro Reservas |
| `sombra_{id}_contas_pagar` | `data` | Contas a Pagar OMIE |
| `sombra_{id}_bookings` | `data` | Bookings |
| `sombra_{id}_extratos` | `data` | Estratti Conto (movimenti) |
| `sombra_{id}_contas_bancarias` | `data` | Config conti bancari |
| `sombra_{id}_documentos` | `data` | Abbinamenti PDF ↔ movimento |
| `sombra_{id}_conciliacao` | `data` | Coppie conciliate A↔B |
| `sombra-scanner-v1` _(IDB standalone)_ | `folderHandle` | Handle cartella GDrive persistente (SombraScanner) |

**localStorage (SombraScanner standalone):**
| Chiave | Contenuto |
|---|---|
| `sombra-scanner-fornecedores` | Array JSON dei fornitori custom aggiunti dall'utente |
| `sombra-scanner-sigs` _(sessionStorage)_ | Array firme file già scaricati nella sessione corrente |

### 6.2 Strategia di Backup
- **Automatico:** `START_APP.bat` genera `_backups/codice/YYYY-MM-DD_HH-mm.zip` (src + config)
- **Manuale:** `Configurações → Exportar Backup JSON` → `sombra_backup_YYYY-MM-DD.json`
- **Restore:** `Configurações → Restaurar Backup` (sovrascrive tutto)

---

## 7. Pattern & Decisioni Architetturali

| Decisione | Motivazione |
|---|---|
| IndexedDB nativo (no idb-keyval) | Compatibilità ESM con Vite 6 senza dipendenze esterne |
| Import xlsx statico | Evitare errore 504 "Outdated Optimize Dep" Vite pre-bundler |
| `fmtDate` da `dateUtils.js` | Evita UTC-3 offset trap (ISO date → local midnight) |
| Namespace DB separato per modulo | Isolamento totale — facile backup e migrate per modulo |
| File System Access API (Drive locale) | Nessun backend, accesso cartella in sola lettura permesso dal browser |
| pdfjs-dist client-side | PDF text extraction senza server |
| Conciliação matching greedy (valor) | Semplice e veloce — regole specifiche da definire per ogni coppia |
| Route flat no nesting | /conciliacao-receitas anziché /receitas/conciliacao — compatibile con React Router v6 senza Outlet |
| Sidebar: label naviga + chevron toggle | UX split: apertura gruppo ≠ apertura sotto-menu |
| SombraScanner: filename encoding (Zero-Sync) | Comunicazione asincrona operatore→app senza API cloud. Il filename è il messaggio. |
| SombraScanner: `about:blank` PDF zoom | Chrome ignora hash-only change su iframe. Passaggio per blank forza reload. |
| SombraScanner: localStorage fornitori custom | Zero-config persistence per lista fornitori appresi — no backend necessario. |
| SombraScanner: firma senza ID (dedup) | `SCAN_DATA_VALOR_[NF]_FORN_EMPRESA` — stessa semantica = duplicato, indipendente dal suffisso random. |

---

## 8. Dipendenze (package.json summary)

```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.28.0",
  "xlsx": "^0.18.5",
  "jspdf": "^2.5.2",
  "jspdf-autotable": "^3.8.4",
  "pdfjs-dist": "^4.x",
  "uuid": "^11.0.5",
  "@vitejs/plugin-react": "^4.3.4",
  "vite": "^6.0.7"
}
```

---

## 9. Come avviare l'app localmente

```powershell
# Avvio rapido (con backup automatico):
c:\Users\ft\Desktop\WorkSpace_AntiGravity\GRUPO_SOMBRA\START_APP.bat

# Manuale:
cd c:\Users\ft\Desktop\WorkSpace_AntiGravity\GRUPO_SOMBRA
npm run dev
# → App su http://localhost:5180/
```

> **Nota:** Se l'app mostra schermata bianca dopo update dipendenze, cancellare `node_modules/.vite` e riavviare con `npx vite --force`.

> **Browser:** Usare Chromium (Chrome/Edge) per il modulo Documentos — File System Access API non supportata da Firefox.


---

## 10. Modulo Dedicato: SOMBRA ENXOVAL PRO (`Controle_Enxoval.html` / `index.html`)

> **Documento Master:** Per la documentazione completa e approfondita di questo modulo fare riferimento a [`SOMBRA_ENXOVAL_BIBLE.md`](./SOMBRA_ENXOVAL_BIBLE.md).

- **Scopo:** Gestione completa delle scorte di biancheria (*enxoval hôtelier*), monitoraggio Par Stock (Meta 3 Mudas), riconciliazione fisica tramite importazione Excel e reportistica PDF.
- **Ambienti:** `Hotel & Resort` (4.493 pezzi, 29 locali) e `Floresta & SPA` (814 pezzi, 8 locali).
- **Hosting di Produzione:** Vercel Edge Global Static — [`https://grupo-sombra-enxoval.vercel.app`](https://grupo-sombra-enxoval.vercel.app).
- **Manuale Integrato:** Visualizzatore modale in 6 capitoli (PT-BR) con motore vettoriale di esportazione PDF A4.
