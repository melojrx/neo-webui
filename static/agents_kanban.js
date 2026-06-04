/* NEO — Agents Kanban panel.
 *
 * Renders the Hermes runtime kanban (multi-agent task board) inside the
 * WebUI custom.  Data flows from `/api/agents-kanban/*` (defined in
 * `api/agents_kanban.py`), which talks to the same SQLite the dispatcher
 * uses — so the view reflects the actual state of in-flight agent work.
 *
 * Architecture: a single `loadAgentsKanbanPanel()` call refreshes the
 * board.  It is also re-run after every create / status / comment / delete
 * action.  No persistent client state; the server is the source of truth.
 *
 * The status columns mirror `kanban_db.VALID_STATUSES`.  Order here is the
 * visual flow (left → right), not the runtime's lexicographic order.
 */

(function () {
  'use strict';

  // Visual column order — matches the dispatcher's mental model.
  const STATUS_COLUMNS = [
    { key: 'triage', label: 'Triagem' },
    { key: 'todo', label: 'A Fazer' },
    { key: 'scheduled', label: 'Agendado' },
    { key: 'ready', label: 'Pronto' },
    { key: 'running', label: 'Rodando' },
    { key: 'blocked', label: 'Bloqueado' },
    { key: 'review', label: 'Revisão' },
    { key: 'done', label: 'Concluído' },
    { key: 'archived', label: 'Arquivado' },
  ];

  // Local cache so we can re-render without re-fetching on every modal close.
  let _state = {
    boards: [],
    selectedBoard: null,
    tasksByStatus: {},
    stats: null,
    currentTaskId: null,
  };

  function $(id) { return document.getElementById(id); }

  function _show(id) { const el = $(id); if (el) el.hidden = false; }
  function _hide(id) { const el = $(id); if (el) el.hidden = true; }

  function _escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _timeAgo(unix) {
    if (!unix) return '—';
    const d = new Date(unix * 1000);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'agora';
    if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  async function _fetchJson(url, opts) {
    opts = opts || {};
    const init = { credentials: 'same-origin', headers: {} };
    if (opts.body != null) {
      init.method = 'POST';
      init.headers['Content-Type'] = 'application/json';
      // CSRF: same-origin POST, server enforces token via cookie.
      const csrf = document.cookie.split(';').map(s => s.trim())
        .find(s => s.startsWith('hermes_csrf='));
      if (csrf) {
        const token = csrf.split('=')[1];
        init.headers['X-CSRF-Token'] = token;
      }
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    const r = await fetch(url, init);
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) {
      const msg = (data && (data.error || data.detail)) || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function loadAgentsKanbanPanel() {
    try {
      const data = await _fetchJson('/api/agents-kanban/boards');
      _state.boards = (data && data.boards) || [];
      const select = $('agentsKanbanBoardSelect');
      if (select) {
        const prev = _state.selectedBoard;
        select.innerHTML = '';
        for (const b of _state.boards) {
          const opt = document.createElement('option');
          opt.value = b.slug;
          opt.textContent = b.display_name || b.slug;
          select.appendChild(opt);
        }
        _state.selectedBoard = prev && _state.boards.find(b => b.slug === prev)
          ? prev
          : (data.default_board || (_state.boards[0] && _state.boards[0].slug));
        if (_state.selectedBoard) select.value = _state.selectedBoard;
      }
      await _refreshBoard();
    } catch (e) {
      console.error('[agents-kanban] load failed', e);
      const board = $('agentsKanbanBoard');
      if (board) {
        board.innerHTML = `<div class="agents-kanban-error" role="alert">Falha ao carregar: ${_escapeHtml(e.message)}</div>`;
      }
    }
  }

  async function _refreshBoard() {
    if (!_state.selectedBoard) return;
    try {
      const [stats, list] = await Promise.all([
        _fetchJson(`/api/agents-kanban/stats?board=${encodeURIComponent(_state.selectedBoard)}`),
        _fetchJson(`/api/agents-kanban/tasks?board=${encodeURIComponent(_state.selectedBoard)}&limit=200`),
      ]);
      _state.stats = stats;
      _state.tasksByStatus = {};
      for (const col of STATUS_COLUMNS) _state.tasksByStatus[col.key] = [];
      for (const t of (list.tasks || [])) {
        const arr = _state.tasksByStatus[t.status] || (_state.tasksByStatus[t.status] = []);
        arr.push(t);
      }
      _renderStats();
      _renderBoard();
    } catch (e) {
      console.error('[agents-kanban] refresh failed', e);
    }
  }

  function _renderStats() {
    const s = _state.stats || {};
    const bs = (s.by_status) || {};
    $('agentsKanbanStatTotal').textContent = s.total != null ? s.total : '—';
    $('agentsKanbanStatRunning').textContent = bs.running != null ? bs.running : '0';
    $('agentsKanbanStatReady').textContent = bs.ready != null ? bs.ready : '0';
    $('agentsKanbanStatDone').textContent = bs.done != null ? bs.done : '0';
  }

  function _renderBoard() {
    const root = $('agentsKanbanBoard');
    if (!root) return;
    const totalTasks = STATUS_COLUMNS.reduce((n, c) => n + (_state.tasksByStatus[c.key] || []).length, 0);
    const empty = $('agentsKanbanEmpty');
    if (empty) empty.hidden = totalTasks > 0;
    // Wipe & rebuild columns (cheap — ≤200 cards). We preserve modals.
    const modals = root.querySelectorAll('.agents-kanban-modal-backdrop');
    root.innerHTML = '';
    for (const m of modals) root.appendChild(m);
    for (const col of STATUS_COLUMNS) {
      const tasks = _state.tasksByStatus[col.key] || [];
      const el = document.createElement('section');
      el.className = 'agents-kanban-column';
      el.dataset.status = col.key;
      el.innerHTML = `
        <header class="agents-kanban-col-header">
          <span class="agents-kanban-col-title">${_escapeHtml(col.label)}</span>
          <span class="agents-kanban-col-count">${tasks.length}</span>
        </header>
        <div class="agents-kanban-col-body" data-status="${col.key}">
          ${tasks.map(_renderCard).join('') || '<div class="agents-kanban-col-empty">vazio</div>'}
        </div>
      `;
      root.appendChild(el);
    }
    _wireDragAndDrop();
    _wireCardClicks();
  }

  function _renderCard(t) {
    const priority = t.priority || 0;
    const priorityClass = priority >= 7 ? 'high' : priority >= 4 ? 'med' : 'low';
    return `
      <article class="agents-kanban-card" draggable="true" data-task-id="${_escapeHtml(t.id)}">
        <div class="agents-kanban-card-head">
          <span class="agents-kanban-card-priority ${priorityClass}">P${priority}</span>
          <span class="agents-kanban-card-id">${_escapeHtml(t.id)}</span>
        </div>
        <div class="agents-kanban-card-title">${_escapeHtml(t.title)}</div>
        <div class="agents-kanban-card-meta">
          <span class="agents-kanban-card-assignee">${_escapeHtml(t.assignee || 'não atribuído')}</span>
          <span class="agents-kanban-card-time">${_escapeHtml(_timeAgo(t.created_at))}</span>
        </div>
      </article>
    `;
  }

  function _wireCardClicks() {
    const root = $('agentsKanbanBoard');
    if (!root) return;
    root.querySelectorAll('.agents-kanban-card').forEach(card => {
      card.addEventListener('click', () => _openTaskDetail(card.dataset.taskId));
    });
  }

  function _wireDragAndDrop() {
    const root = $('agentsKanbanBoard');
    if (!root) return;
    let draggedId = null;
    root.querySelectorAll('.agents-kanban-card').forEach(card => {
      card.addEventListener('dragstart', (ev) => {
        draggedId = card.dataset.taskId;
        ev.dataTransfer.effectAllowed = 'move';
        ev.dataTransfer.setData('text/plain', draggedId);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        draggedId = null;
      });
    });
    root.querySelectorAll('.agents-kanban-col-body').forEach(body => {
      body.addEventListener('dragover', (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        body.classList.add('drag-over');
      });
      body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
      body.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        body.classList.remove('drag-over');
        const taskId = ev.dataTransfer.getData('text/plain') || draggedId;
        const newStatus = body.dataset.status;
        if (!taskId || !newStatus) return;
        await _setStatus(taskId, newStatus);
      });
    });
  }

  async function _setStatus(taskId, newStatus) {
    try {
      const r = await _fetchJson(`/api/agents-kanban/tasks/${encodeURIComponent(taskId)}`, {
        body: { status: newStatus },
      });
      if (r && r.error) {
        alert(`Não foi possível mover a task: ${r.error}`);
      }
    } catch (e) {
      alert(`Erro ao mover: ${e.message}`);
    } finally {
      await _refreshBoard();
    }
  }

  function _openNewTaskModal() {
    _show('agentsKanbanModal');
    const titleInput = document.querySelector('#agentsKanbanForm input[name="title"]');
    if (titleInput) titleInput.focus();
  }

  function _closeNewTaskModal() {
    _hide('agentsKanbanModal');
    const form = $('agentsKanbanForm');
    if (form) form.reset();
  }

  async function _submitNewTask(ev) {
    ev.preventDefault();
    const form = ev.target;
    const fd = new FormData(form);
    const payload = {
      title: (fd.get('title') || '').toString().trim(),
      body: (fd.get('body') || '').toString(),
      assignee: (fd.get('assignee') || '').toString().trim(),
      priority: parseInt((fd.get('priority') || '0').toString(), 10) || 0,
      board: _state.selectedBoard,
      created_by: 'neo-webui',
    };
    if (!payload.title) {
      alert('Título é obrigatório');
      return;
    }
    try {
      const r = await _fetchJson('/api/agents-kanban/tasks', { body: payload });
      if (r && r.error) throw new Error(r.error);
      _closeNewTaskModal();
    } catch (e) {
      alert(`Erro ao criar: ${e.message}`);
    } finally {
      await _refreshBoard();
    }
  }

  async function _openTaskDetail(taskId) {
    _state.currentTaskId = taskId;
    const r = await _fetchJson(`/api/agents-kanban/tasks/${encodeURIComponent(taskId)}`);
    if (r && r.error) {
      alert(`Task não encontrada: ${r.error}`);
      return;
    }
    $('agentsKanbanDetailTitle').textContent = r.title;
    const body = $('agentsKanbanDetailBody');
    body.innerHTML = `
      <div class="agents-kanban-detail-grid">
        <div><span class="lbl">ID</span><span>${_escapeHtml(r.id)}</span></div>
        <div><span class="lbl">Status</span><span>${_escapeHtml(r.status)}</span></div>
        <div><span class="lbl">Assignee</span><span>${_escapeHtml(r.assignee || '—')}</span></div>
        <div><span class="lbl">Prioridade</span><span>P${r.priority}</span></div>
        <div><span class="lbl">Worker PID</span><span>${_escapeHtml(r.worker_pid || '—')}</span></div>
        <div><span class="lbl">Board</span><span>${_escapeHtml(r.board || '—')}</span></div>
        <div><span class="lbl">Criada</span><span>${_escapeHtml(_timeAgo(r.created_at))}</span></div>
        <div><span class="lbl">Iniciada</span><span>${_escapeHtml(_timeAgo(r.started_at))}</span></div>
        <div><span class="lbl">Concluída</span><span>${_escapeHtml(_timeAgo(r.completed_at))}</span></div>
        <div><span class="lbl">Falhas seguidas</span><span>${r.consecutive_failures || 0}</span></div>
      </div>
      <div class="agents-kanban-detail-section">
        <h3>Descrição</h3>
        <pre>${_escapeHtml(r.body || '(sem descrição)')}</pre>
      </div>
      <div class="agents-kanban-detail-section">
        <h3>Skills</h3>
        <div>${(r.skills && r.skills.length) ? r.skills.map(_escapeHtml).join(', ') : '(nenhuma)'}</div>
      </div>
      <div class="agents-kanban-detail-section">
        <h3>Comentários</h3>
        <div id="agentsKanbanComments">carregando…</div>
        <form id="agentsKanbanCommentForm" class="agents-kanban-comment-form">
          <input type="text" name="body" placeholder="Adicionar comentário" required />
          <button type="submit" class="neo-btn neo-btn-secondary">Comentar</button>
        </form>
      </div>
      <div class="agents-kanban-detail-section">
        <h3>Eventos</h3>
        <div id="agentsKanbanEvents">carregando…</div>
      </div>
      <footer class="agents-kanban-modal-footer">
        <button type="button" class="neo-btn neo-btn-danger" id="agentsKanbanDeleteBtn">Excluir</button>
        <span class="flex-spacer"></span>
        <button type="button" class="neo-btn neo-btn-secondary" data-agents-kanban-detail-close>Fechar</button>
      </footer>
    `;
    _show('agentsKanbanDetail');
    // Wire detail-level handlers
    const closeEls = body.parentElement.querySelectorAll('[data-agents-kanban-detail-close]');
    closeEls.forEach(el => el.addEventListener('click', _closeTaskDetail));
    const commentForm = $('agentsKanbanCommentForm');
    if (commentForm) commentForm.addEventListener('submit', _submitComment);
    const deleteBtn = $('agentsKanbanDeleteBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', _deleteCurrentTask);
    // Lazy load
    _loadComments(taskId);
    _loadEvents(taskId);
  }

  function _closeTaskDetail() {
    _state.currentTaskId = null;
    _hide('agentsKanbanDetail');
  }

  async function _loadComments(taskId) {
    const target = $('agentsKanbanComments');
    if (!target) return;
    try {
      const r = await _fetchJson(`/api/agents-kanban/comments/${encodeURIComponent(taskId)}`);
      if (!r.comments || !r.comments.length) {
        target.innerHTML = '<em>(sem comentários)</em>';
        return;
      }
      target.innerHTML = r.comments.map(c => `
        <div class="agents-kanban-comment">
          <div class="agents-kanban-comment-meta">
            <strong>${_escapeHtml(c.author)}</strong>
            <span>${_escapeHtml(_timeAgo(c.created_at))}</span>
          </div>
          <div class="agents-kanban-comment-body">${_escapeHtml(c.body)}</div>
        </div>
      `).join('');
    } catch (e) {
      target.innerHTML = `<em>erro: ${_escapeHtml(e.message)}</em>`;
    }
  }

  async function _loadEvents(taskId) {
    const target = $('agentsKanbanEvents');
    if (!target) return;
    try {
      const r = await _fetchJson(`/api/agents-kanban/events/${encodeURIComponent(taskId)}&limit=50`);
      if (!r.events || !r.events.length) {
        target.innerHTML = '<em>(sem eventos)</em>';
        return;
      }
      target.innerHTML = r.events.map(e => `
        <div class="agents-kanban-event">
          <span class="kind">${_escapeHtml(e.kind)}</span>
          <span class="time">${_escapeHtml(_timeAgo(e.created_at))}</span>
        </div>
      `).join('');
    } catch (e) {
      target.innerHTML = `<em>erro: ${_escapeHtml(e.message)}</em>`;
    }
  }

  async function _submitComment(ev) {
    ev.preventDefault();
    if (!_state.currentTaskId) return;
    const fd = new FormData(ev.target);
    const body = (fd.get('body') || '').toString().trim();
    if (!body) return;
    try {
      await _fetchJson(`/api/agents-kanban/comments/${encodeURIComponent(_state.currentTaskId)}`, {
        body: { body, author: 'neo-webui' },
      });
      ev.target.reset();
      await _loadComments(_state.currentTaskId);
    } catch (e) {
      alert(`Erro ao comentar: ${e.message}`);
    }
  }

  async function _deleteCurrentTask() {
    if (!_state.currentTaskId) return;
    if (typeof showConfirmDialog === 'function') {
      const ok = await showConfirmDialog({
        message: 'Excluir esta task? Esta ação não pode ser desfeita.',
        confirmLabel: 'Excluir',
        danger: true,
        focusCancel: true,
      });
      if (!ok) return;
    } else {
      return;
    }
    try {
      const r = await _fetchJson(
        `/api/agents-kanban/tasks/${encodeURIComponent(_state.currentTaskId)}/delete`,
        { body: {} }
      );
      if (r && r.error) throw new Error(r.error);
      _closeTaskDetail();
    } catch (e) {
      alert(`Erro ao excluir: ${e.message}`);
    } finally {
      await _refreshBoard();
    }
  }

  // Boot wiring — runs once when the script loads.
  document.addEventListener('DOMContentLoaded', () => {
    const select = $('agentsKanbanBoardSelect');
    if (select) {
      select.addEventListener('change', () => {
        _state.selectedBoard = select.value;
        _refreshBoard();
      });
    }
    const refresh = $('agentsKanbanRefreshBtn');
    if (refresh) refresh.addEventListener('click', () => _refreshBoard());
    const newBtn = $('agentsKanbanNewBtn');
    if (newBtn) newBtn.addEventListener('click', _openNewTaskModal);
    const form = $('agentsKanbanForm');
    if (form) form.addEventListener('submit', _submitNewTask);
    document.querySelectorAll('[data-agents-kanban-close]').forEach(el => {
      el.addEventListener('click', _closeNewTaskModal);
    });
  });

  // Expose for the panel switcher.
  window.loadAgentsKanbanPanel = loadAgentsKanbanPanel;
})();
