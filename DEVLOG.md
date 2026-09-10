# DEVLOG — GRUPO SOMBRA Finance Hub

<!-- Ordine cronologico inverso: la voce più recente in cima -->

---

## [2026-09-10] — Sistema di Profili Utente & Controllo Accessi Granulare (RBAC)

**Status AS IS:** SOMBRA ENXOVAL PRO supporta ora la gestione multi-utente con profili differenziati tra operatori dello stock in uso (camareiras/piso) e responsabili generali, con permessi selettivi su Ambienti, Operazioni e Locali.

### ✅ Fatto
- **Selettore Utente nell'Header:** Aggiunto badge dinamico con dropdown rapido per il cambio turno/operatore (`👑 Responsável Geral`, `🧹 Camareira de Piso`, `🌿 Atendente SPA`, `🧺 Lavanderia`).
- **3 Variabili di Configurazione per Utente:**
  - *Ambienti:* Checkbox *Hotel & Resort* / *Floresta & SPA*.
  - *Operazioni:* 6 Checkbox per autorizzare o bloccare acquisti, rifornimenti, lavanderia, scarti e perdite.
  - *Locali:* Selezione per singolo alloggio o rouparia con opzioni *Marcar/Desmarcar Todos*.
- **Modale Amministrativa `UserManagementModal`:** Interfaccia completa per creare, modificare ed eliminare profili con anteprima in tempo reale.
- **Protezione Operazioni:** I bottoni non autorizzati vengono disabilitati con etichetta `🔒 Bloqueado`, i menu a tendina filtrano solo le stanze assegnate e il campo *Responsável* si auto-compila con il nome dell'utente attivo.
- **Persistenza & Backup JSON:** I profili utente vengono salvati in `localStorage` e inclusi nel dump di sicurezza JSON.

---

## [2026-09-10] — Protezione Unità Strutturali & Reatribuição Automatica Saldi alla Cancellazione

**Status AS IS:** Il modulo Unidades & Locais protegge ora le unità strutturali native da eliminazioni accidentali e garantisce l'integrità totale dei dati inventariali tramite trasferimento automatico dei saldi in caso di eliminazione di locali secondari.

### ✅ Fatto
- **Unità Protette (Non Eliminabili):**
  - *Hotel & Resort:* `Resort`, `Hotel`, `Villas`, `Rouparia Principal`, `Almoxarifado Central`
  - *Floresta & SPA:* `Hotel Floresta`, `Yeu SPA`, `Rouparia Principal`, `Almoxarifado Central`
  - Blocco del tasto cestino con badge `Protegido` e icona di lucchetto informativa.
- **Principio di Integrità a Due Livelli:**
  - *Dati Storici (Snapshot passati):* Rimangono immutabili e fedeli ai dati registrati *illo tempore* per validità probatoria e contabile.
  - *Giacenza Operativa Attiva:* I saldi vivi del locale eliminato vengono re-indirizzati istantaneamente su `Hotel` (per unità) o `Rouparia Principal` (per circolazione), azzerando capi orfani e mantenendo le quadrature al 100%.
- **Reatribuição Automatica dei Saldi:**
  - In *Hotel & Resort:* se si elimina una `unidade` (es. *Outros* o nuove stanze), i pezzi vengono trasferiti su **`Hotel`**; se si elimina un punto di `circulacao`, i pezzi vengono trasferiti su **`Rouparia Principal`**.
  - In *Floresta & SPA:* se si elimina una `unidade`, i pezzi vengono trasferiti su **`Hotel Floresta`**; se si elimina un punto di `circulacao`, i pezzi vengono trasferiti su **`Rouparia Principal`**.
- **Dialogo Informativo & Notifica:** L'utente visualizza un avviso che calcola e quantifica in tempo reale il numero esatto di capi da trasferire prima della conferma.

---

## [2026-09-09] — SOMBRA ENXOVAL PRO v3.0: Manuale Utente 6 Capitoli, Deploy Vercel & High-Contrast UI

**Status AS IS:** L'applicazione di gestione e controllo biancheria (SOMBRA ENXOVAL PRO) è ora in produzione su Vercel (https://grupo-sombra-enxoval.vercel.app), completa di manuale utente interattivo a 6 capitoli con esportazione PDF A4, backup di sicurezza in uscita e design system high-contrast.

