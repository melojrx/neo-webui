# Design Spec — Agents Kanban: Alinhamento ao Design System Neo

> **Data:** 2026-06-04
> **Escopo:** Aba Kanban de Agentes (`static/agents_kanban.js` + CSS `.agents-kanban-*` em `static/style.css`)
> **Abordagem:** Refatoração semântica — substituir cores hardcoded por variáveis CSS do skin "neo", remover `!important`, mover cores de status do JS para CSS, garantir light/dark mode.
> **Referência:** [`docs/neo/DESIGN-SPEC.md`](../../neo/DESIGN-SPEC.md) §2 (Paleta)

---

## 1. Contexto e Motivação

O Kanban de Agentes (`agents-kanban`) foi implementado com cores hardcoded (`#1B2942`, `#0F1A30`, `#2C3A5A`, etc.) e `!important` em ~8 regras CSS. Isso faz com que o painel não responda ao skin "neo" e não funcione corretamente em light mode.

O Kanban de Projetos (`kanban.js`) já usa variáveis CSS e está alinhado ao design system. O objetivo é trazer o Kanban de Agentes ao mesmo padrão.

### Problemas identificados

1. **12+ backgrounds/borders hardcoded** com `!important` que ignoram as variáveis do skin
2. **Cores de texto hardcoded** (`#E6F4FF`, `#8AA0BD`) em vez de `var(--text)` / `var(--muted)`
3. **Cores de status no JS** (`STATUS_COLOR`) com hex fixos que não se adaptam a light/dark
4. **Prioridades com cores hardcoded** que não usam `--error`/`--warning`/`--success`
5. **Modais com `!important`** e backgrounds fixos

---

## 2. CSS — Backgrounds e Borders

### 2.1. Mapeamento de substituição

| Seletor | Propriedade | Valor atual (hardcoded) | Novo valor |
|---|---|---|---|
| `.agents-kanban-header` | `border-bottom` | `1px solid #2C3A5A` | `1px solid var(--border2)` |
| `.agents-kanban-header` | `color` | `#E6F4FF` | `var(--text)` |
| `.agents-kanban-stats` | `background` | `#0B1322 !important` | `var(--bg-elev)` |
| `.agents-kanban-stats` | `border-bottom` | `1px solid #2C3A5A` | `1px solid var(--border2)` |
| `.agents-kanban-stat` | `background` | `#162038 !important` | `var(--surface)` |
| `.agents-kanban-stat` | `border` | `1px solid #2C3A5A` | `1px solid var(--border)` |
| `.agents-kanban-stat` | `color` | `#E6F4FF` | `var(--text)` |
| `.agents-kanban-column` | `background` | `#1B2942 !important` | `var(--surface)` |
| `.agents-kanban-column` | `border` | `1px solid #2C3A5A !important` | `1px solid var(--border)` |
| `.agents-kanban-card` | `background` | `#0F1A30 !important` | `var(--bg)` |
| `.agents-kanban-card` | `border` | `1px solid #2C3A5A !important` | `1px solid var(--border)` |
| `.agents-kanban-card` | `color` | `#E6F4FF` | `var(--text)` |
| `.agents-kanban-col-empty` | `color` | `#8AA0BD` | `var(--muted)` |
| `.agents-kanban-modal` | `background` | `#162038 !important` | `var(--surface)` |
| `.agents-kanban-modal` | `border` | `1px solid #2C3A5A !important` | `1px solid var(--border)` |
| `.agents-kanban-modal` | `color` | `#E6F4FF` | `var(--text)` |

### 2.2. Remoção de `!important`

Todos os `!important` (~8 ocorrências) serão removidos. O skin "neo" já tem especificidade suficiente via `:root.dark[data-skin="neo"]` e `:root[data-skin="neo"]`.

---

## 3. CSS — Cores de status das colunas

### 3.1. Mover cores do JS para CSS via `data-status`

Atualmente as cores de coluna são definidas inline via JS (`STATUS_COLOR` → `style="--col-accent: #XXXX"`). A proposta é definir as cores no CSS usando atributos `data-status`, mantendo o inline como fallback.

```css
/* Status column accents — uses design system variables */
.agents-kanban-column[data-status="triage"]    { --col-accent: var(--muted); }
.agents-kanban-column[data-status="todo"]      { --col-accent: var(--muted); }
.agents-kanban-column[data-status="scheduled"] { --col-accent: var(--info); }
.agents-kanban-column[data-status="ready"]     { --col-accent: #A78BFA; /* violet — sem variável no skin neo */ }
.agents-kanban-column[data-status="running"]   { --col-accent: var(--success); }
.agents-kanban-column[data-status="blocked"]   { --col-accent: var(--error); }
.agents-kanban-column[data-status="review"]    { --col-accent: var(--warning); }
.agents-kanban-column[data-status="done"]      { --col-accent: var(--success); }
.agents-kanban-column[data-status="archived"]  { --col-accent: var(--muted); }
```

### 3.2. JS — Simplificar `STATUS_COLOR`

O objeto `STATUS_COLOR` no JS será removido. O JS deixará de setar `--col-accent` inline e confiará 100% no CSS via `data-status`. Pré-requisito: o HTML renderizado pelo JS já inclui `data-status` na coluna (verificar em `_renderBoard()` no `agents_kanban.js`). Se não incluir, adicionar o atributo `data-status` ao criar a coluna.

---

## 4. CSS — Prioridades dos cards

As variáveis `--danger-bg` e `--warning-bg` não existem no skin neo. Para backgrounds, usar `rgba()` inline baseado nas cores do design system. Para cores de texto, usar `--error` (não `--danger` — essa variável não existe no skin neo).

