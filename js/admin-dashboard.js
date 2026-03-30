/**
 * js/admin-dashboard.js
 * SYKLO KYC — Panel de Control (Conectado a Firebase Real)
 */

import { db, storage, auth } from './firebase-config.js';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── STATE ──
let allSubmissions = [];
let filteredSubmissions = [];
let activeFilter = 'all';
let activeUserId = null;
let searchQuery = '';

// ── DOM REFERENCES ──
const searchInput = document.getElementById('search-input');
const submissionsList = document.getElementById('submissions-list');
const listEmpty = document.getElementById('list-empty');
const profileCard = document.getElementById('profile-card');
const detailPlaceholder = document.getElementById('detail-placeholder');

document.addEventListener('syklo:admin-ready', () => {
  initDashboard();
});

function initDashboard() {
  loadSubmissions();
  initSearch();
  initFilters();
  initProfileTabs();
  initVerificationActions();
  initRiskManagement();
  initSidebarNavigation(); // NUEVO: navegación entre vistas del sidebar
}

// ── NAVEGACIÓN GLOBAL DEL SIDEBAR ──
// CAMBIO 1: Maneja los clics en .sidebar__link, actualiza la clase activa
// y muestra únicamente la vista (.dash-view) correspondiente al data-view.
function initSidebarNavigation() {
  document.querySelectorAll('.sidebar__link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = link.dataset.view;
      if (!targetView) return;

      // Actualizar clase activa en el sidebar
      document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('sidebar__link--active'));
      link.classList.add('sidebar__link--active');

      // Mostrar sólo la vista correspondiente
      document.querySelectorAll('.dash-view').forEach(view => {
        view.classList.toggle('hidden', view.id !== `view-${targetView}`);
      });
    });
  });
}

// ── 1. CARGA EN TIEMPO REAL DESDE FIRESTORE ──
function loadSubmissions() {
  const q = query(collection(db, 'users'), orderBy('submittedAt', 'desc'));

  onSnapshot(q, (snapshot) => {
    allSubmissions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    applyFiltersAndSearch();
    updateStats();
    renderGlobalSanctions(); // CAMBIO 4: reactividad en tiempo real para el panel de sanciones
  }, (error) => {
    console.error('[Dashboard] Error cargando solicitudes:', error);
  });
}

function initSearch() {
  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFiltersAndSearch();
  });
}

function initFilters() {
  document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('pill--active'));
      pill.classList.add('pill--active');
      activeFilter = pill.dataset.filter || 'all';
      applyFiltersAndSearch();
    });
  });
}

function applyFiltersAndSearch() {
  filteredSubmissions = allSubmissions.filter(user => {
    const matchesFilter = activeFilter === 'all' || user.status === activeFilter;
    const matchesSearch = !searchQuery
      || user.username?.toLowerCase().includes(searchQuery)
      || user.docNumber?.toLowerCase().includes(searchQuery)
      || user.fullName?.toLowerCase().includes(searchQuery);
    return matchesFilter && matchesSearch;
  });
  renderList(filteredSubmissions);
  updateCount(filteredSubmissions.length);
}

function renderList(submissions) {
  if (!submissionsList) return;
  submissionsList.querySelectorAll('.user-card').forEach(c => c.remove());

  if (submissions.length === 0) {
    listEmpty?.classList.remove('hidden');
    return;
  }
  listEmpty?.classList.add('hidden');

  submissions.forEach(user => {
    const card = document.createElement('div');
    card.className = `user-card ${user.id === activeUserId ? 'user-card--active' : ''}`;
    card.dataset.userId = user.id;
    const initials = (user.fullName || user.username || '?').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();

    card.innerHTML = `
      <div class="user-card__avatar">${initials}</div>
      <div class="user-card__info">
        <div class="user-card__name">${user.fullName || '—'}</div>
        <div class="user-card__username">@${user.username || '—'}</div>
        <div class="user-card__doc font-mono">${user.docNumber || '—'}</div>
      </div>
      <div class="user-card__status"><span class="status-badge status-badge--${user.status}">${user.status}</span></div>
    `;
    card.addEventListener('click', () => selectUser(user.id));
    submissionsList.appendChild(card);
  });
}