### ✅ Fatto
- **Deploy Globale su Vercel:** Configurato repository GitHub (`francotoscano1111-oss/grupo-sombra-enxoval`) e deploy automatico edge CDN su Vercel con zero-config static hosting (`index.html`).
- **Manuale Utente 6 Capitoli (PT-BR):** Implementato manuale operativo completo per tutti i 6 moduli dell'applicazione (Matriz de Estoque, Movimentações, Unidades & Locais, Catálogo de Itens, Inventário & Contagem, Relatórios & Backup).
- **Viewer Interattivo & Generatore PDF A4:** Creato visualizzatore modale a schede e funzione vettoriale `handleDownloadManualPDF()` per scaricare il manuale ufficiale con copertina istituzionale e layout a 4 pagine A4.
- **Risoluzione Bug Contrast & React Error #130:** 
  - Risolto conflitto CSS globale nel tema chiaro (`body.light`) che oscurava i testi bianchi nei bottoni viola/indaco e nell'intestazione del manuale.
  - Aggiunte definizioni SVG mancanti (`Home`, `Tags`, `CheckSquare`) all'oggetto `Icons`, azzerando gli errori di rendering React.
- **Pulsante Sair & Backup:** Inserito pulsante rapido di logout con generazione automatica del dump JSON di sicurezza e notifica di ripristino.
- **Bibbia Tecnica e Documentazione:** Redatto il master document `SOMBRA_ENXOVAL_BIBLE.md` come punto fermo architetturale e guida per futuri sviluppi.

### 🔧 Decisioni tecniche
- Utilizzo di classi CSS dedicate (`.btn-manual-user`, `.modal-manual-hdr`) con sovrascritture protette per garantire contrasto e leggibilità del 100% indipendentemente dal tema chiaro/scuro selezionato.
- Adozione del workflow di sincronizzazione automatica `Controle_Enxoval.html` ↔ `index.html` per assicurare perfetta parità tra esecuzione locale ed esecuzione cloud su Vercel.

### ⚠️ Problemi aperti / TODO prossima sessione
- Possibile introduzione di scanner QR Code per le singole porte dei chalés per velocizzare ulteriormente la contagem fisica con smartphone.

---

## [2026-04-22] — Importazione NFs Emitidas: Filtri e Anti-Doppioni

**Status AS IS:** Il modulo NfsEmitidasPage ora importa le Note Fiscali di Servizio (Excel) rigettando all'origine record non idonei. Motore anti-doppioni rafforzato basato sulla combinazione univoca Numero + Data.

### ✅ Fatto
- **Filtro Hard a Monte (Excel):** Solo righe con `Situação Nota === 'Normal'` e `CPF/CNPJ Prestador` coincidente con l'azienda in uso (tramite pulizia mask) vengono memorizzate nel db.
- **Deduplicazione Mista:** Il check `checkDuplicates` esige ora il matching sia del campo `numero` che della `dataEmissao` per identificare una NF come duplicato isolando vecchie emissioni.
- **Colonna UI "Tipo Serviço":** Elevato in tabella il field 'Descrição do Serviço' dell'Excel su colonna dedicata per leggibilità immediata.

### 🔧 Decisioni tecniche
- Implemetato lo scarto silenzioso pre-import: il parsing elimina alla radice la spazzatura per non infettare la preview con rumore cognitivo per l'operatore (es. note canceladas).
- Aggiornata interfaccia duplicati in `ImportNfsModal.jsx` mettendo a confronto orizzontale la fonte `Na Planilha` vs risorsa `Já no Banco`.

### ⚠️ Problemi aperti / TODO prossima sessione
- Eventuali raffinamenti logici sui match per note riemesse con stesso numero.

---

## 2026-04-18 — Sessione 11: Implementazione Triagem "Entradas" & Routing Cleanup

**Status AS IS:** Il gruppo Receitas dispone ora dello stesso potente operatore di Triagem massiva per la coda di riconciliazione (modello *Saídas* replicato per i *Créditos*). Lo spazio in plancia è stato ottimizzato.

### ✅ Fatto
- **Modulo Entradas:** Creato componente `EntradasPage.jsx` per l'estrazione visiva da "Extratos" esclusivamente dei flussi in Entrata (crédito). Dotato di multi-selezione e inoltro in blocco verso "Conciliação".
- **Refactoring Routing:** Scollegato pacificamente il tab "A Receber" dall'url `/entradas` (spostato su `/a-receber`) per far posto al nuovo e prioritario "Entradas" (Triagem).
- **Cleanup Modulos:** Messo sotto traccia (nascosto come commento in `modulosConfig.js`) il blocco di *A Receber* — in standby per rilasci futuri. Identico pattern usato per *Contas a Pagar*.

### 🔧 Decisioni tecniche
- Utilizzo della duplicazione logica del componente `DespesasPage` per accelerare la messa in operatività del medesimo pattern comportamentale lato Receitas, scongiurando regressioni di stabilità del sorgente principale.

