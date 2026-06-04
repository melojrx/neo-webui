# Agents Kanban Design System Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Agents Kanban panel with the Neo design system by replacing hardcoded colors with CSS variables, removing `!important`, moving status colors from JS to CSS, and unifying the sidebar across all panels.

**Architecture:** CSS-only color refactoring in `static/style.css` (agents-kanban section), JS cleanup in `static/agents_kanban.js` (remove `STATUS_COLOR`), and a one-line addition in `static/panels.js` to extend `NEO_SHELL_PANELS`.

**Tech Stack:** Vanilla CSS variables (skin "neo"), vanilla JS, no build system.

**Spec:** `docs/superpowers/specs/2026-06-04-agents-kanban-design-system-alignment-design.md`

---

### Task 1: CSS — Replace hardcoded backgrounds and borders

**Files:**
- Modify: `static/style.css:5422-5539`

- [ ] **Step 1: Replace hardcoded colors in `.agents-kanban-header`**

In `static/style.css`, find the `.agents-kanban-header` rule (~line 5422) and change:

```css
/* BEFORE */
.agents-kanban-header{
  display:flex;align-items:flex-start;gap:16px;
  padding:18px 24px;border-bottom:1px solid #2C3A5A;
  color:#E6F4FF;
}

/* AFTER */
.agents-kanban-header{
  display:flex;align-items:flex-start;gap:16px;
  padding:18px 24px;border-bottom:1px solid var(--border2);
  color:var(--text);
}
```

- [ ] **Step 2: Replace hardcoded colors in `.agents-kanban-stats`**

```css
/* BEFORE */
.agents-kanban-stats{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;
  padding:12px 24px;border-bottom:1px solid #2C3A5A;background:#0B1322 !important;
}

/* AFTER */
.agents-kanban-stats{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;
  padding:12px 24px;border-bottom:1px solid var(--border2);background:var(--bg-elev);
}
```

- [ ] **Step 3: Replace hardcoded colors in `.agents-kanban-stat`**

```css
/* BEFORE */
.agents-kanban-stat{
  display:flex;flex-direction:column;gap:2px;padding:6px 10px;
  border-radius:8px;background:#162038 !important;border:1px solid #2C3A5A;
  color:#E6F4FF;
}

/* AFTER */
.agents-kanban-stat{
  display:flex;flex-direction:column;gap:2px;padding:6px 10px;
  border-radius:8px;background:var(--surface);border:1px solid var(--border);
  color:var(--text);
}
```

- [ ] **Step 4: Replace hardcoded colors in `.agents-kanban-column`**

```css
/* BEFORE */
.agents-kanban-column{
  flex:0 0 280px;display:flex;flex-direction:column;
  background:#1B2942 !important;
  border:1px solid #2C3A5A !important;border-radius:12px;min-height:200px;scroll-snap-align:start;
  border-top:3px solid var(--col-accent,var(--muted));
}

/* AFTER */
.agents-kanban-column{
  flex:0 0 280px;display:flex;flex-direction:column;
  background:var(--surface);
  border:1px solid var(--border);border-radius:12px;min-height:200px;scroll-snap-align:start;
  border-top:3px solid var(--col-accent,var(--muted));
}
```

- [ ] **Step 5: Replace hardcoded colors in `.agents-kanban-card`**

```css
/* BEFORE */
.agents-kanban-card{
  background:#0F1A30 !important;border:1px solid #2C3A5A !important;border-radius:10px;padding:10px 12px;
  cursor:grab;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;
  display:flex;flex-direction:column;gap:6px;
  color:#E6F4FF;
}

/* AFTER */
.agents-kanban-card{
  background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:10px 12px;
  cursor:grab;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;
  display:flex;flex-direction:column;gap:6px;
  color:var(--text);
}
```

- [ ] **Step 6: Replace hardcoded color in `.agents-kanban-col-empty`**

```css
/* BEFORE */
.agents-kanban-col-empty{font-size:12px;color:#8AA0BD;text-align:center;padding:14px 6px;font-style:italic;}

/* AFTER */
.agents-kanban-col-empty{font-size:12px;color:var(--muted);text-align:center;padding:14px 6px;font-style:italic;}
```

- [ ] **Step 7: Replace hardcoded colors in `.agents-kanban-modal`**

