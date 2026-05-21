/* Neo Meetings panel — room creation, Jitsi embed, post-meeting flow. */

let _meetingsLoaded = false;
let _meetingsData = [];
let _activeMeeting = null;

async function loadMeetingsPanel() {
  const container = document.getElementById('meetingsContent');
  if (!container) return;
  try {
    const resp = await fetch('/api/meetings');
    const data = await resp.json();
    _meetingsData = data.meetings || [];
  } catch (e) {
    _meetingsData = [];
  }
  _meetingsLoaded = true;
  renderMeetingsPanel();
}

function renderMeetingsPanel() {
  const container = document.getElementById('meetingsContent');
  if (!container) return;

  if (_activeMeeting) {
    renderMeetingDetail(container);
    return;
  }

  let html = '';
  html += renderMeetingForm();

  if (_meetingsData.length === 0) {
    html += `<p class="meetings-empty" data-i18n="meetings_empty">${t('meetings_empty')}</p>`;
  } else {
    html += '<div class="meetings-list">';
    for (const m of _meetingsData) {
      html += renderMeetingCard(m);
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

function renderMeetingForm() {
  return `
    <div class="meetings-form" id="meetingsForm">
      <div class="meetings-form-row">
        <label for="meetingTitle">${t('title') || 'Title'}</label>
        <input type="text" id="meetingTitle" class="input" placeholder="Sprint Review, Briefing..." />
      </div>
      <div class="meetings-form-row">
        <label for="meetingProject" data-i18n="meetings_project">${t('meetings_project')}</label>
        <input type="text" id="meetingProject" class="input" placeholder="obreiro, brabus, 300..." />
      </div>
      <div class="meetings-form-row">
        <label for="meetingObjective" data-i18n="meetings_objective">${t('meetings_objective')}</label>
        <select id="meetingObjective" class="input">
          <option value="alinhamento">${t('meetings_obj_alinhamento')}</option>
          <option value="homologacao">${t('meetings_obj_homologacao')}</option>
          <option value="fechamento_sprint">${t('meetings_obj_fechamento_sprint')}</option>
          <option value="briefing">${t('meetings_obj_briefing')}</option>
          <option value="suporte">${t('meetings_obj_suporte')}</option>
          <option value="outro">${t('meetings_obj_outro')}</option>
        </select>
      </div>
      <div class="meetings-form-row">
        <label>${t('meetings_participants')}</label>
        <div class="meetings-participants-list" id="meetingsParticipantsList"></div>
        <button type="button" class="meetings-add-participant-btn" onclick="addParticipantRow()">+ ${t('meetings_add_participant')}</button>
      </div>
      <button class="neo-btn--primary" onclick="createMeetingFromForm()" data-i18n="meetings_generate_room">${t('meetings_generate_room')}</button>
    </div>
  `;
}

function addParticipantRow(data) {
  const list = document.getElementById('meetingsParticipantsList');
  if (!list) return;
  const p = data || { name: '', email: '', whatsapp: '', role: 'guest' };
  const row = document.createElement('div');
  row.className = 'meetings-participant-row';
  row.innerHTML = `
    <div class="meetings-participant-fields">
      <input type="text" class="input mp-name" placeholder="${t('meetings_participant_name')}" value="${_mesc(p.name)}" required />
      <input type="email" class="input mp-email" placeholder="${t('meetings_participant_email')}" value="${_mesc(p.email)}" />
      <input type="text" class="input mp-whatsapp" placeholder="${t('meetings_participant_whatsapp')}" value="${_mesc(p.whatsapp)}" />
      <select class="input mp-role">
        <option value="guest"${p.role === 'guest' ? ' selected' : ''}>${t('meetings_role_guest')}</option>
        <option value="client"${p.role === 'client' ? ' selected' : ''}>${t('meetings_role_client')}</option>
        <option value="team"${p.role === 'team' ? ' selected' : ''}>${t('meetings_role_team')}</option>
        <option value="host"${p.role === 'host' ? ' selected' : ''}>${t('meetings_role_host')}</option>
      </select>
    </div>
    <button type="button" class="meetings-participant-remove" onclick="this.closest('.meetings-participant-row').remove()" title="${t('meetings_participant_remove')}">×</button>
  `;
  list.appendChild(row);
}

function getParticipantsFromForm() {
  const rows = document.querySelectorAll('#meetingsParticipantsList .meetings-participant-row');
  const participants = [];
  rows.forEach(row => {
    const name = row.querySelector('.mp-name')?.value?.trim();
    if (!name) return;
    participants.push({
      name,
      email: row.querySelector('.mp-email')?.value?.trim() || '',
      whatsapp: row.querySelector('.mp-whatsapp')?.value?.trim() || '',
      role: row.querySelector('.mp-role')?.value || 'guest',
    });
  });
  return participants;
}

function renderMeetingCard(meeting) {
  const statusKey = 'meetings_status_' + meeting.status;
  const statusLabel = t(statusKey) || meeting.status;
  const date = formatMeetingDate(meeting.created_at);
  return `
    <div class="meetings-card meetings-card--${meeting.status}" data-meeting-id="${meeting.id}" onclick="openMeetingDetails('${meeting.id}')" tabindex="0" role="button" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMeetingDetails('${meeting.id}')}">
      <div class="meetings-card-header">
        <strong>${_mesc(meeting.title)}</strong>
        <span class="meetings-card-status badge badge--${meeting.status}">${statusLabel}</span>
      </div>
      <div class="meetings-card-meta">
        <span>${_mesc(meeting.project)}</span> · <span>${date}</span>
      </div>
      <div class="meetings-card-actions">
        <button class="btn btn-sm" onclick="event.stopPropagation();openMeetingDetails('${meeting.id}')">${t('meetings_details')}</button>
        ${meeting.status === 'planned' ? `<button class="btn btn-sm" onclick="event.stopPropagation();joinMeeting('${meeting.id}')">▶ ${t('meetings_generate_room')}</button>` : ''}
      </div>
    </div>
  `;
}

function formatMeetingDate(value) {
  if (!value) return '—';
  try {
    return new Date(value * 1000).toLocaleString();
  } catch (e) {
    return '—';
  }
}

function _mesc(str) {
  const el = document.createElement('span');
  el.textContent = str || '';
  return el.innerHTML;
}

async function createMeetingFromForm() {
  const title = document.getElementById('meetingTitle')?.value?.trim();
  const project = document.getElementById('meetingProject')?.value?.trim();
  const objective = document.getElementById('meetingObjective')?.value || 'alinhamento';
  const participants = getParticipantsFromForm();

  if (!title || !project) {
    if (typeof showToast === 'function') showToast('Title and project required', 2500, 'warning');
    return;
  }

  const roomWindow = openMeetingWindowPlaceholder();
  try {
    const resp = await fetch('/api/meetings/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, project, objective, participants }),
    });
    const data = await resp.json();
    if (data.ok) {
      _activeMeeting = data.meeting;
      await startAndOpen(data.meeting, roomWindow);
    } else {
      closeMeetingWindowPlaceholder(roomWindow);
      if (typeof showToast === 'function') showToast(data.error || 'Error', 2500, 'error');
    }
  } catch (e) {
    closeMeetingWindowPlaceholder(roomWindow);
    if (typeof showToast === 'function') showToast('Network error', 2500, 'error');
  }
}

async function joinMeeting(meetingId) {
  const roomWindow = openMeetingWindowPlaceholder();
  try {
    const resp = await fetch(`/api/meetings/${meetingId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await resp.json();
    if (data.ok) {
      _activeMeeting = data.meeting;
      openMeetingRoom(data.meeting, roomWindow);
      renderMeetingsPanel();
    } else {
      closeMeetingWindowPlaceholder(roomWindow);
    }
  } catch (e) {
    closeMeetingWindowPlaceholder(roomWindow);
    if (typeof showToast === 'function') showToast('Error starting meeting', 2500, 'error');
  }
}

function openMeetingWindowPlaceholder() {
  try {
    const roomWindow = window.open('', '_blank');
    if (roomWindow) {
      roomWindow.document.title = 'Neo Meeting';
      roomWindow.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Abrindo reunião...</p>';
    }
    return roomWindow;
  } catch (e) {
    return null;
  }
}

function closeMeetingWindowPlaceholder(roomWindow) {
  try {
    if (roomWindow && !roomWindow.closed) roomWindow.close();
  } catch (e) { /* ignore */ }
}

function openMeetingRoom(meeting, roomWindow) {
  if (!meeting?.room_url) return false;
  try {
    if (roomWindow && !roomWindow.closed) {
      roomWindow.opener = null;
      roomWindow.location.href = meeting.room_url;
      roomWindow.focus();
      return true;
    }
    const opened = window.open(meeting.room_url, '_blank', 'noopener,noreferrer');
    if (opened) return true;
  } catch (e) { /* ignore */ }
  if (typeof showToast === 'function') showToast(t('meetings_popup_blocked'), 3500, 'warning');
  return false;
}

async function startAndOpen(meeting, roomWindow) {
  try {
    await fetch(`/api/meetings/${meeting.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    _activeMeeting.status = 'active';
  } catch (e) { /* proceed anyway */ }
  openMeetingRoom(_activeMeeting || meeting, roomWindow);
  renderMeetingsPanel();
}

function renderMeetingDetail(container) {
  const m = _activeMeeting;
  if (!m) return;
  const statusKey = 'meetings_status_' + m.status;
  const statusLabel = t(statusKey) || m.status;
  const objectiveLabel = t('meetings_obj_' + m.objective) || m.objective;
  const participants = m.participants || [];

  container.innerHTML = `
    <div class="meetings-detail">
      <div class="meetings-detail-toolbar">
        <button class="btn" onclick="closeMeetingView()">← ${t('tab_meetings')}</button>
        <span class="meetings-detail-hint">${t('meetings_detail_hint')}</span>
      </div>

      <section class="meetings-detail-hero meetings-detail-hero--${m.status}">
        <div>
          <p class="meetings-detail-eyebrow">${t('meetings_detail_title')}</p>
          <h3>${_mesc(m.title)}</h3>
          <p>${_mesc(m.project)} · ${objectiveLabel}</p>
        </div>
        <span class="meetings-card-status badge badge--${m.status}">${statusLabel}</span>
      </section>

      <div class="meetings-detail-grid">
        ${renderMeetingDetailMetric(t('meetings_created_at'), formatMeetingDate(m.created_at))}
        ${renderMeetingDetailMetric(t('meetings_started_at'), formatMeetingDate(m.started_at))}
        ${renderMeetingDetailMetric(t('meetings_finished_at'), formatMeetingDate(m.finished_at))}
        ${renderMeetingDetailMetric(t('meetings_participants'), String(participants.length || 0))}
      </div>

      ${renderParticipantsBlock(participants)}
      ${renderMeetingStatePanel(m)}
    </div>
  `;
}

function renderMeetingDetailMetric(label, value) {
  return `
    <div class="meetings-detail-metric">
      <span>${label}</span>
      <strong>${_mesc(value)}</strong>
    </div>
  `;
}

function renderParticipantsBlock(participants) {
  if (!participants || participants.length === 0) {
    return `
      <section class="meetings-detail-section">
        <h4>${t('meetings_participants')}</h4>
        <p class="meetings-muted">${t('meetings_no_participants')}</p>
      </section>
    `;
  }
  return `
    <section class="meetings-detail-section">
      <h4>${t('meetings_participants')}</h4>
      <div class="meetings-detail-participants">
        ${participants.map(renderParticipantChip).join('')}
      </div>
    </section>
  `;
}

function renderParticipantChip(participant) {
  const p = typeof participant === 'string'
    ? { name: participant, email: '', whatsapp: '', role: 'guest' }
    : participant;
  const role = t('meetings_role_' + (p.role || 'guest')) || p.role || 'guest';
  const contacts = [p.email, p.whatsapp].filter(Boolean).map(_mesc).join(' · ');
  return `
    <div class="meetings-detail-participant">
      <strong>${_mesc(p.name)}</strong>
      <span>${role}${contacts ? ' · ' + contacts : ''}</span>
    </div>
  `;
}

function renderMeetingStatePanel(m) {
  if (m.status === 'planned') {
    return `
      <section class="meetings-state-panel">
        <div>
          <h4>${t('meetings_planned_title')}</h4>
          <p>${t('meetings_planned_desc')}</p>
        </div>
        <button class="neo-btn--primary" onclick="joinMeeting('${m.id}')">▶ ${t('meetings_generate_room')}</button>
      </section>
    `;
  }

  if (m.status === 'active') {
    return `
      <section class="meetings-state-panel meetings-state-panel--active">
        <div>
          <h4>${t('meetings_external_title')}</h4>
          <p>${t('meetings_external_desc')}</p>
        </div>
        <div class="meetings-active-actions">
          <a href="${_mesc(m.room_url)}" target="_blank" rel="noopener" class="btn-sm">${t('meetings_open_tab')}</a>
          <button class="btn-sm btn-danger" onclick="endCurrentMeeting()">⏹ ${t('meetings_end')}</button>
        </div>
      </section>
      <div class="meetings-external-room" id="meetingsExternalRoom">
        <div class="meetings-external-icon">↗</div>
        <h4>${t('meetings_external_title')}</h4>
        <p>${t('meetings_external_desc')}</p>
        <a href="${_mesc(m.room_url)}" target="_blank" rel="noopener" class="neo-btn--primary">${t('meetings_open_tab')}</a>
      </div>
    `;
  }

  if (m.status === 'finished' || m.status === 'processed') {
    return `
      <section class="meetings-state-panel meetings-state-panel--post">
        <div>
          <h4>${t('meetings_post_title')}</h4>
          <p>${t('meetings_post_desc')}</p>
        </div>
        <div class="meetings-post-actions">
          <button class="btn" onclick="generateMeetingSummary()">📝 ${t('meetings_post_summary')}</button>
          <button class="btn" onclick="saveMeetingToObsidian()" disabled title="Phase 2">📓 ${t('meetings_post_obsidian')}</button>
          <button class="btn" onclick="createMeetingJiraTask()" disabled title="Phase 2">🎫 ${t('meetings_post_jira')}</button>
        </div>
      </section>
      <div id="meetingsSummaryOutput" class="meetings-summary-output"></div>
    `;
  }

  return '';
}

async function endCurrentMeeting() {
  if (!_activeMeeting) return;
  try {
    const resp = await fetch(`/api/meetings/${_activeMeeting.id}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await resp.json();
    if (data.ok) {
      _activeMeeting = data.meeting;
      renderMeetingsPanel();
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast('Error ending meeting', 2500, 'error');
  }
}

function openMeetingDetails(meetingId) {
  const meeting = _meetingsData.find(m => m.id === meetingId);
  if (meeting) {
    _activeMeeting = meeting;
    renderMeetingsPanel();
  }
}

function openPostMeeting(meetingId) {
  openMeetingDetails(meetingId);
}

function generateMeetingSummary() {
  if (!_activeMeeting) return;
  const participantNames = (_activeMeeting.participants || [])
    .map(p => typeof p === 'string' ? p : p?.name)
    .filter(Boolean)
    .join(', ');
  const prompt = `Reunião "${_activeMeeting.title}" (projeto: ${_activeMeeting.project}, objetivo: ${_activeMeeting.objective}) acaba de terminar. ` +
    `Participantes: ${participantNames || 'não informados'}. ` +
    `Gere um resumo estruturado com: 1) Resumo objetivo, 2) Decisões tomadas, 3) Pendências e responsáveis, 4) Tarefas candidatas para Jira, 5) Próximos passos.`;

  if (typeof switchPanel === 'function') switchPanel('chat');
  setTimeout(() => {
    const input = document.getElementById('msg');
    if (input) {
      input.value = prompt;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof showToast === 'function') showToast(t('meetings_post_summary'), 2000, 'info');
    }
  }, 300);
}

function saveMeetingToObsidian() {
  if (typeof showToast === 'function') showToast('Phase 2 — not yet implemented', 2500, 'info');
}

function createMeetingJiraTask() {
  if (typeof showToast === 'function') showToast('Phase 2 — not yet implemented', 2500, 'info');
}

function closeMeetingView() {
  _activeMeeting = null;
  loadMeetingsPanel();
}

function showMeetingForm() {
  _activeMeeting = null;
  renderMeetingsPanel();
  setTimeout(() => {
    document.getElementById('meetingTitle')?.focus();
  }, 100);
}