### ⚠️ Problemi aperti / TODO prossima sessione
- Rilasci futuri e attivazione logiche specifiche per il tab oscurato "Contas a Receber".

---

## 2026-04-18 — Sessione 10: Ottimizzazione Avanzata Motore Conciliazione (CTP) & Export Contabilità

**Status AS IS:** Il modulo di conciliazione è ora capace di apprendere regole di business affidabili basate su input umano (via Sombra Scanner), fornendo all'utente il controllo autorizzativo sui matching futuri. Finalizzato anche un output formattato e linkato in modo nativo per i sistemi e commercialisti esterni.

### ✅ Fatto
- **Sidebar UX & Layout:** Implementata chiusura condizionale della Sidebar in `App.jsx` e `TopBar.jsx` (tramite stato `collapsed`), consentendo lo smontaggio del componente laterale per massimizzare la larghezza dei layout a griglia nei formati desktop.
- **CTP Learning Engine con Human-in-the-Loop:** Inserito prompt di autorizzazione `window.confirm` in `learnAlias()`, invocato sia sul completamento di link manuali (1-a-1) sia su quelli automatici proposti. L'inquinamento del database con descrizioni bancarie generiche non è più possibile senza l'assentimento dell'utente.
- **Inversione Logica Dati Fornitore:** Essendo assodato che l'operatore tramite Sombra Scanner digiti a mano il nome del fornitore salvandolo nel pacchetto file, la `extractSupplierFromFilename` è passata da "piano B a caso d'emergenza OCR" a "Primary Source Of Truth". Aggiunta regex dedicata per falciare le code automatiche del SombraScan (`_[A-Za-z0-9]{4}`).
- **Export Contabilità Completo:** Aggiunto tasto *📊 Arquivo Contábil* che sprigiona un file combinato via SheetJS. Abbraccia Entrate/Uscite (+ / -), indicando per ogni singola transazione del mese mostrato quale sia lo status di allegato, con relativo file nativo collegato.
- **Hyperlink Nativi Excel:** Sostituite le primitive `xml-link` di SheetJS con i costrutti `=HYPERLINK(..., ...)` al fine unico di permettere a Microsoft Excel l'aperture dei Documenti Raw dai Desktop locali senza crash causati da spaziature dei percorsi in url-mode (`%20`).

### 🔧 Decisioni tecniche
- Utilizzo della formula nativa `=HYPERLINK("file", "file")` di Excel anziché il dict `{ Target }` di `SheetJS` per eludere restrizioni sui charset URI di Excel.
- Aggiunta di script auto-risolutivo in `.agents\workflows\backup.md` per eseguire istantanee rapide e non invasive al database IndexDB + Codice usando uno script batch `robocopy / compress-archive` invisibile.

### ⚠️ Problemi aperti / TODO prossima sessione
- La sincronizzazione tra PC su fornitori locali è al momento confinata nel `localStorage`. Indagare possibili integrazioni `JSON import/export` se il carico operatori si estende a multipli device.

---

## 2026-04-18 — Sessione 9: SombraScanner — Completamento UX & Funzionalità Advanced

**Status AS IS:** Il modulo `SombraScanner.html` è ora una webapp standalone completa e production-ready per l'ingestione remota di documenti. Tutte le funzionalità pianificate sono implementate e validate.

### ✅ Fatto
- **Layout orizzontale wide:** Finestra allargata a max 1280px (da 896px). Il form è ora compatto con griglia 2 colonne per Data + Nº NF, eliminando la necessità di scroll verticale/orizzontale su monitor standard.
- **Campo Número Nota Fiscal:** Aggiunto campo opzionale `doc-nf` tra Valor e Fornecedor. Viene codificato nel filename come `NF{numero}` solo se compilato (retrocompatibile con file precedenti). Viene resettato ad ogni nuovo file.
- **Persistenza campi corretta:** Solo `Empresa do Grupo` rimane persistente tra un documento e l'altro. `Fornecedor`, `Data`, `Valor` e `Nº NF` vengono resettati al caricamento di un nuovo file.
- **Zoom PDF funzionante:** Corretto il bug del zoom non-funzionante sui PDF. Chrome ignora i cambi di hash su iframe già caricato. Soluzione: passaggio per `about:blank` (30ms) prima di impostare il nuovo `#zoom=NNN`, garantendo il ricaricamento del viewer.
- **Toolbar zoom riposizionata:** Spostata sopra la preview (tra header e documento), eliminando il problema di clipping per overflow-hidden in basso.
- **Fornecedores custom persistenti:** Implementato sistema di apprendimento fornitori tramite `localStorage` (`sombra-scanner-fornecedores`). I fornitori inseriti manualmente e non presenti nella lista base vengono salvati e ricompaiono nell'autocomplete nelle sessioni successive, distinguibili con prefisso ⭐.
- **Deduplication anti-duplicati:** Implementato per entrambi i flussi di salvataggio:
  - **GDrive (File System API):** Scansiona la cartella di destinazione cercando file con la stessa firma `SCAN_DATA_VALOR_NF_FORNITORE_EMPRESA` prima di salvare.
  - **Download:** Tiene traccia delle firme già scaricate in `sessionStorage` per la sessione corrente.
