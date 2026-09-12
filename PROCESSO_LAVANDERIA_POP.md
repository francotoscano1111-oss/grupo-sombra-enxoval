# 🧺 PROCEDIMENTO OPERACIONAL PADRÃO (POP) & GUIA COMPLETO
## Gestão, Controle de Lavanderia & Romaneios (In / Out) — SOMBRA ENXOVAL PRO

---

### 📌 1. Visão Geral e Arquitetura do Processo

O módulo de **Controle de Lavanderia & Romaneios (In / Out)** do **GRUPO SOMBRA** foi projetado para eliminar extravios, controlar o saldo de peças retidas na lavanderia externa em tempo real e fornecer rastreabilidade contínua por quinzena e por data.

```
       ┌────────────────────────────────────────────────────────┐
       │                   HOTEL & RESORT / SPA                 │
       └────────────────────────────────────────────────────────┘
                    │                               ▲
    1. ENVIO SUJO   │ (Saída do Hotel)              │ 2. RETORNO LIMPO (Devolução)
   [+ Saldo Retido] │                               │ [- Saldo Retido]
                    ▼                               │
       ┌────────────────────────────────────────────────────────┐
       │             LAVANDERIA EXTERNA (PARCEIRO)              │
       │                                                        │
       │   SALDO = Saldo Inicial + Total REC - ENV - PEND       │
       └────────────────────────────────────────────────────────┘
                    │
    3. PENDÊNCIAS / │ (Acordos, Reposições,
       INDENIZAÇÕES │  Baixas de Avaria e Perda)
                    ▼
       ┌────────────────────────────────────────────────────────┐
       │          CONCILIAÇÃO FINANCEIRA & GOVERNANÇA           │
       └────────────────────────────────────────────────────────┘
```

---

### 👥 2. Perfis de Acesso & Responsabilidades

| Perfil | Dispositivo Típico | Responsabilidade Principal | Visão no Sistema |
| :--- | :--- | :--- | :--- |
| **Operador de Lavanderia** (`lavanderia_hotel` / `lavspa`) | Smartphone / Tablet | Registro diário rápido de envios, devoluções e pendências no momento da entrega/recebimento. | **Painel Dedicado Exclusivo**: Apenas os 3 botões rápidos, seleção de quinzena e matriz de fluxo (sem poluição visual). |
| **Administrador / Governanta Geral** (`admin`) | PC / Notebook / Tablet | Auditoria quinzenal, conciliação de discrepâncias, ajuste fino de saldos, criação de novas quinzenas e exportação contábil. | **Acesso Global Completo**: Matriz geral, Par Stock, custos, conciliação, gestão de usuários e relatórios em PDF/Excel. |

---

### 📱 3. Guia Operacional Passo a Passo: LADO OPERADOR (Mobile)

O operador de lavanderia conta com uma interface **focada, limpa e de alto contraste**, sem menus desnecessários.

```
   ┌────────────────────────────────────────────────────────────┐
   │ 🏨 SOMBRA ENXOVAL PRO                   [Sair (Logout)] 🚪 │
   │ Painel do Operador de Lavanderia • Hotel & Resort          │
   ├────────────────────────────────────────────────────────────┤
   │  [ 🟣 1. Envio Roupa Suja ]  ➔ (Peças enviadas p/ lavanderia)│
   │  [ 🟢 2. Retorno Roupa Limpa ] ➔ (Peças limpas recebidas)   │
   │  [ 🟠 3. Resolução Pendências ] ➔ (Baixas e acordos)        │
   └────────────────────────────────────────────────────────────┘
```

#### 🟣 Passo 3.1: Como Registrar um Envio de Roupa Suja (Saída Hotel ➔ Lavanderia)
1. Ao carregar o veículo ou entregar os sacos/hampers para a lavanderia externa, clique no botão **`1. Envio Roupa Suja`**.
2. **Data:** O sistema preenche automaticamente com a data de hoje (pode ser alterada no calendário se necessário).
3. **Número do Romaneio / Ticket:** Insira o número da guia física da lavanderia (ex: `ROM-1045`).
4. **Digitação das Peças:**
   - Use os botões rápidos de incremento (`+1`, `+10`, `+50`) ou digite o valor diretamente no campo numérico de cada item (Lençóis, Toalhas de Banho, Rosto, etc.).
   - O rodapé calcula automaticamente o **Total de Peças do Romaneio**.
5. Clique em **`Salvar e Registrar Envio`**.
6. **Efeito no Sistema:** O saldo retido na lavanderia aumenta imediatamente na coluna **`REC`** da data correspondente.

---

#### 🟢 Passo 3.2: Como Registrar o Retorno de Roupa Limpa (Lavanderia ➔ Hotel)
1. Ao receber as gaiolas/fardos de roupa limpa e conferir a entrega, clique em **`2. Retorno Roupa Limpa`**.
2. O sistema oferece a opção de **Pré-carregar o último envio**, facilitando a conferência item por item.
3. Ajuste as quantidades efetivamente entregues limpas e dobradas.
4. Clique em **`Salvar e Registrar Retorno`**.
5. **Efeito no Sistema:** As peças recebidas abatem imediatamente do saldo retido na lavanderia através da coluna **`ENV`**.

---

