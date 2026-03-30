/**
 * js/admin-dashboard.js
 * SYKLO KYC — Panel de Control con Gestor de Correos
 */

import { db, storage, auth } from './firebase-config.js';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, query, orderBy, serverTimestamp, addDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ── STATE ──
let allSubmissions = [];
let filteredSubmissions = [];
let activeFilter = 'all';
let activeUserId = null;
let searchQuery = '';
let emailTemplates = {}; // Almacena las plantillas cargadas de Firebase

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
  loadTemplates(); // Cargar plantillas de correo
  initSearch();
  initFilters();
  initProfileTabs();
  initVerificationActions();
  initRiskManagement();
  initSidebarNavigation();
  initDirectMessage(); // Inicializar modal de mensajes
}

// ── NAVEGACIÓN GLOBAL ──
function initSidebarNavigation() {
  document.querySelectorAll('.sidebar__link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = link.dataset.view;
      if (!targetView) return;
      document.querySelectorAll('.sidebar__link').forEach(l => l.classList.remove('sidebar__link--active'));
      link.classList.add('sidebar__link--active');
      document.querySelectorAll('.dash-view').forEach(view => {
        view.classList.toggle('hidden', view.id !== `view-${targetView}`);
      });
    });
  });
}

// ── CARGA EN TIEMPO REAL (USUARIOS) ──
function loadSubmissions() {
  const q = query(collection(db, 'users'), orderBy('submittedAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    allSubmissions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    applyFiltersAndSearch();
    updateStats();
    renderGlobalSanctions();
  }, (error) => console.error('[Dashboard] Error:', error));
}

// ── CARGA EN TIEMPO REAL (PLANTILLAS) ──
function loadTemplates() {
  onSnapshot(collection(db, 'email_templates'), (snapshot) => {
    snapshot.forEach(doc => {
      emailTemplates[doc.id] = doc.data();
      // Llenar los textareas visualmente si existen
      const inputSub = document.getElementById(`tpl-${doc.id}-subject`);
      const inputHtml = document.getElementById(`tpl-${doc.id}-html`);
      if(inputSub) inputSub.value = doc.data().subject || '';
      if(inputHtml) inputHtml.value = doc.data().html || '';
    });
  });
}

// Función global para que el botón HTML la pueda llamar
window.saveTemplate = async function(type) {
  const subject = document.getElementById(`tpl-${type}-subject`).value;
  const html = document.getElementById(`tpl-${type}-html`).value;
  const alertEl = document.getElementById(`tpl-alert-${type}`);
  
  if(!subject || !html) {
    alertEl.textContent = 'Llena ambos campos.';
    alertEl.className = 'form-alert form-alert--sm is-error';
    alertEl.style.display = 'block';
    return;
  }
  
  try {
    await setDoc(doc(db, 'email_templates', type), { subject, html });
    alertEl.textContent = 'Plantilla guardada con éxito.';
    alertEl.className = 'form-alert form-alert--sm is-success';
    alertEl.style.display = 'block';
    setTimeout(() => alertEl.style.display = 'none', 3000);
  } catch(error) {
    console.error(error);
  }
};

// ── FUNCIÓN MAESTRA DE VARIABLES DE CORREO ──
function parseTemplate(templateString, user, extra = {}) {
  if (!templateString) return '';
  let res = templateString.replace(/\{\{nombre\}\}/g, user.fullName || 'Usuario');
  if (extra.motivo) res = res.replace(/\{\{motivo\}\}/g, extra.motivo);
  if (extra.dias) res = res.replace(/\{\{dias\}\}/g, extra.dias);
  return res;
}

// ── SEARCH & FILTERS ──
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
    const matchesSearch = !searchQuery || user.username?.toLowerCase().includes(searchQuery) || user.docNumber?.toLowerCase().includes(searchQuery) || user.fullName?.toLowerCase().includes(searchQuery);
    return matchesFilter && matchesSearch;
  });
  renderList(filteredSubmissions);
  updateCount(filteredSubmissions.length);
}