- **Backup:** `_backups/SombraScanner_2026-04-18_08-11.html`

### 🔧 Decisioni tecniche
- **Firma duplicato senza ID:** La funzione `getFileSignature()` calcola `SCAN_DATA_VALOR_[NF]_FORNITORE_EMPRESA` (senza il suffisso random a 4 caratteri). Lo stesso documento con lo stesso contenuto ha sempre la stessa firma, anche se il filename finale differisce per l'ID.
- **`about:blank` trick per iframe PDF:** L'unica soluzione affidabile per forzare Chrome a ricaricare un PDF in iframe con un nuovo livello di zoom, senza dover ricreare il blob URL.
- **localStorage per fornitori custom:** Soluzione zero-config, no backend. I fornitori custom sopravvivono ai ricaricamenti della pagina ma sono legati al browser locale. Per sincronizzazione cross-device, si può esportare la lista manualmente in futuro.
- **`cleanForn()` helper:** Rimuove il prefisso `⭐ ` dai fornitori selezionati dalla lista custom prima di costruire il filename, garantendo filename puliti.

### ⚠️ Problemi aperti / TODO prossima sessione
- I fornitori custom nel `localStorage` sono legati al browser locale del PC dell'operatore. Se l'operatore usa SombraScanner su più PC, la lista custom non si sincronizza — valutare export/import manuale della lista se necessario.
- Il parametro `#zoom=` sui PDF funziona solo sul viewer nativo Chrome/Edge. Firefox non supporta né il picker né questa funzionalità.

---



**Status AS IS:** Il modulo Conciliação Despesas è stato ottimizzato per gestire grandi volumi (5000+ movimenti) introducendo la "Selezione Manuale" in Saídas. È stato inoltre creato il modulo "SombraScanner.html" per l'ingestione remota dei documenti fotografici.

### ✅ Fatto
- **Carrello Conciliazione (Saídas):** Rimosso il vecchio "Contas a Pagar". In `DespesasPage`, aggiunto un sistema multi-select per l'estratto conto. I movimenti selezionati vengono "Inviati in coda" aggiornando in bulk il flag `reconciliarDoc` su IndexedDB. Solo questi raggiungono la schermata di Conciliazione.
- **Sombra Scanner Portal:** Creato `SombraScanner.html`, una webapp standalone e offline per l'operatore remoto (o chi fa scansioni). Consente l'inserimento manuale di Data, Importo, e Fornitore. Al salvataggio (diretto in Google Drive tramite API o tramite Download), codifica i metadati direttamente nel nome del file (`SCAN_YYYY-MM-DD_IMPORTO_...`).
- **Zero-Sync OCR Bypass:** Aggiornato sia `DocumentosPage` sia `PdfMatchingService.js` per riconoscere istantaneamente i file immagine e PDF siglati `SCAN_`. Il sistema bypassa l'OCR di pdfjs estraendo direttamente le certezze dal nome del file (risolvendo il problema del matching sulle foto illeggibili).

### 🔧 Decisioni tecniche
- Rimossa la tabella `ContasPagar` da Despesas per unificare e ripulire la UI secondo il nuovo principio di riconciliazione diretta.
- Mantenuto l'approccio robusto "Zero-Sync": codificando i metadati nel nome dei file immagine, si risolvono i limiti di comunicazione asincrona tra operatore remoto e applicativo principale, senza aggiungere né database cloud né configurazioni esoteriche.

### ⚠️ Problemi aperti / TODO prossima sessione
- Eventuali calibrazioni sulle stringhe "Fornitore" formattate come URL slug nell'estrazione dei `SCAN_`.

---

## 2026-04-01 — Cleanup: Rimozione Tab "Reservas" da Reservas & Consumos (HITS)

**Status AS IS:** La pagina `Reservas & Consumos (HITS)` per le aziende con `sistemaFrontend === 'hits'` mostra ora solo i tab **Resumo de Conta** e **Consumos Lançados**, eliminando il tab "Reservas" ridondante. Le aziende non-HITS continuano a vedere il tab Reservas completo.