```css
/* BEFORE */
.agents-kanban-modal{
  background:#162038 !important;border:1px solid #2C3A5A !important;border-radius:14px;width:min(640px,100%);max-height:90vh;overflow:auto;
  box-shadow:0 30px 80px rgba(0,0,0,.45);
  color:#E6F4FF;
}

/* AFTER */
.agents-kanban-modal{
  background:var(--surface);border:1px solid var(--border);border-radius:14px;width:min(640px,100%);max-height:90vh;overflow:auto;
  box-shadow:0 30px 80px rgba(0,0,0,.45);
  color:var(--text);
}
```

- [ ] **Step 8: Run syntax check**

Run: `node --check static/agents_kanban.js`
Expected: no output (exit 0)

- [ ] **Step 9: Commit**

```bash
git add static/style.css
git commit -m "style(agents-kanban): replace hardcoded colors with CSS variables, remove !important"
```

---

### Task 2: CSS — Add `data-status` column accent rules

**Files:**
- Modify: `static/style.css` (insert after `.agents-kanban-column` rule, ~line 5451)

- [ ] **Step 1: Add CSS rules for column accents via `data-status`**

Insert the following block after the `.agents-kanban-column` rule (after the closing `}` of that rule):

```css
/* Column accent colors by status — design system aligned */
.agents-kanban-column[data-status="triage"]    { --col-accent: var(--muted); }
.agents-kanban-column[data-status="todo"]      { --col-accent: var(--muted); }
.agents-kanban-column[data-status="scheduled"] { --col-accent: var(--info); }
.agents-kanban-column[data-status="ready"]     { --col-accent: #A78BFA; }
.agents-kanban-column[data-status="running"]   { --col-accent: var(--success); }
.agents-kanban-column[data-status="blocked"]   { --col-accent: var(--error); }
.agents-kanban-column[data-status="review"]    { --col-accent: var(--warning); }
.agents-kanban-column[data-status="done"]      { --col-accent: var(--success); }
.agents-kanban-column[data-status="archived"]  { --col-accent: var(--muted); }
```

- [ ] **Step 2: Commit**

```bash
git add static/style.css
git commit -m "style(agents-kanban): add data-status column accent rules via CSS variables"
```

---

### Task 3: CSS — Update priority colors

**Files:**
- Modify: `static/style.css` (`.agents-kanban-card-priority` rules, ~line 5475-5480)

- [ ] **Step 1: Replace hardcoded priority colors**

```css
/* BEFORE */
.agents-kanban-card-priority.high{background:rgba(225,106,58,.18);color:#e16a3a;}
.agents-kanban-card-priority.med{background:rgba(210,167,64,.18);color:#d2a740;}
.agents-kanban-card-priority.low{background:rgba(122,122,142,.18);color:var(--muted);}

/* AFTER */
.agents-kanban-card-priority.high{background:rgba(239,83,80,0.10);color:var(--error);}
.agents-kanban-card-priority.med{background:rgba(255,167,38,0.10);color:var(--warning);}
.agents-kanban-card-priority.low{background:var(--hover-bg);color:var(--muted);}
```

- [ ] **Step 2: Commit**

```bash
git add static/style.css
git commit -m "style(agents-kanban): align priority colors with design system variables"
```

---

### Task 4: JS — Remove `STATUS_COLOR` and inline `--col-accent`

**Files:**
- Modify: `static/agents_kanban.js:34-44` (remove `STATUS_COLOR` object)
- Modify: `static/agents_kanban.js:180` (remove inline `style="--col-accent:..."`)

- [ ] **Step 1: Remove the `STATUS_COLOR` constant**

Delete lines 34-44 in `static/agents_kanban.js`:

```js
// DELETE THIS ENTIRE BLOCK:
  const STATUS_COLOR = {
    triage: 'var(--muted)',
    todo: 'var(--muted)',
    scheduled: '#5a7bff',
    ready: '#7e5dff',
    running: '#2bb673',
    blocked: '#e16a3a',
    review: '#d2a740',
    done: '#3aa172',
    archived: 'var(--muted)',
  };
```

- [ ] **Step 2: Remove inline `--col-accent` from `_renderBoard()`**