function renderList(submissions) {
  if (!submissionsList) return;
  submissionsList.querySelectorAll('.user-card').forEach(c => c.remove());
  if (submissions.length === 0) { listEmpty?.classList.remove('hidden'); return; }
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
  submissionsList?.querySelectorAll('.user-card').forEach(c => c.classList.toggle('user-card--active', c.dataset.userId === userId));
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
  if (statusEl) {
    statusEl.className = `status-badge status-badge--${user.status}`;
    statusEl.textContent = user.status;
  }

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
  if (!url) { wrap.innerHTML = '<div class="doc-loading">Sin archivo</div>'; if (link) link.style.display = 'none'; return; }
  if (link) { link.href = url; link.style.display = 'block'; }
  const isVideo = url.includes('.mp4') || type === 'video';
  wrap.innerHTML = isVideo ? `<video src="${url}" controls muted style="max-height:160px;border-radius:var(--radius-sm);"></video>` : `<img src="${url}" style="max-height:160px;border-radius:var(--radius-sm);" />`;
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

// ── ACTUALIZAR ESTADOS Y ENVIAR CORREO ──
function initVerificationActions() {
  document.getElementById('btn-approve')?.addEventListener('click', () => updateUserStatus('approved'));
  document.getElementById('btn-reject')?.addEventListener('click', () => updateUserStatus('rejected'));
}

async function updateUserStatus(newStatus) {
  if (!activeUserId) return;
  const actionAlert = document.getElementById('action-alert');
  const userData = allSubmissions.find(u => u.id === activeUserId);

  try {
    const userRef = doc(db, 'users', activeUserId);
    await updateDoc(userRef, {
      status: newStatus,
      reviewedAt: serverTimestamp(),
      reviewedBy: auth.currentUser?.email
    });

    // Enviar correo basado en la plantilla guardada
    const tpl = emailTemplates[newStatus];
    if (userData.email && tpl && tpl.subject && tpl.html) {
      await addDoc(collection(db, 'mail'), {
        to: userData.email,
        message: {
          subject: parseTemplate(tpl.subject, userData),
          html: parseTemplate(tpl.html, userData)
        }
      });
    }

    actionAlert.textContent = `✓ KYC ${newStatus === 'approved' ? 'aprobado' : 'rechazado'}. Correo enviado.`;
    actionAlert.className = `form-alert form-alert--sm is-${newStatus === 'approved' ? 'success' : 'error'}`;
    actionAlert.style.display = 'flex';

    const statusBadge = document.getElementById('profile-status-badge');
    if (statusBadge) { statusBadge.className = `status-badge status-badge--${newStatus}`; statusBadge.textContent = newStatus; }
    updateVerificationButtons(newStatus);

  } catch (error) {
    console.error('Error:', error);
  }
}

function updateVerificationButtons(status) {
  const approveBtn = document.getElementById('btn-approve');
  const rejectBtn = document.getElementById('btn-reject');
  if (approveBtn) approveBtn.disabled = status === 'approved';
  if (rejectBtn) rejectBtn.disabled = status === 'rejected';
}

// ── RIESGO Y SANCIONES ──
function initRiskManagement() {
  document.getElementById('btn-add-note')?.addEventListener('click', addNote);
  document.getElementById('btn-apply-sanction')?.addEventListener('click', applySanction);
}

async function addNote() {
  if (!activeUserId) return;
  const text = document.getElementById('note-input').value.trim();
  if (!text) return;
  const note = { text, createdAt: new Date().toISOString(), author: auth.currentUser?.email };
  try {
    // 1. Guarda en la base de datos
    await updateDoc(doc(db, 'users', activeUserId), { notes: arrayUnion(note) });
    
    // 2. ACTUALIZACIÓN INSTANTÁNEA EN PANTALLA
    const userData = allSubmissions.find(u => u.id === activeUserId);
    if (userData) {
      if (!userData.notes) userData.notes = [];
      userData.notes.push(note);
      renderNotes(userData.notes);
    }

    document.getElementById('note-input').value = '';
  } catch (error) { console.error('Error:', error); }
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
  const alertEl = document.getElementById('sanction-alert');
  if (!reason || !days) {
    alertEl.textContent = 'Llena el motivo y los días.'; alertEl.style.display='block'; return;
  }

  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    const sanction = { reason, days, appliedAt: new Date().toISOString(), expiresAt: expiresAt.toISOString(), appliedBy: auth.currentUser?.email };
    
    // 1. Guarda en la base de datos
    await updateDoc(doc(db, 'users', activeUserId), { sanctions: arrayUnion(sanction) });

    const userData = allSubmissions.find(u => u.id === activeUserId);
    
    // 2. Enviar correo de sanción
    const tpl = emailTemplates['sanction'];
    if (userData && userData.email && tpl && tpl.subject && tpl.html) {
      await addDoc(collection(db, 'mail'), {
        to: userData.email,
        message: {
          subject: parseTemplate(tpl.subject, userData, { motivo: reason, dias: days }),
          html: parseTemplate(tpl.html, userData, { motivo: reason, dias: days })
        }
      });
    }

    // 3. ACTUALIZACIÓN INSTANTÁNEA EN PANTALLA
    if (userData) {
      if (!userData.sanctions) userData.sanctions = [];
      userData.sanctions.push(sanction);
      renderSanctions(userData.sanctions);
    }

    document.getElementById('sanction-reason').value = '';
    document.getElementById('sanction-days').value = '';
    alertEl.style.display = 'none';

  } catch (error) { console.error('Error:', error); }
}

function renderSanctions(sanctions) {
  const list = document.getElementById('sanctions-list');
  if (!list) return;
  list.innerHTML = sanctions.length ? '' : '<p class="notes-empty">Sin historial de sanciones.</p>';
  const now = new Date();
  sanctions.slice().reverse().forEach(s => {
    const isActive = new Date(s.expiresAt) > now;
    const bg = isActive ? 'var(--clr-danger-dim)' : 'rgba(255,255,255,0.04)';
    const border = isActive ? 'rgba(239,68,68,0.3)' : 'var(--clr-border)';
    const icon = isActive ? '⚠' : '✓';
    const opacity = isActive ? '1' : '0.6';
    const statusLabel = isActive ? '' : '<span style="font-size: 0.65rem; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; margin-left: 8px;">EXPIRADA</span>';
    list.innerHTML += `<div class="sanction-item" style="background: ${bg}; border: 1px solid ${border}; opacity: ${opacity};"><div class="sanction-item__reason">${icon} ${s.reason} ${statusLabel}</div><div class="sanction-item__meta">${s.days} días · Por: ${s.appliedBy}</div></div>`;
  });
}