### ✅ Fatto
- **Rimozione tab Reservas (HITS):** Rimossa la voce `{ id: 'reservas' }` dall'array `tabs` per il ramo HITS in `RegistroReservasPage.jsx`.
- **Default `activeTab` corretto:** Il tab iniziale per le aziende HITS è ora `'resumo'` invece di `'reservas'`.
- **Pulizia codice morto:** Aggiornati commenti JSDoc, sezione state/filtri/handlers annotata come "Non-HITS only", loading guard aggiornato a `!isHits`.
- **Backup:** Creato `RegistroReservasPage.jsx.bak_2026-04-01` prima delle modifiche.

### 🔧 Decisioni tecniche
- Il codice Reservas (stato, filtri, tabella, modals) è stato mantenuto nel file perché è ancora usato dalle aziende non-HITS (SAF, JM SCP, ecc.). Non richiede un componente separato dato che il branch `isHits` lo esclude completamente.
- Il loading guard è ora `if (loading && !isHits)` per evitare lo spinner bloccante quando si entra direttamente sulla pagina HITS.

### ⚠️ Problemi aperti / TODO prossima sessione
- Nessuno — pulizia completata.

---

## 2026-03-26 — Sessione 7: Audit di Sistema & PT-BR Check

**Status AS IS:** Architettura validata. App local-first estremamente performante. Generato `AUDIT_REPORT.md`.

### ✅ Fatto
- Eseguito intero workflow `@/audit`.
- Verifica integrità costrutti (Route, dipendenze npm, build Vite e DB schema).
- Risolto piccolo debito tecnico UI: tradotti in PT-BR alcuni termini italiani rimasti in `DocumentosPage` e `StonePage`.
- Generato report di analisi sullo stato del codice, UX, e memoria IndexedDB.

### 🔧 Decisioni tecniche
- Concordato rinvio dello sviluppo del "Cold Storage" (Archivio anni pregressi) in quanto classificato come Premature Optimization per gli attuali volumi.

### ⚠️ Problemi aperti / TODO prossima sessione
- Ricezione e implementazione delle regole specifiche di Conciliazione per settori Receitas e Despesas.

---
## 2026-03-26 — Sessione 6: Dashboards Operativi (Auditoria do Extrato)

**Status AS IS:** I moduli Receitas e Despesas dispongono ora di un pannello "Auditoria do Extrato" per gestire la validazione manuale dei movimenti e l'aggiunta di documenti, operativamente separato dal Fechamento globale.

### ✅ Fatto
- **AuditoriaSectorialPage (`AuditoriaSectorialPage.jsx`):** Creata la Master Table di settore filtrata dinamicamente in base a `moduloDestino` (receitas/despesas).
- **Check Manuale:** Aggiunta checkbox rapida in riga per forzare la conciliazione manuale aggiornando `matchedSource` a "Manual".
- **Gestione Allegati:** Aggiunto pulsante 📎 che apre un `window.prompt` nativo per incollare riferimenti (link o nome file) al campo `documento`.
- **Transfer Inter-Settoriale:** Integrato pulsante 🔄 per muovere istantaneamente un estrato da Receitas a Despesas (o viceversa), correggendo la destinazione nel DB.
- **Routing & Config (`modulosConfig.js`):** Moduli agganciati alla overview e dotati di scorciatoie globali dalla TopBar.

### 🔧 Decisioni tecniche
- Utilizzato il riutilizzo dei dati in memoria da `useExtratos` per filtrare la tabella in tempo reale senza query O(n) sul DB IndexedDB al cambio di `filterConc`.
- Adozione di window.prompt nativo UX-friendly per l'inserimento dei documenti in ottica di velocità di data entry.

---
## 2026-03-26 — Sessione 5: Reconciliação Multi-Row & Global Navigation

**Status AS IS:** Il modulo Conciliação supporta abbinamenti N:M complessi tramite Carrello. L'esperienza globale è unificata tramite un sistema di Breadcrumbs dinamico e uno Spotlight Search (Ctrl+K).

### ✅ Fatto
- **Multi-Row Matching (N:M):** Evoluzione del modulo `ConciliacaoPage` per superare il limite 1:1. Rimosso il mapping stretto degli ID per supportare array di candidati sia alla fonte A che B.
- **Cart / Bucket Selection (UX):** Introdotto un `Carrinho N:M` "sticky" nel tab Órfãos (`ReconciliationWorkspace.jsx`). Permette all'operatore di selezionare `N` record dalla fonte A e `M` record dalla fonte B, calcolando il delta in tempo reale (R$).
- **Global Breadcrumbs (`TopBar.jsx`):** Rimosso il titolo statico a favore di un breadcrumb dinamico (`Hub > Empresa > Modulo`) cross-ruolo, per una navigazione contestuale chiara.
- **Spotlight Search (`SpotlightSearch.jsx`):** Implementata Command Palette azionata via `Ctrl+K`. Consente di digitare macro testuali per saltare tra i moduli (es. "NFs") o cambiare Empresa al volo.
- **Documentos Auto Match MVP:** La tab "Pasta Drive + Auto-Match" di `DocumentosPage.jsx` soddisfa il requirement di Sweep Bulk di PDF usando `File System Access API` e l'estrazione text/regex di `pdfMatchingService.js`.