In the `_renderBoard()` function (~line 180), change the header template:

```js
// BEFORE
<header class="agents-kanban-col-header" style="--col-accent:${STATUS_COLOR[col.key]}">

// AFTER
<header class="agents-kanban-col-header">
```

Note: `el.dataset.status = col.key` is already set at line 178, so the CSS `data-status` rules from Task 2 will apply `--col-accent` via the `.agents-kanban-column` parent.

However, `--col-accent` is consumed by `.agents-kanban-col-header` (via `border-top:3px solid var(--col-accent,...)`), not by `.agents-kanban-column` itself. The column rule sets `border-top` on the column, but the header also has its own `border-top`. Let's verify: the `.agents-kanban-col-header` rule at line 5456 has `border-top:3px solid var(--col-accent,var(--muted))`. Since `--col-accent` is set on the parent `.agents-kanban-column` via `data-status`, CSS inheritance will make it available to the header child. This works correctly.

- [ ] **Step 3: Run syntax check**

Run: `node --check static/agents_kanban.js`
Expected: no output (exit 0)

- [ ] **Step 4: Commit**

```bash
git add static/agents_kanban.js
git commit -m "refactor(agents-kanban): remove STATUS_COLOR, rely on CSS data-status for column accents"
```

---

### Task 5: Unify sidebar — add missing panels to `NEO_SHELL_PANELS`

**Files:**
- Modify: `static/panels.js:25`

- [ ] **Step 1: Add `agents-kanban`, `memory`, `workspaces` to `NEO_SHELL_PANELS`**

```js
// BEFORE (line 25)
const NEO_SHELL_PANELS = new Set(['dashboard', 'chat', 'projects', 'profiles', 'agents', 'settings', 'skills', 'tasks', 'meetings']);

// AFTER
const NEO_SHELL_PANELS = new Set(['dashboard', 'chat', 'projects', 'profiles', 'agents', 'settings', 'skills', 'tasks', 'meetings', 'agents-kanban', 'memory', 'workspaces']);
```

- [ ] **Step 2: Run syntax check**

Run: `node --check static/panels.js`
Expected: no output (exit 0)

- [ ] **Step 3: Commit**

```bash
git add static/panels.js
git commit -m "feat(sidebar): add agents-kanban, memory, workspaces to NEO_SHELL_PANELS"
```

---

### Task 6: Verification

**Files:**
- No new files

- [ ] **Step 1: Run JS syntax checks on all modified files**

```bash
node --check static/agents_kanban.js
node --check static/panels.js
```

Expected: no output (exit 0) for both.

- [ ] **Step 2: Run existing pytest suite**

```bash
.venv/bin/python -m pytest -q
```

Expected: all tests pass.

- [ ] **Step 3: Run focused kanban tests if they exist**

```bash
.venv/bin/python -m pytest tests/ -k "kanban" -q 2>/dev/null || echo "No kanban-specific tests found"
```

- [ ] **Step 4: Run git diff check**

```bash
git diff --check
```

Expected: no output (no trailing whitespace or other issues).

- [ ] **Step 5: Verify zero hardcoded hex colors in agents-kanban CSS**

```bash
rg '#[0-9a-fA-F]{3,8}' static/style.css | grep 'agents-kanban' | grep -v 'A78BFA'
```

Expected: no matches (the only remaining hex in agents-kanban CSS should be `#A78BFA` for the "ready" violet, which has no design system variable).

- [ ] **Step 6: Verify zero `!important` in agents-kanban CSS**

```bash
rg '!important' static/style.css | grep 'agents-kanban'
```

Expected: no matches.

- [ ] **Step 7: Visual verification (manual)**

Start the local server and verify:

```bash
./neo.sh --isolated --port 8788 --no-browser
```

Open `http://127.0.0.1:8788` and check:
1. Navigate to "Kanban (Agentes)" — sidebar Neo should remain visible
2. Navigate to "Memory" — sidebar Neo should remain visible
3. Navigate to "Workspaces" — sidebar Neo should remain visible
4. In dark mode: columns, cards, modals should use navy/surface colors
5. In light mode: columns, cards, modals should use white/light colors
6. Priority chips: high=red, med=amber, low=muted
7. Column top borders: running=green, blocked=red, review=amber, done=green
