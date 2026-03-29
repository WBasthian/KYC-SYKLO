/**
 * ─────────────────────────────────────────────────────────
 *  js/admin-dashboard.js
 *  SYKLO KYC — Panel de Control del Administrador
 * ─────────────────────────────────────────────────────────
 *  Gestiona:
 *  - Carga en tiempo real de solicitudes KYC desde Firestore
 *  - Buscador inteligente por username y documento
 *  - Filtrado por estado (pending/approved/rejected)
 *  - Vista de perfil completo con documentos
 *  - Acciones: Aprobar / Rechazar KYC
 *  - Anotaciones internas y sistema de sanciones
 */

// TODO: Importar Firebase cuando esté configurado:
// import { db, storage } from './firebase-config.js';
// import {
//   collection, onSnapshot, doc, updateDoc,
//   arrayUnion, query, orderBy, serverTimestamp
// } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// import { ref, uploadBytesResumable, getDownloadURL }
//   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

import { db, storage } from './firebase-config.js';

// ── STATE ─────────────────────────────────────────────────
let allSubmissions    = [];    // Todas las solicitudes
let filteredSubmissions = []; // Después de filtro + búsqueda
let activeFilter      = 'all';
let activeUserId      = null;  // ID del usuario seleccionado
let searchQuery       = '';

// ── DOM REFERENCES ─────────────────────────────────────────
const searchInput    = document.getElementById('search-input');
const submissionsList = document.getElementById('submissions-list');
const listEmpty      = document.getElementById('list-empty');
const dashCount      = document.getElementById('dash-count');
const profileCard    = document.getElementById('profile-card');
const detailPlaceholder = document.getElementById('detail-placeholder');

// ── INIT: Esperar a que el admin esté autenticado ──────────
document.addEventListener('syklo:admin-ready', () => {
  initDashboard();
});

async function initDashboard() {
  loadSubmissions();
  initSearch();
  initFilters();
  initProfileTabs();
  initVerificationActions();
  initRiskManagement();
  updateStats();
}

// ═══════════════════════════════════════════
// FIRESTORE — Carga de solicitudes en tiempo real
// ═══════════════════════════════════════════
function loadSubmissions() {
  // TODO: Reemplaza el mock por Firestore onSnapshot para tiempo real:
  //
  // const q = query(collection(db, 'users'), orderBy('submittedAt', 'desc'));
  //
  // onSnapshot(q, (snapshot) => {
  //   allSubmissions = snapshot.docs.map(doc => ({
  //     id: doc.id,
  //     ...doc.data()
  //   }));
  //   applyFiltersAndSearch();
  //   updateStats();
  // }, (error) => {
  //   console.error('[Dashboard] Error cargando solicitudes:', error);
  // });

  // ── MOCK: Cargar desde localStorage (demo) ─────────────
  const stored = localStorage.getItem('syklo_kyc_submissions');
  if (stored) {
    try {
      allSubmissions = JSON.parse(stored).map((s, i) => ({
        ...s,
        id: s.submissionId || `mock-${i}`,
      }));
    } catch {
      allSubmissions = [];
    }
  } else {
    // Datos de ejemplo si no hay ninguno
    allSubmissions = getMockData();
    localStorage.setItem(
      'syklo_kyc_submissions',
      JSON.stringify(allSubmissions)
    );
  }

  applyFiltersAndSearch();
  updateStats();
}

// ── Persistir cambio en el mock ───────────────────────────
function persistMockData() {
  localStorage.setItem('syklo_kyc_submissions', JSON.stringify(allSubmissions));
}

// ═══════════════════════════════════════════
// SEARCH & FILTER
// ═══════════════════════════════════════════
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

/**
 * Aplica filtro de estado + búsqueda por texto y re-renderiza la lista.
 */