#### 🟠 Passo 3.3: Como Registrar Resolução de Pendências (Faltas / Avarias)
1. Quando houver peças extraviadas, danificadas no processo industrial ou acertadas financeiramente com a lavanderia, clique em **`3. Resolução de Pendências`**.
2. Selecione o **Motivo da Resolução**:
   - *Peça Localizada e Devolvida Posteriormente*
   - *Indenização Financeira / Desconto em Fatura*
   - *Reposição por Peça Nova pelo Parceiro*
   - *Acordo / Baixa por Desgaste Aceito*
3. Digite a quantidade e uma breve observação (ex: *"2 toalhas rasgadas na calandra faturadas com desconto"*).
4. Clique em **`Confirmar Resolução`**.
5. **Efeito no Sistema:** A quantidade abate da pendência na coluna **`PEND`** e fica registrada no histórico de notas da quinzena.

---

### 🖥️ 4. Guia Operacional Passo a Passo: LADO ADMINISTRADOR & GOVERNANÇA

O Administrador tem visão macro, controle contábil e poder de edição direta em qualquer célula da matriz.

```
   ┌──────────────────────────────────────────────────────────────┐
   │  ADMIN DASHBOARD: LAVANDERIA & GOVERNANÇA                    │
   ├──────────────────────────────────────────────────────────────┤
   │  [📊 Auditoria & Acordos]  [📥 Excel (.xlsx)]  [📄 PDF A4]   │
   │  [➕ Nova Quinzena]        [🔗 Sincronizar Saldos Anteriores] │
   └──────────────────────────────────────────────────────────────┘
```

#### 🧮 Passo 4.1: A Matemática da Matriz Quindicinale
A matriz é estruturada em blocos diários de 4 subcolunas por data ativa:

$$\text{SALDO DIÁRIO} = \text{Saldo Anterior} + \text{REC (Envio Sujo)} - \text{ENV (Retorno Limpo)} - \text{PEND (Acordos)}$$

- **`REC` (Roxo):** Quantidade enviada pelo hotel para lavar.
- **`ENV` (Verde):** Quantidade devolvida limpa ao hotel.
- **`PEND` (Âmbar):** Peças resolvidas por acordo ou indenização.
- **`SALDO` (Azul/Amarelo):** Quantidade de peças físicas do hotel que ainda estão retidas dentro da lavanderia externa.

---

#### ✏️ Passo 4.2: Edição Direta e Correção de Erros na Matriz
- **Correção Pontual:** Se uma camareira ou operador digitou um número errado, o Administrador pode clicar **diretamente na célula** (`REC`, `ENV` ou `PEND`) na tabela e alterar o número ou apagá-lo.
- **Expressões Matemáticas:** O campo aceita cálculos diretos (ex: `15+20+5` $\to$ o sistema calcula `40` automaticamente).
- **Ajuste de Saldo Inicial:** A coluna `Saldo Quinz. Ant. ✏️` pode ser editada manualmente a qualquer momento caso haja necessidade de conciliação retroativa.

---

#### 🔄 Passo 4.3: Fechamento de Quinzena e Criação de Novo Período
1. No final do ciclo (dia 15 ou dia 30/31 do mês), verifique se todos os romaneios foram lançados.
2. Clique no botão **`➕ Nova Quinzena`**.
3. Digite o nome do novo período (ex: `1ª quinz OUTUBRO 2026.`).
4. **Herança Automática:** A nova quinzena é criada imediatamente, e o **Saldo Inicial** de cada item herda exatamente o **Saldo Final** da quinzena recém-encerrada.
5. Se em algum momento os saldos da quinzena anterior forem corrigidos retroativamente, basta clicar em **`🔗 Sincronizar Saldos da Quinz. Anterior`** na quinzena atual para atualizar tudo em cascata.

---

#### 📑 Passo 4.4: Auditoria de Discrepâncias & Acordos Históricos
1. Clique no botão **`🛡️ Auditoria & Acordos`**.
2. Visualize o comparativo entre o **Saldo Final Matemático** apurado pelo sistema e o **Saldo Declarado nos Romaneios Físicos** da lavanderia.
3. Filtre por período ou artigo específico para auditar diferenças acumuladas, créditos negociados e faturas pendentes.

---

#### 🖨️ Passo 4.5: Exportação e Relatórios Gerenciais
- **`📥 Excel (.xlsx)`:** Exporta a matriz completa da quinzena com todas as colunas diárias, totais e fórmulas para auditoria contábil.
- **`📄 PDF`:** Gera o documento formatado em A4 pronto para conferência e assinatura conjunta da Governanta Geral e do motorista/representante da lavanderia externa.

---

### 🛡️ 5. Boas Práticas & Regras de Ouro

> [!IMPORTANT]
> **Regra 1 — Registro Imediato:** Nunca libere a van/caminhão da lavanderia sem o preenchimento do romaneio no tablet/celular ou sem a assinatura do canhoto físico correspondente.

> [!TIP]
> **Regra 2 — Pré-carregamento Inteligente:** No retorno limpo, utilize sempre a função de conferência com base no último envio para identificar imediatamente peças retidas para relavagem ou manchas.

> [!NOTE]
> **Regra 3 — Sincronização em Nuvem (Supabase):** Qualquer alteração feita pelo Admin no PC é replicada instantaneamente para os celulares dos operadores em campo sem necessidade de atualizar manualmente o aplicativo.

---
*GRUPO SOMBRA • Governança Hoteleira & Operações de Enxoval PRO • Versão 3.0*