### 🔧 Decisioni tecniche
- Utilizzato l'approccio "Cart/Bucket" (carrello della spesa) per la UX dell'accoppiamento N:M direttamente nel tab "Orfãos". Più efficiente dal punto di vista cognitivo rispetto a diagrammi o griglie nidificate.
- L'automazione e il parser del Modulo Documentos (`pdfMatchingService.js`) sono stati confermati stabili per il Phase MVP come da pianificazione.

### ⚠️ Problemi aperti / TODO prossima sessione
- Rollout produzione + Review generale di tutte le aziende.

---

## 2026-03-26 — Sessione 4: Ottimizzazione Pipeline Import, Duplicati & UX

**Status AS IS:** Hub dinamico context-aware. Pipeline di importazione ottimizzate per mass data ingestion senza crash. Filtri di visualizzazione e gestione duplicati (in-memory e DB) perfezionati.

### ✅ Fatto
- **Performance Import:** Refactored `useRegistroReservas`, `useBookings` e `useContasPagar` rimuovendo cicli di `save()` sequenziali a favore di buffer in-memory e bulk insert paralleli su IndexedDB.
- **Risoluzione Duplicati intra-file:** `useExtratos` ora espone `sessionImportedRows` per intercettare l'overflow di duplicati presenti *nello stesso* file importato (risolto bug UX "sem dados" nel modal).
- **Cartões "Todos" (Consolidado):** Implementato aggregatore dinamico intra-DB in `useCartoesCredito`. Recupera e fonde dati di tutti i Gateway attivi (`stone`, `sicoob`, ecc.), aggiungendo una colonna badge `Origem`. Bulk deletion sicura e cross-DB.
- **Esvaziar Tabela:** Introdotti bottoni rossi "🗑 Svuota Tudo" in `RegistroReservasPage`, `CartoesCreditoPage` e `NfsEmitidasPage` con logica segmentata (elimina tutto o solo il filtrato).
- **Dynamic Hub Routing:** Spostata logica dei moduli attivi in `modulosConfig.js`. L'hub "Receitas" nasconde automaticamente `Bookings` se l'azienda non è Arcoiris e rinomina dinamicamente `Reservas` in `(Concept)` o `(Goyanna)`.
- **NFs Emitidas Filter Resilience:** Fix critico al case-matching per "Quitada". Ora una normalizzazione `PascalCase` eseguita dinamicamente all'interno dell'`useMemo` protegge i filtri e lo stiling da anomalie nei file Excel lato stringa (es. "QUITADA" / "quitada "). Aggiunto `statusdepagamento` al parser NFs.
- **Micro-UX Fixes:** Risolto bug visuale "Grid Blowout" nel modal `SkippedDupsModal` settando `minWidth: 0` sulle MovCards. Sovrapposizione pulsanti in `ContasPagar` risolta con `flexWrap: 'wrap'`.

### 🔧 Decisioni tecniche
- Normalizzazione stringhe UI in-memory (`NfsEmitidasPage.jsx`) anziché migrazione complessa nei database storici IndexedDB per risolvere i problemi di case sensitivity, mantenendo i raw data immutati ma garantendo filtri perfetti.
- Lo "Scope Routing": Pagine modulari come `ReceitasGroupPage` ora calcolano strettamente su `const { empresaId } = useParams()`, abbandonando l'hook `activeEmpresa` che rischiava disallineamenti di rendering in navigazione diretta (URL).

### ⚠️ Problemi aperti / TODO prossima sessione
- Rivedere l'algoritmo di Riconciliazione (Conciliação) per consentire abbinamenti multi-riga.
- Procedere con i Test E2E finali per la conciliazione automatica Drive PDF.

---

## 2026-03-22 — Sessione 3: Navigation, Conciliação & PT-BR Audit

**Status AS IS:** App v0.3.0 — Hub con overview empresa, pagine gruppo RECEITAS/DESPESAS con card, modulo Conciliação con matching e salvataggio DB, testo interamente in PT-BR.

### ✅ Fatto