function applyFiltersAndSearch() {
  filteredSubmissions = allSubmissions.filter(user => {
    // Filtro por estado
    const matchesFilter = activeFilter === 'all' || user.status === activeFilter;
    // Búsqueda por username o número de documento
    const matchesSearch = !searchQuery
      || user.username?.toLowerCase().includes(searchQuery)
      || user.docNumber?.toLowerCase().includes(searchQuery)
      || user.fullName?.toLowerCase().includes(searchQuery);

    return matchesFilter && matchesSearch;
  });

  renderList(filteredSubmissions);
  updateCount(filteredSubmissions.length);
}

// ═══════════════════════════════════════════
// RENDER — Lista de solicitudes
// ═══════════════════════════════════════════
function renderList(submissions) {
  if (!submissionsList) return;

  // Limpiar cards previas (mantener el elemento "empty")
  const cards = submissionsList.querySelectorAll('.user-card');
  cards.forEach(c => c.remove());

  if (submissions.length === 0) {
    listEmpty?.classList.remove('hidden');
    return;
  }

  listEmpty?.classList.add('hidden');

  submissions.forEach(user => {
    const card = buildUserCard(user);
    submissionsList.appendChild(card);
  });

  // Restaurar selección activa si existe
  if (activeUserId) {
    const activeCard = submissionsList.querySelector(`[data-user-id="${activeUserId}"]`);
    activeCard?.classList.add('user-card--active');
  }
}

function buildUserCard(user) {
  const card = document.createElement('div');
  card.className = 'user-card';
  card.dataset.userId = user.id;

  if (user.id === activeUserId) card.classList.add('user-card--active');

  const initials = getInitials(user.fullName || user.username || '?');
  const statusBadge = buildStatusBadge(user.status);

  card.innerHTML = `
    <div class="user-card__avatar">${initials}</div>
    <div class="user-card__info">
      <div class="user-card__name">${escHtml(user.fullName || '—')}</div>
      <div class="user-card__username">@${escHtml(user.username || '—')}</div>
      <div class="user-card__doc font-mono">${escHtml(user.docNumber || '—')}</div>
    </div>
    <div class="user-card__status">${statusBadge}</div>
  `;

  card.addEventListener('click', () => selectUser(user.id));
  return card;
}