| Seletor | Propriedade | Valor atual | Novo valor |
|---|---|---|---|
| `.agents-kanban-card-priority.high` | `background` | `rgba(225,106,58,.18)` | `rgba(239,83,80,0.10)` (derivado de `--error`) |
| `.agents-kanban-card-priority.high` | `color` | `#e16a3a` | `var(--error)` |
| `.agents-kanban-card-priority.med` | `background` | `rgba(210,167,64,.18)` | `rgba(255,167,38,0.10)` (derivado de `--warning`) |
| `.agents-kanban-card-priority.med` | `color` | `#d2a740` | `var(--warning)` |
| `.agents-kanban-card-priority.low` | `background` | `rgba(122,122,142,.18)` | `var(--hover-bg)` |
| `.agents-kanban-card-priority.low` | `color` | `var(--muted)` | `var(--muted)` (sem mudança) |

---

## 5. CSS — Modais e inputs

### 5.1. Modal backdrop e container

| Seletor | Propriedade | Valor atual | Novo valor |
|---|---|---|---|
| `.agents-kanban-modal-backdrop` | `background` | `rgba(0,0,0,.55)` | sem mudança (overlay genérico) |
| `.agents-kanban-modal` | `background` | `#162038 !important` | `var(--surface)` |
| `.agents-kanban-modal` | `border` | `1px solid #2C3A5A !important` | `1px solid var(--border)` |
| `.agents-kanban-detail-grid > div` | `background` | `var(--bg)` | sem mudança (já usa variável) |

### 5.2. Inputs e focus

Inputs já usam `var(--bg)` e `var(--border)`. Focus já usa `var(--accent)`. Sem mudanças necessárias aqui.

---

## 6. Light mode

Com a substituição por variáveis CSS, o light mode funciona automaticamente:

- `--surface` em light = `#FFFFFF` (vs `#162038` em dark)
- `--bg` em light = `#F2F6FB` (vs `#070B17` em dark)
- `--border` em light = `#D6E1EE` (vs `#1F2A44` em dark)
- `--text` em light = `#0B1726` (vs `#E6F4FF` em dark)
- `--muted` em light = `#54637A` (vs `#8AA0BD` em dark)

Nenhuma regra `@media` ou `:root:not(.dark)` adicional é necessária — as variáveis do skin "neo" já tratam ambos os modos.

---

## 7. Sidebar — Unificação Neo Shell

### 7.1. Problema

O `NEO_SHELL_PANELS` em `static/panels.js` controla quais painéis ativam o `dashboard-shell-mode`, que esconde a rail legada do Hermes e mostra a sidebar Neo (brand, menu, status card, VPS resources, footer).

Atualmente, 3 painéis estão **fora** do set:
- `agents-kanban`
- `memory`
- `workspaces`

Quando o usuário navega para esses painéis, a sidebar Neo desaparece e a rail legada (ícones sem labels, sem brand) aparece no lugar — quebrando a consistência visual.

### 7.2. Solução

Adicionar os 3 painéis ao `NEO_SHELL_PANELS`:

```js
// Antes
const NEO_SHELL_PANELS = new Set(['dashboard', 'chat', 'projects', 'profiles', 'agents', 'settings', 'skills', 'tasks', 'meetings']);

// Depois
const NEO_SHELL_PANELS = new Set(['dashboard', 'chat', 'projects', 'profiles', 'agents', 'settings', 'skills', 'tasks', 'meetings', 'agents-kanban', 'memory', 'workspaces']);
```

### 7.3. Impacto

- Sidebar Neo permanece visível em **todos** os painéis
- Rail legada do Hermes nunca aparece (já está escondida via `display:none!important` no `dashboard-shell-mode`)
- Sem mudanças de layout — o `dashboard-shell-mode` já trata o conteúdo principal corretamente

---

## 8. Arquivos afetados

| Arquivo | Tipo de mudança |
|---|---|
| `static/style.css` (linhas ~5422–5543) | Substituir cores hardcoded, remover `!important`, adicionar regras `data-status` |
| `static/agents_kanban.js` (linhas ~34–44) | Remover `STATUS_COLOR`, confiar em CSS via `data-status` |
| `static/panels.js` (linha 25) | Adicionar `agents-kanban`, `memory`, `workspaces` ao `NEO_SHELL_PANELS` |

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Cores de status não renderizarem sem `data-status` no HTML | Verificar se o JS já seta `data-status` na coluna; se não, adicionar |
| `!important` existir para override de upstream | Testar com e sem; o skin "neo" tem especificidade suficiente |
| Light mode não testado em produção | Validar visualmente em ambos os modos antes de merge |
| Painéis memory/workspaces não terem layout adequado no shell mode | Verificar que o CSS `dashboard-shell-mode` já cobre esses painéis; se não, adicionar regras mínimas |

---

## 10. Fora do escopo

- Mudanças no Kanban de Projetos (já alinhado)
- Alterações de layout, estrutura HTML ou comportamento do Kanban de Agentes
- Novas features ou funcionalidades
- Modais de detalhe/edit — apenas cores, sem reestruturação

---

## 11. Critério de aceitação

1. Zero cores hardcoded (`#XXXXXX`) no CSS `.agents-kanban-*`
2. Zero `!important` no CSS `.agents-kanban-*`
3. Cores de status definidas no CSS via `data-status`
4. Kanban renderiza corretamente em dark mode (skin "neo")
5. Kanban renderiza corretamente em light mode (skin "neo")
6. Prioridades usam `--error`/`--warning`/`--muted`
7. `node --check static/agents_kanban.js` passa sem erros
8. Testes pytest existentes continuam passando
9. Sidebar Neo visível nos painéis `agents-kanban`, `memory` e `workspaces`
10. Rail legada do Hermes nunca aparece em nenhum painel