**Navigation & UX:**
- `EmpresaOverviewPage` — nuova pagina `/empresa/:id` con 4 card (RECEITAS, DESPESAS, Estratti, Documentos)
- `ReceitasGroupPage` — `/receitas` con 5 card sub-moduli (Conciliação, Entradas, NFs, Reservas, Bookings)
- `DespesasGroupPage` — `/despesas` con 3 card sub-moduli (Conciliação, Saidas, Contas a Pagar)
- Sidebar: click empresa → overview page; header RECEITAS/DESPESAS navigabile (label) + chevron toggle
- Hub: 4 bottoni modulo griglia 2×2 per ogni empresa card
- Gruppi sidebar collassati di default

**Modulo Conciliação:**
- `useConciliacao.js` — CRUD coppie conciliate in IndexedDB (`sombra_{id}_conciliacao`)
- `ConciliacaoPage.jsx` — matching valor ±R$0,02, 4 sezioni (Conciliados/Sugestões/Só A/Só B), confirmar/desvincular, export Excel
- `ConciliacaoReceitas.jsx` → `/conciliacao-receitas` · `ConciliacaoDespesas.jsx` → `/conciliacao-despesas`
- `db.js`: aggiunto `CONCILIACAO`, rimosso `DOCUMENTOS` duplicato

**PT-BR Audit:**
- `DocumentosPage.jsx`: Abbinare→Vincular, Documenti→Documentos, Pendenti→Pendentes, Conferma→Confirmar, e 10+ altre correzioni
- `AbbinamentoModal.jsx`: Seleziona→Selecione, Cercar→Buscar, Abbinare→Vincular
- `EmpresaOverviewPage.jsx`, `HubPage.jsx`: Abbinamenti→Vínculos, Pendenti→Pendentes

**Documentação:** Backup `_backups/codice/2026-03-22_23-41.zip` · TECHNICAL_DOC.md v0.3.0

### 🔧 Decisiones técnicas
- Conciliação matching semplice (valor ±0,02) — regras específicas para cada coppia A↔B da definire
- Routes flat `/conciliacao-receitas` e `/conciliacao-despesas` (no nesting, compatibile React Router v6)
- Sidebar label naviga + chevron toggle — split UX per accesso diretto a group overview

### ⚠️ Problemas abertos / TODO prossima sessione
- Regras matching Conciliação personalizzate per ogni combinazione A↔B
- Test end-to-end auto-match PDF con file reali + regras naming Drive
- Riconciliazione automatica Estratti Conto ↔ Contas a Pagar

---

## 2026-03-22 — Sessione 2: Nuovi Moduli, Sidebar Ristrutturata & Documentos

**Status AS IS:** App completa con 8 moduli attivi. Sidebar con macro-gruppi RECEITAS/DESPESAS. Modulo Documentos live con File System Access API. Auto PDF Matching in implementazione.

### ✅ Fatto

**Nuovi Moduli Importazione:**
- `NfsEmitidasPage.jsx` + `useNfsEmitidas.js` + `ImportNfsModal.jsx` — import file OMIE pivot NFs emitidas (parser Excel + date PT-BR)
- `RegistroReservasPage.jsx` + `useRegistroReservas.js` + `ImportRegistroModal.jsx` — import Arcoiris Registro Reservas Hits (skip righe senza voucher)
- `ContasPagarPage.jsx` + `useContasPagar.js` + `ImportContasPagarModal.jsx` — import OMIE Contas à Pagar (30 colonne, skip fornecedor vuoto, KPI clickabili vencidas)
- `BookingsPage.jsx` + `useBookings.js` + `ImportBookingsModal.jsx` — import Booking.com report (parser date portoghesi + BRL string, RN calcolato auto, badge canceladas)

**Modulo Documentos (Fase 1):**
- `useDocumentos.js` — CRUD abbinamenti PDF↔movimento con auto-reference `DOC-YYYY-NNN`
- `folderService.js` — File System Access API: selezione cartella locale (Google Drive Desktop), listamento PDF, lettura file handles
- `AbbinamentoModal.jsx` — modal abbinamento PDF + movimento (modalità Documentare/Dispensar)
- `DocumentosPage.jsx` — 3 tab: Documenti / Pendenti di Doc. / Pasta Drive; KPI clickabili; export Excel+PDF; preview inline PDF (<2MB)

**UI & Navigazione:**
- Sidebar completamente ristrutturata: macro-gruppi collassabili `RECEITAS` (verde) e `DESPESAS` (rosso) con animazioni CSS fluide, chevron rotante, linea connettrice verticale per link figli
- Receitas → **Entradas** / Despesas → **Saidas**
- KPI cards: layout `flex nowrap` — non vanno mai a capo
- Estratti Conto: aggiunto filtro data De/Até
- `db.js`: aggiunti `NFS_EMITIDAS`, `REGISTRO_RESERVAS`, `CONTAS_PAGAR`, `BOOKINGS`, `DOCUMENTOS` a `DB_MODULES`