function buildStatusBadge(status) {
  const labels = { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado' };
  const label = labels[status] || status;
  return `<span class="status-badge status-badge--${status}">${label}</span>`;
}

// ═══════════════════════════════════════════
// PROFILE DETAIL — Selección de usuario
// ═══════════════════════════════════════════
function selectUser(userId) {
  activeUserId = userId;

  // Actualizar clase activa en la lista
  submissionsList?.querySelectorAll('.user-card').forEach(c => {
    c.classList.toggle('user-card--active', c.dataset.userId === userId);
  });

  const user = allSubmissions.find(u => u.id === userId);
  if (!user) return;

  renderProfile(user);
}

function renderProfile(user) {
  detailPlaceholder?.classList.add('hidden');
  profileCard?.classList.remove('hidden');

  // ── Header ───────────────────────────────────────────────
  const initials = getInitials(user.fullName || user.username || '?');
  const profileAvatar = document.getElementById('profile-avatar');
  if (profileAvatar) profileAvatar.textContent = initials;

  setEl('profile-name', user.fullName || '—');
  setEl('profile-username', `@${user.username || '—'}`);
  setEl('profile-submitted', `Enviado: ${formatDate(user.submittedAt)}`);

  const statusBadgeEl = document.getElementById('profile-status-badge');
  if (statusBadgeEl) statusBadgeEl.outerHTML = buildStatusBadge(user.status)
    .replace('class="status-badge', 'id="profile-status-badge" class="status-badge');

  // ── Tab: Info ─────────────────────────────────────────────
  setEl('pi-fullname', user.fullName || '—');
  setEl('pi-doc', user.docNumber || '—');
  setEl('pi-dob', user.dob || '—');
  setEl('pi-age', user.age != null ? `${user.age} años` : '—');
  setEl('pi-nationality', user.nationality || '—');
  setEl('pi-email', user.email || '—');
  setEl('pi-phone', user.phone || '—');
  setEl('pi-id', user.submissionId || user.id || '—');

  // Update approve/reject state
  updateVerificationButtons(user.status);

  // ── Tab: Documents ────────────────────────────────────────
  renderDocPreview('admin-doc-preview', 'admin-doc-download', user.docFileURL, 'image');
  renderDocPreview('admin-selfie-preview', 'admin-selfie-download', user.selfieFileURL, 'auto');

  // ── Tab: Risk ─────────────────────────────────────────────
  renderNotes(user.notes || []);
  renderSanctions(user.sanctions || []);

  // Resetear al primer tab
  activateTab('info');
}

function renderDocPreview(previewId, downloadId, url, type) {
  const wrap = document.getElementById(previewId);
  const link = document.getElementById(downloadId);

  if (!wrap) return;

  if (!url) {
    wrap.innerHTML = '<div class="doc-loading">Sin archivo cargado</div>';
    if (link) link.style.display = 'none';
    return;
  }

  if (link) {
    link.href = url;
    link.style.display = 'block';
  }

  // Intentar determinar si es imagen o video
  const isVideo = url.includes('selfie') && (
    url.includes('.mp4') || url.includes('.mov') || url.includes('.webm') || type === 'video'
  );

  if (isVideo) {
    wrap.innerHTML = `
      <video src="${url}" controls muted style="max-height:160px;border-radius:var(--radius-sm);"></video>
    `;
  } else {
    const imgEl = document.createElement('img');
    imgEl.src = url;
    imgEl.alt = 'Documento';
    imgEl.style.maxHeight = '160px';
    imgEl.style.borderRadius = 'var(--radius-sm)';
    imgEl.onerror = () => {
      wrap.innerHTML = `
        <div class="doc-loading">
          <a href="${url}" target="_blank" style="color:var(--clr-blue);font-size:0.82rem">
            Abrir documento ↗
          </a>
        </div>
      `;
    };
    wrap.innerHTML = '';
    wrap.appendChild(imgEl);
  }
}

// ═══════════════════════════════════════════
// PROFILE TABS
// ═══════════════════════════════════════════
function initProfileTabs() {
  document.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activateTab(tab.dataset.tab);
    });
  });
}

function activateTab(tabName) {
  document.querySelectorAll('.profile-tab').forEach(t => {
    t.classList.toggle('profile-tab--active', t.dataset.tab === tabName);
  });
  document.querySelectorAll('.profile-tab-content').forEach(c => {
    c.classList.toggle('hidden', c.id !== `tab-${tabName}`);
  });
}

// ═══════════════════════════════════════════
// VERIFICATION ACTIONS — Aprobar / Rechazar
// ═══════════════════════════════════════════
function initVerificationActions() {
  document.getElementById('btn-approve')?.addEventListener('click', () => {
    updateUserStatus('approved');
  });
  document.getElementById('btn-reject')?.addEventListener('click', () => {
    updateUserStatus('rejected');
  });
}

async function updateUserStatus(newStatus) {
  if (!activeUserId) return;

  const actionAlert = document.getElementById('action-alert');
  clearAlert(actionAlert);

  const user = allSubmissions.find(u => u.id === activeUserId);
  if (!user) return;

  if (user.status === newStatus) {
    showAlert(actionAlert, `La solicitud ya está ${newStatus === 'approved' ? 'aprobada' : 'rechazada'}.`, 'warning');
    return;
  }

  try {
    // TODO: Actualizar en Firestore:
    // const userRef = doc(db, 'users', activeUserId);
    // await updateDoc(userRef, {
    //   status: newStatus,
    //   reviewedAt: serverTimestamp(),
    //   reviewedBy: auth.currentUser?.uid,
    // });

    // Mock update
    user.status = newStatus;
    user.reviewedAt = new Date().toISOString();
    persistMockData();

    applyFiltersAndSearch();
    renderProfile(user);

    const msg = newStatus === 'approved'
      ? '✓ KYC aprobado correctamente.'
      : '✗ KYC rechazado correctamente.';
    showAlert(actionAlert, msg, newStatus === 'approved' ? 'success' : 'error');

    updateStats();
  } catch (error) {
    console.error('[Dashboard] Error actualizando estado:', error);
    showAlert(actionAlert, 'Error al actualizar. Intenta de nuevo.', 'error');
  }
}

