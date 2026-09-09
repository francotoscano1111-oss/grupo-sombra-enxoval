# GRUPO SOMBRA — Finance Hub: Arquitetura do Sistema

> **⚠️ LEITURA OBRIGATÓRIA antes de qualquer modificação.**  
> Este documento é a fonte da verdade para decisões de arquitetura, estrutura de DB e padrões de código.

---

## 1. Visão Geral

**Finance Hub** é uma SPA (Single Page Application) React + Vite que roda 100% no browser.  
**Não há backend.** Todos os dados são persistidos localmente via **IndexedDB**.

```
Browser (IndexedDB + localStorage)
    └── React SPA (Vite, porta padrão 5180)
            ├── EmpresaContext  ← estado global de empresa selecionada
            ├── ToastContext    ← notificações globais
            └── React Router   ← roteamento client-side
```

---

## 2. Estrutura IndexedDB — REGRAS CRÍTICAS

### 2.1 Padrão de Nomenclatura dos Bancos de Dados

```
sombra_global                          → dados globais (lista de empresas)
sombra_{empresaId}_{module}            → dados ativos por empresa e módulo
sombra_{empresaId}_{module}_storico    → dados arquivados (leitura/histórico)
```

**Exemplos reais:**
| DB Name | Conteúdo |
|---|---|
| `sombra_global` | Lista de empresas (key: `'empresas'`) |
| `sombra_empresa_001_receitas` | Contas a Receber (Entradas) |
| `sombra_empresa_001_despesas` | Contas a Pagar (Saidas) |
| `sombra_empresa_001_extratos` | Movimentos bancários importados |
| `sombra_empresa_001_contas_bancarias` | Cadastro de bancos e contas |
| `sombra_empresa_001_nfs_emitidas` | NFs Emitidas (OMIE pivot) |
| `sombra_empresa_001_registro_reservas` | Registro Reservas HITs |
| `sombra_empresa_001_contas_pagar` | Contas a Pagar OMIE (30 campos) |
| `sombra_empresa_001_bookings` | Bookings Booking.com |
| `sombra_empresa_001_documentos` | Abbinamenti PDF ↔ movimento |
| `sombra_empresa_001_*_storico` | Modelli speculari per archivio dati vecchi |

### 2.2 Nome do Object Store (CRÍTICO — nunca mudar sem migração)

| Banco de Dados | Object Store | Por quê |
|---|---|---|
| `sombra_global` | `'kv'` | DB pré-existente — compatibilidade retroativa |
| `sombra_{id}_{module}` | `'data'` | Criado durante a refatoração com este nome |

**⚠️ NUNCA mudar o nome do store sem versionar o DB (bumpar version + migração).**  
O `openDB()` em `src/utils/db.js` já tem auto-migração se o store esperado não existir.

### 2.3 IDs das Empresas

| Empresa | empresaId (permanente) |
|---|---|
| ARCO-IRIS | `empresa_001` |
| SAF HOSPEDAGEM | `empresa_002` |
| GOYANNA | `empresa_003` |

Os IDs são permanentes e formam parte do nome dos DBs. **Nunca renomear IDs.**

---

## 3. Camadas da Aplicação

```
src/
├── utils/
│   ├── db.js            ← 🔑 CAMADA DE DADOS — única interface com IndexedDB
│   ├── parser.js        ← Parser universal OFX / Excel / CSV
│   ├── formatters.js    ← fmtCurrency, parseCurrency
│   └── dateUtils.js     ← fmtDate, daysUntil, isOverdue
│
├── services/            ← 🔑 Servizi client-side (File System, PDF)
│   ├── folderService.js     ← File System Access API (browse cartella Drive locale)
│   └── pdfMatchingService.js ← Estrazione testo PDF (pdfjs-dist) + scoring matching
│
├── hooks/               ← 🔑 CAMADA DE NEGÓCIO — state + DB access
│   ├── useContas.js             ← CRUD Receitas e Despesas
│   ├── useContasBancarias.js    ← CRUD cadastro de bancos
│   ├── useExtratos.js           ← CRUD + import movimentos bancários
│   ├── useNfsEmitidas.js        ← CRUD NFs Emitidas (OMIE)
│   ├── useRegistroReservas.js   ← CRUD Registro Reservas (HITs)
│   ├── useContasPagar.js        ← CRUD Contas a Pagar (OMIE, 30 campos)
│   ├── useBookings.js           ← CRUD Bookings (Booking.com)
│   ├── useDocumentos.js         ← CRUD abbinamenti PDF↔movimento
│   ├── useFilterPrefs.js        ← Persistência filtros (localStorage)
│   └── useAutoBackup.js         ← Auto-backup periódico em localStorage
│
├── context/
│   ├── EmpresaContext.jsx   ← Lista de empresas (from GlobalDB 'empresas')
│   └── ToastContext.jsx     ← Notificações toast
│
├── pages/               ← 🔑 CAMADA DE APRESENTAÇÃO
│   ├── HubPage.jsx
│   ├── ReceitasPage.jsx         ← Entradas (ex Receitas)
│   ├── DespesasPage.jsx         ← Saidas (ex Despesas)
│   ├── EstratiPage.jsx          ← Extratos bancários com filtro data
│   ├── NfsEmitidasPage.jsx      ← NFs Emitidas (OMIE)
│   ├── RegistroReservasPage.jsx ← Registro Reservas HITs
│   ├── ContasPagarPage.jsx      ← Contas a Pagar OMIE
│   ├── BookingsPage.jsx         ← Bookings Booking.com
│   ├── DocumentosPage.jsx       ← Abbinamento PDF↔movimento (3 tab)
│   └── ConfiguracaoPage.jsx
│
├── components/
│   ├── estratti/
│   ├── documentos/          ← AbbinamentoModal.jsx
│   ├── contasPagar/         ← ContaPagarModal.jsx + ImportContasPagarModal.jsx
│   ├── bookings/            ← BookingModal.jsx + ImportBookingsModal.jsx
│   ├── nfsEmitidas/         ← NfModal.jsx + ImportNfsModal.jsx
│   ├── registroReservas/    ← ReservaModal.jsx + ImportRegistroModal.jsx
│   ├── layout/              ← Sidebar (macro-gruppi RECEITAS/DESPESAS) + TopBar
│   └── shared/              ← ContaModal, ImportModal
│
└── App.jsx
```