function renderGlobalSanctions() {
  const container = document.getElementById('global-sanctions-list');
  const emptyState = document.getElementById('sanctions-view-empty');
  if (!container) return;
  container.querySelectorAll('.user-card').forEach(c => c.remove());

  const now = new Date();
  const sanctionedUsers = allSubmissions.filter(user => {
    if (!Array.isArray(user.sanctions) || user.sanctions.length === 0) return false;
    return user.sanctions.some(sanction => {
      if (!sanction.expiresAt) return false;
      return new Date(sanction.expiresAt) > now;
    });
  });

  if (sanctionedUsers.length === 0) { emptyState?.classList.remove('hidden'); return; }
  emptyState?.classList.add('hidden');

  sanctionedUsers.forEach(user => {
    const lastSanction = user.sanctions[user.sanctions.length - 1];
    const expiresDate = lastSanction.expiresAt ? new Date(lastSanction.expiresAt).toLocaleDateString() : '—';
    const initials = (user.fullName || user.username || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const card = document.createElement('div');
    card.className = 'user-card'; card.style.cursor = 'pointer';
    card.innerHTML = `<div class="user-card__avatar">${initials}</div><div class="user-card__info"><div class="user-card__name">${user.fullName || '—'}</div><div class="user-card__username">@${user.username || '—'}</div><div class="user-card__doc font-mono" style="color:var(--clr-danger);">⚠ ${lastSanction.reason || 'Sin motivo'}</div><div class="user-card__doc" style="font-size:0.75rem; opacity:0.6;">Expira: ${expiresDate}</div></div><div class="user-card__status"><span class="status-badge status-badge--${user.status}">${user.status}</span></div>`;
    
    card.addEventListener('click', () => {
      document.querySelector('.sidebar__link[data-view="submissions"]')?.click();
      selectUser(user.id);
      setTimeout(() => activateTab('risk'), 50);
    });
    container.appendChild(card);
  });
}

// ── MENSAJE DIRECTO (MODAL) ──
function initDirectMessage() {
  const modal = document.getElementById('dm-modal');
  const btnOpen = document.getElementById('btn-open-dm');
  const btnClose = document.getElementById('btn-close-dm');
  const btnCancel = document.getElementById('btn-cancel-dm');
  const btnSend = document.getElementById('btn-send-dm');

  const openModal = () => {
    if(!activeUserId) return;
    const user = allSubmissions.find(u => u.id === activeUserId);
    document.getElementById('dm-user-name').textContent = user.fullName || 'Usuario';
    document.getElementById('dm-user-email').textContent = user.email || 'Sin correo';
    document.getElementById('dm-subject').value = '';
    document.getElementById('dm-html').value = '';
    document.getElementById('dm-alert').style.display = 'none';
    modal.classList.add('is-active');
  };

  const closeModal = () => modal.classList.remove('is-active');

  btnOpen?.addEventListener('click', openModal);
  btnClose?.addEventListener('click', closeModal);
  btnCancel?.addEventListener('click', closeModal);

  btnSend?.addEventListener('click', async () => {
    const user = allSubmissions.find(u => u.id === activeUserId);
    const subjectRaw = document.getElementById('dm-subject').value;
    const htmlRaw = document.getElementById('dm-html').value;
    const alertEl = document.getElementById('dm-alert');

    if(!subjectRaw || !htmlRaw) {
      alertEl.textContent = 'Por favor llena ambos campos.'; alertEl.className = 'form-alert form-alert--sm is-warning'; alertEl.style.display = 'block'; return;
    }
    if(!user.email) {
      alertEl.textContent = 'El usuario no tiene un correo registrado.'; alertEl.className = 'form-alert form-alert--sm is-error'; alertEl.style.display = 'block'; return;
    }

    try {
      btnSend.textContent = 'Enviando...';
      btnSend.disabled = true;

      await addDoc(collection(db, 'mail'), {
        to: user.email,
        message: {
          subject: parseTemplate(subjectRaw, user),
          html: parseTemplate(htmlRaw, user)
        }
      });

      alertEl.textContent = '¡Mensaje encolado para envío!';
      alertEl.className = 'form-alert form-alert--sm is-success';
      alertEl.style.display = 'block';
      setTimeout(() => { closeModal(); btnSend.textContent = 'Enviar Correo'; btnSend.disabled = false; }, 1500);

    } catch (error) {
      console.error(error);
      alertEl.textContent = 'Hubo un error al enviar el mensaje.'; alertEl.className = 'form-alert form-alert--sm is-error'; alertEl.style.display = 'block';
      btnSend.textContent = 'Enviar Correo'; btnSend.disabled = false;
    }
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
