# 📘 SOMBRA ENXOVAL PRO — BIBBIA TECNICA & FUNZIONALE (CHECKPOINT ARCHITETTURALE)

> **Progetto:** GRUPO SOMBRA Finance & Operations Hub  
> **Applicativo:** SOMBRA ENXOVAL PRO — Gestão, Movimentação & Auditoria de Enxoval  
> **Versione Corrente:** `3.0.0-PROD`  
> **Data Checkpoint:** `2026-09-09`  
> **URL Produzione Vercel:** [https://grupo-sombra-enxoval.vercel.app](https://grupo-sombra-enxoval.vercel.app)  
> **Repository GitHub:** [francotoscano1111-oss/grupo-sombra-enxoval](https://github.com/francotoscano1111-oss/grupo-sombra-enxoval.git)  

---

## 📑 INDICE GENERALE

1. [Visione & Obiettivi dell'Applicazione](#1-visione--obiettivi-dellapplicazione)
2. [Architettura Software & Stack Tecnologico](#2-architettura-software--stack-tecnologico)
3. [Ambienti Operativi (Multi-Property)](#3-ambienti-operativi-multi-property)
4. [Anatomia dei 6 Moduli Funzionali](#4-anatomia-dei-6-moduli-funzionali)
   - [4.1 Matriz de Estoque & Par Stock (Mudas)](#41-matriz-de-estoque--par-stock-mudas)
   - [4.2 Movimentações Rápidas (Entradas, Transferências, Avarias)](#42-movimentações-rápidas)
   - [4.3 Unidades & Locais (Camere, Vilas, Setori)](#43-unidades--locais)
   - [4.4 Catálogo de Itens de Enxoval](#44-catálogo-de-itens-de-enxoval)
   - [4.5 Inventário & Contagem Física (Auditorie Periodiche)](#45-inventário--contagem-física)
   - [4.6 Relatórios, Histórico & Backup](#46-relatórios-histórico--backup)
5. [Modello dei Dati & Persistenza (Schema JSON)](#5-modello-dei-dati--persistenza-schema-json)
6. [Motore di Reportistica & Generazione PDF (jsPDF + AutoTable)](#6-motore-di-reportistica--generazione-pdf)
7. [Manuale Utente Integrato (Viewer + PDF A4 6 Capitoli)](#7-manuale-utente-integrato)
8. [Design System & Gestione Temi (Light / Dark High-Contrast)](#8-design-system--gestione-temi)
9. [Error Boundary & Stabilità React](#9-error-boundary--stabilità-react)
10. [Workflow di Deploy & CI/CD su Vercel](#10-workflow-di-deploy--cicd-su-vercel)
11. [Guida per Sviluppi Futuri (Roadmap & Estensioni)](#11-guida-per-sviluppi-futuri)

---

## 1. 🎯 Visione & Obiettivi dell'Applicazione

**SOMBRA ENXOVAL PRO** è una Single Page Application (SPA) ad elevate prestazioni concepita per il controllo millimetrico della biancheria (*enxoval hôtelier*) delle strutture ricettive di lusso del **GRUPO SOMBRA** (*Hotel & Resort* e *Floresta & SPA*).

### Obiettivi Chiave:
- **Tracciamento Totale:** Conoscere in tempo reale dove si trova ogni singolo capo (in uso nelle camere, a riserva nel magazzino centrale, in lavanderia o dismesso per usura).
- **Par Stock & Metas (3 Mudas):** Monitorare il fabbisogno standard ideale (1 muda nel letto/bagno, 1 muda nell'armadio/rouparia, 1 muda in lavanderia/lavaggio).
- **Riconciliazione Fiscale & Fisica:** Permettere alle governanti (*camareiras*) e ai responsabili di audit di effettuare conteggi fisici sia da web sia tramite fogli Excel compilati sul campo, calcolando automaticamente eccedenze (*sobras*) e ammanchi (*faltas/déficit*).
- **Autonomia & Zero-Cost Infrastructure:** Funzionamento 100% client-side senza costi di server DB, con salvataggio locale istantaneo e backup di sicurezza JSON.

---

## 2. 🏗️ Architettura Software & Stack Tecnologico

L'applicazione è strutturata come un unico bundle autonomo distribuito come file statico (`index.html` e `Controle_Enxoval.html`).

```
                              ┌──────────────────────────────────────────────┐
                              │           SOMBRA ENXOVAL PRO (SPA)           │
                              └──────────────────────┬───────────────────────┘
                                                     │
                 ┌───────────────────────────────────┼──────────────────────────────────┐
                 ▼                                   ▼                                  ▼
      ┌─────────────────────┐             ┌─────────────────────┐            ┌─────────────────────┐
      │  React 18 + Babel   │             │   Tailwind CSS      │            │ SheetJS + jsPDF     │
      │  Component UI /     │             │   Design System     │            │ Excel .xlsx Parser  │
      │  Reactive State     │             │   Dark / Light Mode │            │ Vector PDF Engine   │
      └──────────┬──────────┘             └──────────┬──────────┘            └──────────┬──────────┘
                 │                                   │                                  │
                 └───────────────────────────────────┼──────────────────────────────────┘
                                                     │
                                                     ▼
                                      ┌──────────────────────────────┐
                                      │  localStorage / Memory State │
                                      │  Persistent JSON Database    │
                                      └──────────────┬───────────────┘
                                                     │
                                                     ▼
                                      ┌──────────────────────────────┐
                                      │  Vercel Edge Global Static   │
                                      │  CI/CD via GitHub Push       │
                                      └──────────────────────────────┘
```

### Tecnologie e Versioni:
| Componente | Libreria / Tool | Versione / CDN | Scopo |
| :--- | :--- | :--- | :--- |
| **UI Engine** | React & ReactDOM | `18.2.0` (unpkg) | Gestione dichiarativa dello stato, reattività e componenti |
| **Compiler** | Babel Standalone | `7.23.6` (cdnjs) | Compilazione JSX real-time in-browser |
| **Styling** | Tailwind CSS CDN | `3.4.1` (play CDN) | Utility classes, temi dark/light, palette personalizzata |
| **Fogli Excel** | SheetJS (xlsx.full) | `0.18.5` (cdnjs) | Lettura planilhas contagem, export tabelle Excel native |
| **Motore PDF** | jsPDF + AutoTable | `2.5.1` + `3.8.2` | Generazione vettoriale PDF A4 portrait/landscape |
| **Typography** | Google Fonts | `Plus Jakarta Sans` + `JetBrains Mono` | Tipografia moderna ad elevata leggibilità |

---

## 3. 🏨 Ambienti Operativi (Multi-Property)

L'applicazione supporta il cambio rapido di contesto operativo senza ricaricare la pagina:

```javascript
const [ambienteAtivo, setAmbienteAtivo] = useState('hotel_resort'); // 'hotel_resort' | 'floresta_spa'
```

### 1. Hotel & Resort (`hotel_resort`):
- **Giacenza Attuale:** 4.493 pezzi attivi (3.782 in uso, 711 in Almoxarifado Central).
- **Punti di Rilevazione (29 Locali):** 20 Chalés Standard/Superior, 6 Suítes Master, Rouparias Nord/Sud, Estoque Central.
- **Par Stock Target:** ~4.228 pezzi (Meta 3 Mudas).

### 2. Floresta & SPA (`floresta_spa`):
- **Giacenza Attuale:** 814 pezzi attivi.
- **Punti di Rilevazione (8 Locali):** Bangalôs Floresta, Vilas Private, SPA Wellness, Almoxarifado SPA.

---

## 4. 🧩 Anatomia dei 6 Moduli Funzionali

### 4.1 Matriz de Estoque & Par Stock (Mudas)
- **Visualizzazione Tabellare:**
  - *Tabela Raggruppata:* Mostra per ogni articolo Categoria, Totale in Uso, Almoxarifado, Scarti, Perdite, Totale Generale, Meta 3 Mudas e Badge Déficit/Sobra.
  - *Vista Detalhada:* Espande orizzontalmente tutti i 29 quarti/settori individuali con totalizzatori dinamici.
- **Filtri e Ricerca:** Filtro unificato per Categoria (Cama, Banho, Piscina, SPA) e ricerca full-text istantanea.
- **KPI Cards Superiori Interattivi:** 6 card cliccabili con modale di approfondimento e download PDF dedicato.
  1. *Total em Estoque* (verde smeraldo)
  2. *Total em Uso* (blu cobalto)
  3. *Almoxarifado Central* (ciano)
  4. *Meta (Par Stock)* (indaco)
  5. *Descarte Total* (rosa/rosso)
  6. *Alertas / Faltas* (arancione/ambra)

### 4.2 Movimentações Rápidas
- Registra i flussi quotidiani attraverso 6 tipologie di ticket:
  1. `compra`: Nuovi acquisti in ingresso verso l'Almoxarifado.
  2. `abastecimento`: Rifornimento da magazzino verso le rouparias/camere.
  3. `envio_lavanderia`: Capi sporchi inviati alla lavanderia industriale.
  4. `retorno_lavanderia`: Capi puliti reintrodotti nelle scorte operative.
  5. `descarte`: Capi rovinati o macchiati dismessi definitivamente.
  6. `perda`: Ammanchi o furti accertati.
- **Audit Trail:** Tabella cronologica con ricerca, filtro per tipologia, pulsante di modifica ticket e storno con conferma.

### 4.3 Unidades & Locais
- Configurazione gerarchica delle unità fisiche:
  - `acomodacao` (Chalés, Suítes, Quartos)
  - `circulacao` (Rouparias, Depositi di Piano)
  - `almoxarifado` (Magazzino Principale)
- Aggiunta/Modifica/Eliminazione rapida dei locali con ricalcolo immediato della colonna *Total em Uso*.

### 4.4 Catálogo de Itens de Enxoval
- Anagrafica articoli con:
  - Nome Articolo (es: *Lençol Casal 300 Fios*, *Toalha Banho Gigante*)
  - Categoria (*Cama*, *Banho*, *Piscina*, *SPA*)
  - Par Stock Standard per camera (Mudas)
  - Prezzo/Costo Unitario (R$) per valorizzazione inventariale.

### 4.5 Inventário & Contagem Física
- Modulo di verifica e riconciliazione periodica:
  - **Data della Contagem:** Campo calendario per marcare la data effettiva dell'audit nei locali.
  - **Calcolatrice Intelligente:** Ogni cella di conteggio accetta espressioni aritmetiche (es: `12+10+4` calcola `26`).
  - **Import Planilha Excel (.xlsx):** Caricamento del file compilato dalle camareiras con finestra modale di anteprima e convalida in 1 clic.
  - **Stampa Ficha de Contagem A4:** Foglio vuoto impaginato per gli appunti manuali del personale di servizio.
  - **Chiusura & Salva Auditoria:** Archiviazione storica e aggiornamento delle giacenze teoriche.

### 4.6 Relatórios, Histórico & Backup
- **Archivio Storico:** Registro permanente di tutte le contagens storiche con filtri per data e struttura.
- **Funzioni per Documento:**
  - `Ver PDF`: Apre il report ufficiale diagrammato in nuova scheda.
  - `Detalhes`: Mostra la griglia completa a schermo con download Excel e PDF.
  - `Excluir`: Eliminazione protetta con ripristino o archiviazione.
- **Pulsante Sair (Backup):** Esegue il dump JSON completo dell'applicativo prima della chiusura.

---

## 5. 💾 Modello dei Dati & Persistenza (Schema JSON)

L'intero stato applicativo risiede in memoria React e viene sincronizzato nel `localStorage` del browser:

```typescript
interface EnxovalState {
  version: "3.0";
  lastSaved: string; // ISO 8601
  hotel_resort: PropertyData;
  floresta_spa: PropertyData;
  historicoInventarios: InventoryAudit[];
}

interface PropertyData {
  locais: {
    id: string;
    nome: string;
    tipo: "acomodacao" | "circulacao" | "almoxarifado";
    capacidade?: number;
  }[];
  itens: {
    id: string;
    nome: string;
    categoria: "Cama" | "Banho" | "Piscina" | "SPA";
    metaMudas: number;
    custoUnitario: number;
    estoque: {
      almoxarifado: number;
      descarte: number;
      perdas: number;
      distribuicao: { [localId: string]: number };
    };
  }[];
  movimentacoes: {
    id: string;
    data: string;
    tipo: "compra" | "abastecimento" | "envio_lavanderia" | "retorno_lavanderia" | "descarte" | "perda";
    itemId: string;
    itemNome: string;
    quantidade: number;
    origem: string;
    destino: string;
    responsavel: string;
    observacao?: string;
  }[];
}
```

---

## 6. 📄 Motore di Reportistica & Generazione PDF

Il sistema integra funzioni di esportazione vettoriale senza librerie server-side, sfruttando `window.jspdf.jsPDF` e il plugin `autoTable`:

1. **`handlePrintPDF('resumida')`:** Formato A4 Portrait con riepilogo totali per categoria, scorte, par stock e scostamenti.
2. **`handlePrintPDF('detalhada')`:** Formato A4 Landscape con matrice completa su tutti i 29 locali, righe alternate zebrate e totali finali.
3. **`handleExportKpiPDF(kpiType)`:** Report mirato per singolo indicatore (deficit, valorizzazione almoxarifado, scarti).
4. **`handlePrintFichaContagem()`:** Scheda operativa di rilevazione cartacea con griglia vuota per annotazioni a penna.
5. **`handleDownloadManualPDF()`:** Manuale completo in 4 pagine A4 con copertina istituzionale e 6 capitoli.

---

## 7. 📖 Manuale Utente Integrato (Viewer + PDF A4)

L'applicazione include il manuale utente in due forme:
1. **Visualizzatore Interattivo (Modal):** Aperto dal pulsante principale `📖 Manual do Usuário` nella barra superiore. Presenta schede dettagliate con icone, guide passo-passo e suggerimenti operativi.
2. **Esportazione PDF Ufficiale:** Pulsante `⬇️ Baixar Manual em PDF` che genera in tempo reale il PDF in Portoghese (PT-BR) con layout editoriale professionale.

---

## 8. 🎨 Design System & Gestione Temi

### Palette Colori Principale:
- **Primary / Brand:** Verde Smeraldo (`#10b981`, `#059669`)
- **Accent Viola:** Viola Indaco (`#7c3aed`, `#4f46e5`) per azioni strategiche e Manuale
- **Accent Blu:** Blu Oceano (`#2563eb`, `#1d4ed8`) per stampe e viste dettagliate
- **Danger / Alert:** Rosso Rubino (`#e11d48`, `#be123c`) per scarti e logout/backup
- **Dark Mode Backgrounds:** Slate scuro `#0b0f17` (Sombra-950) e `#0f172a` (Sombra-900)
- **Light Mode Backgrounds:** Slate chiarissimo `#f8fafc` e bianco puro `#ffffff`

---

## 9. 🛡️ Error Boundary & Stabilità React

Per prevenire schermate bianche in caso di eccezioni di parsing o valori imprevisti, la radice React è incapsulata da una classe `ErrorBoundary`:
- Intercetta qualsiasi errore nei cicli di render (`componentDidCatch`).
- Mostra una card di recupero elegante con messaggio di errore leggibile e pulsante `Recarregar Página`.
- Dizionario `Icons` protetto con fallback e tutte le 30 icone SVG esplicitamente dichiarate.

---

## 10. 🚀 Workflow di Deploy & CI/CD su Vercel

Il repository è configurato per il rilascio continuo con zero tempi di build:

```
[Modifiche a Controle_Enxoval.html]
                │
                ▼ (shutil.copyfile)
        [index.html sincronizzato]
                │
                ▼ (git add . && git commit)
        [Push su GitHub main]
                │
                ▼ (Vercel Webhook ~5 sec)
    [Live su grupo-sombra-enxoval.vercel.app]
```

### Comandi Operativi Rapidi:
```powershell
# 1. Sincronizzare Controle_Enxoval.html su index.html
python -c "import shutil; shutil.copyfile('Controle_Enxoval.html', 'index.html')"

# 2. Commit e Push
git add Controle_Enxoval.html index.html
git commit -m "feat/fix: descrizione della modifica"
git push origin main
```

---

## 11. 🔮 Guida per Sviluppi Futuri (Roadmap & Estensioni)

| Priorità | Modulo / Feature | Descrizione Tecnica |
| :---: | :--- | :--- |
| 🟢 **P1** | **Integrazione Cloud DB (Supabase / Firebase)** | Sostituzione facoltativa del `localStorage` con backend REST/PostgreSQL per sincronizzazione in tempo reale tra più dispositivi delle camareiras contemporaneamente. |
| 🟡 **P2** | **Lettore Barcode / QR Code per Stanza** | Scansione tramite fotocamera dello smartphone del QR code all'ingresso del chalé per aprire istantaneamente la scheda di conteggio di quella specifica stanza. |
| 🟡 **P3** | **Previsione Acquisti & Reorder Point** | Algoritmo predittivo per calcolare la data stimata di esaurimento scorte in base al tasso medio di usura/descartes degli ultimi 3 mesi. |
| ⚪ **P4** | **PWA & Offline Service Worker** | Registrazione di un Service Worker (`manifest.json` + cache storage) per consentire l'utilizzo nei villaggi remoti privi di connessione Wi-Fi con sync differito al rientro in reception. |

---

> *Documento redatto e mantenuto da Antigravity AI Coding Assistant per il team direzionale del GRUPO SOMBRA.*