function selectUser(userId) {
  activeUserId = userId;
  submissionsList?.querySelectorAll('.user-card').forEach(c => {
    c.classList.toggle('user-card--active', c.dataset.userId === userId);
  });
  const user = allSubmissions.find(u => u.id === userId);
  if (user) renderProfile(user);
}

function renderProfile(user) {
  detailPlaceholder?.classList.add('hidden');
  profileCard?.classList.remove('hidden');

  setEl('profile-avatar', (user.fullName || '?').charAt(0).toUpperCase());
  setEl('profile-name', user.fullName);
  setEl('profile-username', `@${user.username}`);

  const statusEl = document.getElementById('profile-status-badge');
  if (statusEl) statusEl.className = `status-badge status-badge--${user.status}`;
  if (statusEl) statusEl.textContent = user.status;

  setEl('pi-fullname', user.fullName);
  setEl('pi-doc', user.docNumber);
  setEl('pi-dob', user.dob);
  setEl('pi-age', `${user.age} años`);
  setEl('pi-nationality', user.nationality);
  setEl('pi-email', user.email);
  setEl('pi-phone', user.phone);
  setEl('pi-id', user.submissionId || user.id);

  updateVerificationButtons(user.status);
  renderDocPreview('admin-doc-preview', 'admin-doc-download', user.docFileURL, 'image');
  renderDocPreview('admin-selfie-preview', 'admin-selfie-download', user.selfieFileURL, 'image');

  renderNotes(user.notes || []);
  renderSanctions(user.sanctions || []);
  activateTab('info');
}

function renderDocPreview(previewId, downloadId, url, type) {
  const wrap = document.getElementById(previewId);
  const link = document.getElementById(downloadId);
  if (!wrap) return;

  if (!url) {
    wrap.innerHTML = '<div class="doc-loading">Sin archivo</div>';
    if (link) link.style.display = 'none';
    return;
  }

  if (link) { link.href = url; link.style.display = 'block'; }
  const isVideo = url.includes('.mp4') || type === 'video';

  wrap.innerHTML = isVideo
    ? `<video src="${url}" controls muted style="max-height:160px;border-radius:var(--radius-sm);"></video>`
    : `<img src="${url}" style="max-height:160px;border-radius:var(--radius-sm);" />`;
}

function initProfileTabs() {
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });
}

function activateTab(tabName) {
  document.querySelectorAll('.profile-tab').forEach(t => t.classList.toggle('profile-tab--active', t.dataset.tab === tabName));
  document.querySelectorAll('.profile-tab-content').forEach(c => c.classList.toggle('hidden', c.id !== `tab-${tabName}`));
}

// ── 2. ACTUALIZAR ESTADOS (APROBAR/RECHAZAR) ──
function initVerificationActions() {
  document.getElementById('btn-approve')?.addEventListener('click', () => updateUserStatus('approved'));
  document.getElementById('btn-reject')?.addEventListener('click', () => updateUserStatus('rejected'));
}

async function updateUserStatus(newStatus) {
  if (!activeUserId) return;
  const actionAlert = document.getElementById('action-alert');

  try {
    const userRef = doc(db, 'users', activeUserId);
    await updateDoc(userRef, {
      status: newStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser?.email
    });

    actionAlert.textContent = newStatus === 'approved' ? '✓ KYC aprobado.' : '✗ KYC rechazado.';
    actionAlert.className = `form-alert form-alert--sm is-${newStatus === 'approved' ? 'success' : 'error'}`;
    actionAlert.style.display = 'flex';

    // CAMBIO 2: Corrección del desfase de estado — actualizar el badge del perfil
    // inmediatamente sin esperar al próximo ciclo de onSnapshot.
    const statusBadge = document.getElementById('profile-status-badge');
    if (statusBadge) {
      statusBadge.className = `status-badge status-badge--${newStatus}`;
      statusBadge.textContent = newStatus;
    }
    updateVerificationButtons(newStatus);

  } catch (error) {
    console.error('Error actualizando estado:', error);
  }
}

