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
  renderDocPreview('admin-selfie-preview', 'admin-selfie-download', user.selfieFileURL, 'video');

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
  list.innerHTML = sanctions.length ? '' : '<p class="notes-empty">Sin sanciones activas.</p>';
  sanctions.slice().reverse().forEach(s => {
    list.innerHTML += `<div class="sanction-item"><div class="sanction-item__reason">⚠ ${s.reason}</div><div class="sanction-item__meta">${s.days} días · Por: ${s.appliedBy} ${s.evidenceURL ? `<a href="${s.evidenceURL}" target="_blank">Ver prueba</a>` : ''}</div></div>`;
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