function updateVerificationButtons(status) {
  const approveBtn = document.getElementById('btn-approve');
  const rejectBtn  = document.getElementById('btn-reject');
  if (!approveBtn || !rejectBtn) return;

  approveBtn.disabled = status === 'approved';
  rejectBtn.disabled  = status === 'rejected';

  clearAlert(document.getElementById('action-alert'));
}

// ═══════════════════════════════════════════
// RISK MANAGEMENT — Notas y Sanciones
// ═══════════════════════════════════════════
function initRiskManagement() {
  // Notas
  document.getElementById('btn-add-note')?.addEventListener('click', addNote);

  // Sanciones
  document.getElementById('btn-apply-sanction')?.addEventListener('click', applySanction);

  // Dropzone de evidencia de sanción
  setupSanctionDropzone();
}

// ── Notas ─────────────────────────────────────────────────
async function addNote() {
  if (!activeUserId) return;

  const noteInput  = document.getElementById('note-input');
  const noteText   = noteInput?.value.trim();
  const noteAlert  = document.getElementById('sanction-alert'); // Reutilizamos el alert

  if (!noteText) {
    showAlert(noteAlert, 'Escribe una nota antes de agregar.', 'error');
    return;
  }

  const note = {
    text:      noteText,
    createdAt: new Date().toISOString(),
    author:    'Admin',
  };

  try {
    // TODO: Actualizar en Firestore con arrayUnion:
    // const userRef = doc(db, 'users', activeUserId);
    // await updateDoc(userRef, {
    //   notes: arrayUnion(note)
    // });

    // Mock
    const user = allSubmissions.find(u => u.id === activeUserId);
    if (!user) return;
    if (!user.notes) user.notes = [];
    user.notes.push(note);
    persistMockData();

    renderNotes(user.notes);
    noteInput.value = '';
    clearAlert(noteAlert);
  } catch (error) {
    console.error('[Dashboard] Error guardando nota:', error);
    showAlert(noteAlert, 'Error al guardar la nota.', 'error');
  }
}

function renderNotes(notes) {
  const notesList = document.getElementById('notes-list');
  const notesEmpty = document.getElementById('notes-empty');
  if (!notesList) return;

  notesList.innerHTML = '';

  if (!notes || notes.length === 0) {
    if (notesEmpty) {
      notesEmpty.textContent = 'Sin anotaciones aún.';
      notesList.appendChild(notesEmpty);
    }
    return;
  }

  notes.slice().reverse().forEach(note => {
    const div = document.createElement('div');
    div.className = 'note-item';
    div.innerHTML = `
      <div class="note-item__text">${escHtml(note.text)}</div>
      <div class="note-item__meta">${note.author || 'Admin'} · ${formatDate(note.createdAt)}</div>
    `;
    notesList.appendChild(div);
  });
}

// ── Sanciones ─────────────────────────────────────────────
let sanctionEvidenceFile = null;

function setupSanctionDropzone() {
  const input = document.getElementById('sanction-evidence');
  const zone  = document.getElementById('sanction-dropzone');
  const uiEl  = document.getElementById('sanction-dropzone-ui');
  const previewEl = document.getElementById('sanction-preview');

  if (!input || !zone) return;

  zone.addEventListener('click', (e) => {
    if (!e.target.classList.contains('preview-remove')) input.click();
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) {
      sanctionEvidenceFile = file;
      renderSanctionPreview(file, uiEl, previewEl);
    }
  });
}