function updateVerificationButtons(status) {
  const approveBtn = document.getElementById('btn-approve');
  const rejectBtn = document.getElementById('btn-reject');
  if (approveBtn) approveBtn.disabled = status === 'approved';
  if (rejectBtn) rejectBtn.disabled = status === 'rejected';
}

// ── 3. NOTAS Y SANCIONES ──
function initRiskManagement() {
  document.getElementById('btn-add-note')?.addEventListener('click', addNote);
  document.getElementById('btn-apply-sanction')?.addEventListener('click', applySanction);

  // Dropzone para evidencia
  const input = document.getElementById('sanction-evidence');
  const zone = document.getElementById('sanction-dropzone');
  if (zone && input) {
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) {
        window.sanctionFile = file;
        document.getElementById('sanction-dropzone-ui').textContent = file.name;
      }
    });
  }
}

async function addNote() {
  if (!activeUserId) return;
  const text = document.getElementById('note-input').value.trim();
  if (!text) return;

  const note = { text, createdAt: new Date().toISOString(), author: auth.currentUser?.email };

  try {
    await updateDoc(doc(db, 'users', activeUserId), { notes: arrayUnion(note) });
    document.getElementById('note-input').value = '';
  } catch (error) { console.error('Error agregando nota:', error); }
}

function renderNotes(notes) {
  const list = document.getElementById('notes-list');
  if (!list) return;
  list.innerHTML = notes.length ? '' : '<p class="notes-empty">Sin anotaciones.</p>';
  notes.slice().reverse().forEach(n => {
    list.innerHTML += `<div class="note-item"><div class="note-item__text">${n.text}</div><div class="note-item__meta">${n.author} · ${new Date(n.createdAt).toLocaleDateString()}</div></div>`;
  });
}