### 🔧 Decisioni tecniche
- **File System Access API** per browse cartella locale Drive (solo Chrome/Edge) con fallback manuale
- **PDF parsing**: regex-based per estrarre valore/data/CNPJ dai testi PDF (avverrà con pdfjs-dist)
- **Sidebar collassabile**: `max-height` CSS transition + CSS custom properties per colori per-gruppo
- **KPIs clickabili**: toggle filtri dal click sulle card (pattern uniforme su tutti i moduli)
- **Score matching PDF**: valor.match +60 | data ±7gg +30 | nome empresa +10 — soglie forte≥70, possibile≥40

### ⚠️ Problemi aperti / TODO prossima sessione
- PDF auto-matching in corso: installare `pdfjs-dist` + `pdfMatchingService.js` + aggiornare DocumentosPage con vista matched/unmatched
- Utente fornirà regole naming dei file PDF su Drive per rafforzare l'algoritmo di matching
- ARCHITECTURE.md e TECHNICAL_DOC.md da aggiornare dopo verifica funzionamento

---

## 2026-03-22 — Sessione 1: Bootstrap & Core App

**Status AS IS:** App funzionante su localhost:5181. Hub, Receitas, Despesas operativi. 3 empresas placeholder caricate.

### ✅ Fatto

**Struttura & Scaffold**
- Creato progetto Vite + React manualmente (directory non vuota incompatibile con create-vite interattivo)
- Configurato `vite.config.js` con `optimizeDeps` per compatibilità xlsx CJS
- Design system dark premium implementato in `global.css` (CSS Variables, dark theme, typography Inter)

**Utilities & Persistenza**
- `db.js`: wrapper IndexedDB nativo senza dipendenze esterne (namespaced per empresa+modulo)
- `dateUtils.js`: helper safe per date in UTC-3 (UTC Trap Fix)
- `formatters.js`: formatter PT-BR (BRL currency, number parser)
- `parser.js`: parser multi-formato (CSV auto-delimiter, Excel via xlsx.js, OFX via regex SGML, PDF metadata)

**State Management**
- `EmpresaContext.jsx`: lista empresas + selezione + CRUD completo con IndexedDB persistence
- `ToastContext.jsx`: notifiche globali (success/error/info con auto-dismiss)
- `useContas.js`: hook generico per Receitas/Despesas (CRUD, bulk import, KPI aggregations)

**UI / Componenti**
- `Sidebar.jsx/css`: navigazione sidebar con empresa selector + nav links dinamici
- `TopBar.jsx/css`: barra superiore con breadcrumb, chip empresa e data
- `HubPage.jsx/css`: hub con card empresa (Receitas/Despesas actions, edit/delete, modal add)
- `ReceitasPage.jsx`: 4 KPI cards, tabella filtrata/ordinata, status vencimento con highlight
- `DespesasPage.jsx`: 4 KPI cards, tabella con colonna categoria, highlight scaduti
- `ContaModal.jsx`: modal add/edit per receita/despesa (tutti i campi)
- `ImportModal.jsx`: wizard 3-step (upload drag&drop → mapping colonne → preview → conferma)
- `EmpresaModal.jsx`: modal add/edit empresa con color picker e preview live
- `KPICard.jsx`: card KPI riutilizzabile con colore accent, trend indicator
- `ConfiguracaoPage.jsx`: gestione empresas + backup/restore JSON

**Workflow creati**
- `.agent/workflows/devlog.md`
- `.agent/workflows/technical_doc_update.md`

### 🔧 Decisioni tecniche
- **IndexedDB nativa** invece di `idb-keyval` (rimossa dipendenza per problemi ESM in Vite 6)
- **Import statico xlsx** invece di `await import('xlsx')` dinamico (causava error 504 Vite scan)
- **Bug fix critico:** `fmtDate` importata da `dateUtils.js`, non da `formatters.js` — causa del blank screen iniziale
- **OFX parser**: implementato natively tramite regex SGML (nessun package esterno necessario)
- **3 empresas placeholder** seeded automaticamente al primo avvio se DB vuoto

### ⚠️ Problemi aperti / TODO prossima sessione
- Módulo Documentos: placeholder presente, da implementare (Phase 5)
- Export Excel/PDF: tabelle visibili ma export non implementato
- Il server si avvia su porta 5181 se 5180 è occupata (processi Vite precedenti possono restare in background)
- Aggiungere START_APP.bat per avvio con una sola istruzione
- Riconciliazione automatica (matching) da implementare

---