function renderSanctionPreview(file, uiEl, previewEl) {
  if (!previewEl) return;
  previewEl.innerHTML = '';
  previewEl.classList.add('has-file');
  if (uiEl) uiEl.style.opacity = '0';

  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  img.style.maxHeight = '60px';
  img.style.borderRadius = 'var(--radius-sm)';
  img.onload = () => URL.revokeObjectURL(img.src);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'preview-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    previewEl.innerHTML = '';
    previewEl.classList.remove('has-file');
    if (uiEl) uiEl.style.opacity = '1';
    sanctionEvidenceFile = null;
    document.getElementById('sanction-evidence').value = '';
  });

  previewEl.appendChild(img);
  previewEl.appendChild(removeBtn);
}

async function applySanction() {
  if (!activeUserId) return;

  const reason     = document.getElementById('sanction-reason')?.value.trim();
  const days       = parseInt(document.getElementById('sanction-days')?.value, 10);
  const alertEl    = document.getElementById('sanction-alert');

  clearAlert(alertEl);

  if (!reason) {
    showAlert(alertEl, 'Escribe el motivo de la sanción.', 'error');
    return;
  }
  if (!days || days < 1 || days > 3650) {
    showAlert(alertEl, 'Ingresa un número de días válido (1 – 3650).', 'error');
    return;
  }

  try {
    let evidenceURL = null;

    // TODO: Subir imagen de evidencia a Cloud Storage:
    // if (sanctionEvidenceFile) {
    //   const evidenceRef = ref(storage, `sanctions/${activeUserId}/${Date.now()}`);
    //   const upload = await uploadBytesResumable(evidenceRef, sanctionEvidenceFile);
    //   evidenceURL = await getDownloadURL(upload.ref);
    // }

    // Mock upload
    if (sanctionEvidenceFile) {
      evidenceURL = URL.createObjectURL(sanctionEvidenceFile);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const sanction = {
      reason,
      days,
      evidenceURL,
      appliedAt:  new Date().toISOString(),
      expiresAt:  expiresAt.toISOString(),
      appliedBy:  'Admin',
    };

    // TODO: Guardar en Firestore:
    // const userRef = doc(db, 'users', activeUserId);
    // await updateDoc(userRef, {
    //   sanctions: arrayUnion(sanction)
    // });

    // Mock
    const user = allSubmissions.find(u => u.id === activeUserId);
    if (!user) return;
    if (!user.sanctions) user.sanctions = [];
    user.sanctions.push(sanction);
    persistMockData();

    renderSanctions(user.sanctions);

    // Limpiar form
    document.getElementById('sanction-reason').value = '';
    document.getElementById('sanction-days').value = '';
    const previewEl = document.getElementById('sanction-preview');
    const uiEl = document.getElementById('sanction-dropzone-ui');
    if (previewEl) { previewEl.innerHTML = ''; previewEl.classList.remove('has-file'); }
    if (uiEl) uiEl.style.opacity = '1';
    sanctionEvidenceFile = null;
    document.getElementById('sanction-evidence').value = '';

    showAlert(alertEl, `✓ Sanción de ${days} días aplicada correctamente.`, 'success');
  } catch (error) {
    console.error('[Dashboard] Error aplicando sanción:', error);
    showAlert(alertEl, 'Error al aplicar la sanción.', 'error');
  }
}

function renderSanctions(sanctions) {
  const sanctionsList = document.getElementById('sanctions-list');
  const sanctionsEmpty = document.getElementById('sanctions-empty');
  if (!sanctionsList) return;

  sanctionsList.innerHTML = '';

  if (!sanctions || sanctions.length === 0) {
    if (sanctionsEmpty) {
      sanctionsEmpty.textContent = 'Sin sanciones activas.';
      sanctionsList.appendChild(sanctionsEmpty);
    }
    return;
  }

  sanctions.slice().reverse().forEach(s => {
    const div = document.createElement('div');
    div.className = 'sanction-item';
    div.innerHTML = `
      <div class="sanction-item__reason">⚠ ${escHtml(s.reason)}</div>
      <div class="sanction-item__meta">
        ${s.days} días · Aplicada: ${formatDate(s.appliedAt)} · 
        Expira: ${formatDate(s.expiresAt)} · ${s.appliedBy || 'Admin'}
        ${s.evidenceURL ? ` · <a href="${s.evidenceURL}" target="_blank" rel="noopener" style="color:var(--clr-blue)">Ver evidencia ↗</a>` : ''}
      </div>
    `;
    sanctionsList.appendChild(div);
  });
}

// ═══════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════
function updateStats() {
  const total    = allSubmissions.length;
  const pending  = allSubmissions.filter(u => u.status === 'pending').length;
  const approved = allSubmissions.filter(u => u.status === 'approved').length;
  const rejected = allSubmissions.filter(u => u.status === 'rejected').length;

  setEl('stat-total',    total);
  setEl('stat-pending',  pending);
  setEl('stat-approved', approved);
  setEl('stat-rejected', rejected);
}

function updateCount(count) {
  const el = document.getElementById('dash-count');
  if (el) el.textContent = `${count} solicitud${count !== 1 ? 'es' : ''}`;
}

// ═══════════════════════════════════════════
// MOCK DATA — Datos de ejemplo para demo
// ═══════════════════════════════════════════
function getMockData() {
  return [
    {
      id: 'SKL-001',
      submissionId: 'SKL-001',
      username: 'juangarcia92',
      firstName: 'Juan Carlos',
      lastName: 'García López',
      fullName: 'Juan Carlos García López',
      docNumber: '28456123B',
      nationality: 'ES',
      email: 'juangarcia92@ejemplo.com',
      phone: '+34 612 345 678',
      dob: '1992-04-15',
      age: 32,
      status: 'pending',
      docFileURL: null,
      selfieFileURL: null,
      notes: [],
      sanctions: [],
      submittedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    },
    {
      id: 'SKL-002',
      submissionId: 'SKL-002',
      username: 'mariamendoza',
      firstName: 'María',
      lastName: 'Mendoza Torres',
      fullName: 'María Mendoza Torres',
      docNumber: 'CO45678901',
      nationality: 'CO',
      email: 'maria.mendoza@ejemplo.com',
      phone: '+57 300 123 4567',
      dob: '1990-08-22',
      age: 34,
      status: 'approved',
      docFileURL: null,
      selfieFileURL: null,
      notes: [{ text: 'Documentos verificados con éxito.', createdAt: new Date().toISOString(), author: 'Admin' }],
      sanctions: [],
      submittedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    },
    {
      id: 'SKL-003',
      submissionId: 'SKL-003',
      username: 'carlosrm',
      firstName: 'Carlos',
      lastName: 'Ramírez Mora',
      fullName: 'Carlos Ramírez Mora',
      docNumber: 'MX987654321',
      nationality: 'MX',
      email: 'carlos.rm@ejemplo.com',
      phone: '+52 55 1234 5678',
      dob: '1985-12-03',
      age: 39,
      status: 'rejected',
      docFileURL: null,
      selfieFileURL: null,
      notes: [{ text: 'Imagen del documento con baja resolución, no legible.', createdAt: new Date().toISOString(), author: 'Admin' }],
      sanctions: [{
        reason: 'Intento de falsificación de documento',
        days: 90,
        evidenceURL: null,
        appliedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000 * 90).toISOString(),
        appliedBy: 'Admin',
      }],
      submittedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    },
  ];
}

// ── UTILITY ───────────────────────────────────────────────
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.textContent = message;
  el.className = `form-alert form-alert--sm is-${type}`;
}

function clearAlert(el) {
  if (!el) return;
  el.textContent = '';
  el.className = 'form-alert form-alert--sm';
}