async function applySanction() {
  if (!activeUserId) return;
  const reason = document.getElementById('sanction-reason').value.trim();
  const days = parseInt(document.getElementById('sanction-days').value, 10);
  if (!reason || !days) return;

  try {
    let evidenceURL = null;
    if (window.sanctionFile) {
      const evidenceRef = ref(storage, `sanctions/${activeUserId}/${Date.now()}`);
      const upload = await uploadBytesResumable(evidenceRef, window.sanctionFile);
      evidenceURL = await getDownloadURL(upload.ref);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const sanction = {
      reason, days, evidenceURL,
      appliedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      appliedBy: auth.currentUser?.email
    };

    await updateDoc(doc(db, 'users', activeUserId), { sanctions: arrayUnion(sanction) });

    document.getElementById('sanction-reason').value = '';
    document.getElementById('sanction-days').value = '';
    document.getElementById('sanction-dropzone-ui').textContent = 'Seleccionar imagen de evidencia';
    window.sanctionFile = null;

  } catch (error) { console.error('Error aplicando sanción:', error); }
}

function renderSanctions(sanctions) {
  const list = document.getElementById('sanctions-list');
  if (!list) return;
  list.innerHTML = sanctions.length ? '' : '<p class="notes-empty">Sin historial de sanciones.</p>';
  
  const now = new Date();

  sanctions.slice().reverse().forEach(s => {
    // Comprobar si esta sanción específica sigue activa
    const isActive = new Date(s.expiresAt) > now;
    
    // Cambiar estilos dinámicamente
    const bg = isActive ? 'var(--clr-danger-dim)' : 'rgba(255,255,255,0.04)';
    const border = isActive ? 'rgba(239,68,68,0.3)' : 'var(--clr-border)';
    const icon = isActive ? '⚠' : '✓';
    const opacity = isActive ? '1' : '0.6';
    const statusLabel = isActive ? '' : '<span style="font-size: 0.65rem; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; margin-left: 8px;">EXPIRADA</span>';

    list.innerHTML += `
      <div class="sanction-item" style="background: ${bg}; border: 1px solid ${border}; opacity: ${opacity};">
        <div class="sanction-item__reason">${icon} ${s.reason} ${statusLabel}</div>
        <div class="sanction-item__meta">
          ${s.days} días · Por: ${s.appliedBy} 
          ${s.evidenceURL ? `· <a href="${s.evidenceURL}" target="_blank" style="text-decoration: underline;">Ver prueba</a>` : ''}
        </div>
      </div>`;
  });
}

// ── CAMBIO 3: PANEL GLOBAL DE SANCIONES ──
// Itera sobre allSubmissions, filtra los que tienen sanciones y renderiza
// tarjetas clicables que navegan directamente a la pestaña de Riesgo del usuario.
function renderGlobalSanctions() {
  const container = document.getElementById('global-sanctions-list');
  const emptyState = document.getElementById('sanctions-view-empty');
  if (!container) return;

  // Limpiar tarjetas anteriores (preservar el empty state en el DOM)
  container.querySelectorAll('.user-card').forEach(c => c.remove());

  // Filtrar usuarios que tienen al menos UNA sanción activa el día de hoy
  const now = new Date();
  
  const sanctionedUsers = allSubmissions.filter(user => {
    if (!Array.isArray(user.sanctions) || user.sanctions.length === 0) return false;
    
    // Revisar si alguna de sus sanciones tiene una fecha de expiración mayor a hoy
    return user.sanctions.some(sanction => {
      if (!sanction.expiresAt) return false;
      const expDate = new Date(sanction.expiresAt);
      return expDate > now; // Solo retorna true si la sanción sigue vigente
    });
  });

  if (sanctionedUsers.length === 0) {
    emptyState?.classList.remove('hidden');
    return;
  }
  emptyState?.classList.add('hidden');

  sanctionedUsers.forEach(user => {
    // Obtener la sanción más reciente (última del array)
    const lastSanction = user.sanctions[user.sanctions.length - 1];
    const expiresDate = lastSanction.expiresAt
      ? new Date(lastSanction.expiresAt).toLocaleDateString()
      : '—';

    const initials = (user.fullName || user.username || '?')
      .split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const card = document.createElement('div');
    card.className = 'user-card';
    card.dataset.userId = user.id;
    card.style.cursor = 'pointer';

    card.innerHTML = `
      <div class="user-card__avatar">${initials}</div>
      <div class="user-card__info">
        <div class="user-card__name">${user.fullName || '—'}</div>
        <div class="user-card__username">@${user.username || '—'}</div>
        <div class="user-card__doc font-mono">⚠ ${lastSanction.reason || 'Sin motivo'}</div>
        <div class="user-card__doc" style="font-size:0.75rem; opacity:0.6;">
          Expira: ${expiresDate} · ${user.sanctions.length} sanción${user.sanctions.length !== 1 ? 'es' : ''}
        </div>
      </div>
      <div class="user-card__status">
        <span class="status-badge status-badge--${user.status}">${user.status}</span>
      </div>
    `;

    // Al hacer clic:
    // a) Cambiar la vista activa a view-submissions (simulando clic en el enlace del menú)
    // b) Cargar el perfil del usuario con selectUser()
    // c) Abrir directamente la pestaña de Gestión de Riesgo con activateTab('risk')
    card.addEventListener('click', () => {
      // a) Navegar a la vista de Solicitudes
      const submissionsLink = document.querySelector('.sidebar__link[data-view="submissions"]');
      if (submissionsLink) submissionsLink.click();

      // b) Seleccionar el usuario en la lista
      selectUser(user.id);

      // c) Abrir la pestaña de Gestión de Riesgo tras un pequeño delay
      //    para asegurar que el perfil ya está montado en el DOM
      setTimeout(() => activateTab('risk'), 50);
    });

    container.appendChild(card);
  });
}

function updateStats() {
  setEl('stat-total', allSubmissions.length);
  setEl('stat-pending', allSubmissions.filter(u => u.status === 'pending').length);
  setEl('stat-approved', allSubmissions.filter(u => u.status === 'approved').length);
  setEl('stat-rejected', allSubmissions.filter(u => u.status === 'rejected').length);
}

function setEl(id, txt) { const el = document.getElementById(id); if(el) el.textContent = txt; }
function updateCount(count) { setEl('dash-count', `${count} solicitudes`); }