---

## 4. Fluxo de Dados — db.js API

**Toda operação de dados DEVE passar por `src/utils/db.js`.**  
Nunca chamar IndexedDB diretamente fora deste arquivo.

```javascript
// Funções exportadas:
dbGet(dbName, key)         → Promise<value>
dbSet(dbName, key, value)  → Promise<void>
dbDel(dbName, key)         → Promise<void>
dbEntries(dbName)          → Promise<[key, value][]>
dbClear(dbName)            → Promise<void>

GlobalDB.get/set/del/entries  ← shortcuts para sombra_global
getDB(empresaId, module)      ← retorna o nome do DB (string)

exportFullBackup()   → Promise<BackupObject>   ← exporta tudo
importFullBackup()   → Promise<void>           ← restaura tudo
```

### openDB — Comportamento Automático
```
1. Tenta abrir o DB na versão atual (sem especificar versão)
2. Se novo: cria o store correto (onupgradeneeded)
3. Se existente com store correto: usa direto
4. Se existente com store ERRADO (estado inválido): 
   → bumpa version + cria store correto automaticamente
```

---

## 5. Schemas de Dados

### 5.1 Empresa (GlobalDB → key: 'empresas')
```json
[{
  "id": "empresa_001",
  "nome": "ARCO-IRIS",
  "cor": "#5d7cf2",
  "ativa": true,
  "criadaEm": "ISO-8601"
}]
```

### 5.2 Receita / Despesa (sombra_{id}_receitas | despesas)
```json
{
  "id": "uuid",
  "empresaId": "empresa_001",
  "descricao": "...",
  "valor": 1000.00,
  "vencimento": "2026-03-15",
  "parceiro": "...",
  "categoria": "...",
  "status": "Pendente|Recebido|Conciliado|Cancelado|Em atraso",
  "conciliado": false,
  "conciliadoCom": null,
  "criadoEm": "ISO-8601"
}
```

### 5.3 Conta Bancária (sombra_{id}_contas_bancarias)
```json
{
  "id": "uuid",
  "empresaId": "empresa_001",
  "nome": "Banco do Brasil",
  "agencia": "1066-9",
  "conta": "27000-8",
  "tipo": "Conta Corrente",
  "moeda": "BRL",
  "cor": "#5d7cf2",
  "ativa": true,
  "criadoEm": "ISO-8601"
}
```

### 5.4 Movimento Bancário / Extrato (sombra_{id}_extratos)
```json
{
  "id": "uuid",
  "empresaId": "empresa_001",
  "contaBancariaId": "uuid-da-conta",
  "data": "2026-03-23",
  "descricao": "PIX RECEBIDO...",
  "valor": 90.00,
  "tipo": "crédito|débito",
  "saldo": null,
  "documento": "",
  "historico": "",
  "categoria": "",
  "conciliado": false,
  "conciliadoCom": null,
  "conciliadoTipo": null,
  "lote": "uuid-do-lote-de-import",
  "fonte": "ofx|excel|manual",
  "criadoEm": "ISO-8601"
}
```

---

## 6. Persistência Não-DB (localStorage)

| Key | Conteúdo | Gerenciado por |
|---|---|---|
| `sombra_filtros_{empresaId}_{modulo}` | Filtros de status, banco, tipo | `useFilterPrefs.js` |
| `sombra_col_extratos_{empresaId}` | Colunas visíveis na tabela estratti | `ColumnSelector.jsx` |
| `sombra_autobackup_data` | JSON snapshot de todos os dados | `useAutoBackup.js` |
| `sombra_autobackup_meta` | Timestamp + size do último backup | `useAutoBackup.js` |

### Regras de Persistência de Filtros
- ✅ Persiste: `showExtrato`, `contaBancariaId`, `tipoExtrato`, `status`, `search`
- ❌ Não persiste (sessão apenas): `dataInicio`, `dataFim`

---

## 7. Sistema de Backup

### 7.1 Backup Automático de Dados
- **Frequência:** a cada 8 horas + ao iniciar (com delay de 6s)
- **Formato:** JSON em localStorage (`sombra_autobackup_data`)
- **Gerenciado por:** `useAutoBackup.js` (integrado em `App.jsx`)

### 7.2 Backup Automático de Código
- **Frequência:** a cada abertura do app (via `START_APP.bat`)
- **Local:** `_backups/codice/` (ZIP timestampado)
- **Retenção:** últimos 15 backups

### 7.3 Backup Manual
- **Via UI:** Configurações → "Exportar agora" → download JSON
- **Restore:** Configurações → "Selecionar arquivo .json" → restaura tudo

---

## 8. Roteamento

```
/                                        → HubPage (seletor empresa)
/empresa/:empresaId/entradas             → EntradasPage (Triagem Bancária de Entradas)
/empresa/:empresaId/a-receber            → ReceitasPage (Contas a Receber — Oculto)
/empresa/:empresaId/nfs-emitidas         → NfsEmitidasPage
/empresa/:empresaId/registro-reservas    → RegistroReservasPage
/empresa/:empresaId/bookings             → BookingsPage
/empresa/:empresaId/despesas             → DespesasPage (Saidas)
/empresa/:empresaId/contas-pagar         → ContasPagarPage
/empresa/:empresaId/estratti             → EstratiPage
/empresa/:empresaId/documentos           → DocumentosPage
/configuracoes                           → ConfiguracaoPage
```

---

## 9. Regras de Desenvolvimento — CHECKLIST OBRIGATÓRIO

> Antes de qualquer modificação, responda estas perguntas:

### 9.1 Modificações no DB
- [ ] O **nome do DB** segue o padrão `sombra_{empresaId}_{module}`?
- [ ] O **store name** é `'kv'` para global e `'data'` para empresa?
- [ ] Se mudar store name → bumpar versão + migração em `openDB`?
- [ ] Toda operação DB passa por `db.js` (nunca IndexedDB direto)?
- [ ] Adicionei **try/catch/finally** nos hooks para evitar loading infinito?

### 9.2 Novos Campos no Schema
- [ ] O novo campo é compatível com dados já existentes (retrocompatível)?
- [ ] `exportFullBackup` e `importFullBackup` processam o novo campo?
- [ ] O schema em seção 5 desta documentação foi atualizado?

### 9.3 Novos Módulos / Stores
- [ ] Adicionei o novo módulo em `ALL_MODULES` de `db.js`?
- [ ] Criei o hook correspondente (padrão: `useXxx.js`)?
- [ ] O `getDB(empresaId, 'novo_modulo')` retorna o nome correto?

### 9.4 Filtros e Preferências
- [ ] Filtros de **data** são session-only (não persistir)?
- [ ] Filtros de **status/banco/tipo** persistem em localStorage?
- [ ] `useFilterPrefs` tem os defaults corretos?

### 9.5 Localização
- [ ] Todos os textos visíveis ao usuário estão em **PT-BR**?

---

## 10. Problemas Conhecidos e Soluções

| Problema | Causa | Solução Aplicada |
|---|---|---|
| Botão "Salvando..." trava | dbSet lança exceção sem try/catch | try/catch/finally em todos os modal handlers |
| Movimentos não aparecem em Receitas | filtros `dataInicio`/`dataFim` salvos em sessão anterior | Filtros de data nunca persistem (session-only) |
| Store not found (IndexedDB) | DB criado com nome de store diferente | `openDB` detecta e faz auto-upgrade de versão |
| Loading infinito | `setLoading(false)` não chamado em caso de erro | finally block em todos os refresh() hooks |
| Dados não aparecem na outra porta | IndexedDB é origin-scoped (localhost:5180 ≠ :5181) | Usar sempre porta 5180 via START_APP.bat |
| Conflito URL `/entradas` | Rotta originariamente occupata dal pannello passivo "A Receber" | Modulo originario migrato su `/a-receber` e oscurato, liberando `/entradas` per l'hub di Triagem attiva. |

---

*Última atualização: 2026-04-19 — v0.4.1 (Universal Data Archiving)*
