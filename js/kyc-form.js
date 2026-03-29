/**
 * ─────────────────────────────────────────────────────────
 *  js/kyc-form.js
 *  SYKLO KYC — Lógica y Validaciones del Formulario de Usuario
 * ─────────────────────────────────────────────────────────
 *  Gestiona:
 *  - Validaciones en tiempo real de todos los campos
 *  - Validación de mayoría de edad (≥18)
 *  - Upload con drag & drop y previsualización
 *  - Envío de datos a Firestore y archivos a Cloud Storage
 */

// TODO: Importar Firebase cuando esté configurado:
// import { db, storage } from './firebase-config.js';
// import { collection, addDoc, serverTimestamp }
//   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// import { ref, uploadBytesResumable, getDownloadURL }
//   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

import { db, storage } from './firebase-config.js';

// ── DOM REFERENCES ────────────────────────────────────────
const kycForm    = document.getElementById('kyc-form');
const kycSuccess = document.getElementById('kyc-success');
const submitBtn  = document.getElementById('submit-btn');
const formAlert  = document.getElementById('form-alert');
const dobInput   = document.getElementById('dob');
const ageDisplay = document.getElementById('age-display');

// File inputs
const docInput    = document.getElementById('doc_file');
const selfieInput = document.getElementById('selfie_file');

// Previews
const docPreview    = document.getElementById('doc-preview');
const selfiePreview = document.getElementById('selfie-preview');
const docDropzoneUI    = document.getElementById('doc-dropzone-ui');
const selfieDropzoneUI = document.getElementById('selfie-dropzone-ui');

// ── STATE ─────────────────────────────────────────────────
let selectedDocFile    = null;
let selectedSelfieFile = null;

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initDropzones();
  initDateValidation();
  initRealtimeValidation();
});

// ═══════════════════════════════════════════
// DROPZONES — Drag & Drop + Preview
// ═══════════════════════════════════════════
function initDropzones() {
  setupDropzone({
    dropzoneId: 'doc-dropzone',
    input:      docInput,
    uiEl:       docDropzoneUI,
    previewEl:  docPreview,
    accept:     ['image/', 'application/pdf'],
    maxBytes:   10 * 1024 * 1024, // 10 MB
    onFileSelected: (file) => { selectedDocFile = file; },
    onFileRemoved:  ()     => { selectedDocFile = null; },
    errorFieldId: 'doc_file-error',
  });

  setupDropzone({
    dropzoneId: 'selfie-dropzone',
    input:      selfieInput,
    uiEl:       selfieDropzoneUI,
    previewEl:  selfiePreview,
    accept:     ['image/', 'video/'],
    maxBytes:   50 * 1024 * 1024, // 50 MB
    onFileSelected: (file) => { selectedSelfieFile = file; },
    onFileRemoved:  ()     => { selectedSelfieFile = null; },
    errorFieldId: 'selfie_file-error',
  });
}

/**
 * Configura un dropzone con drag & drop, previsualización y validación.
 */
function setupDropzone({ dropzoneId, input, uiEl, previewEl, accept, maxBytes, onFileSelected, onFileRemoved, errorFieldId }) {
  const zone = document.getElementById(dropzoneId);
  if (!zone || !input) return;

  const errorEl = document.getElementById(errorFieldId);

  // Click sobre la zona
  zone.addEventListener('click', (e) => {
    if (!e.target.classList.contains('preview-remove')) {
      input.click();
    }
  });

  // Keypress accesibilidad
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });

  // Drag events
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-dragover');
    const file = e.dataTransfer?.files[0];
    if (file) processFile(file);
  });

  // Input change
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) processFile(file);
  });

  function processFile(file) {
    clearError(errorEl);

    // Validar tipo
    const isAccepted = accept.some(type => file.type.startsWith(type));
    if (!isAccepted) {
      setError(errorEl, `Tipo de archivo no permitido: ${file.type || 'desconocido'}`);
      return;
    }

    // Validar tamaño
    if (file.size > maxBytes) {
      const maxMB = maxBytes / (1024 * 1024);
      setError(errorEl, `El archivo supera el límite de ${maxMB} MB.`);
      return;
    }

    onFileSelected(file);
    renderPreview(file, uiEl, previewEl, () => {
      // Al eliminar
      onFileRemoved();
      input.value = '';
      clearError(errorEl);
    });
  }
}

/**
 * Renderiza la vista previa del archivo en el dropzone.
 */
function renderPreview(file, uiEl, previewEl, onRemove) {
  // Ocultar UI del dropzone
  uiEl.style.opacity = '0';
  uiEl.style.pointerEvents = 'none';

  previewEl.innerHTML = '';
  previewEl.classList.add('has-file');

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'preview-remove';
  removeBtn.title = 'Eliminar archivo';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    previewEl.innerHTML = '';
    previewEl.classList.remove('has-file');
    uiEl.style.opacity = '1';
    uiEl.style.pointerEvents = '';
    onRemove();
  });

  if (file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.alt = 'Vista previa del documento';
    img.onload = () => URL.revokeObjectURL(img.src);
    previewEl.appendChild(img);
  } else if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.muted = true;
    previewEl.appendChild(video);
  } else if (file.type === 'application/pdf') {
    const pdfIcon = document.createElement('div');
    pdfIcon.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--clr-text-dim);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="48" height="48" style="margin:0 auto 10px">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p style="font-size:0.82rem;font-weight:600">${file.name}</p>
        <p style="font-size:0.72rem;color:var(--clr-text-muted)">${formatFileSize(file.size)}</p>
      </div>
    `;
    previewEl.appendChild(pdfIcon);
  }

  previewEl.appendChild(removeBtn);
}

// ═══════════════════════════════════════════
// DATE — Cálculo de edad y validación de mayoría
// ═══════════════════════════════════════════
function initDateValidation() {
  dobInput?.addEventListener('input', updateAgeDisplay);
  dobInput?.addEventListener('change', updateAgeDisplay);
}

function updateAgeDisplay() {
  const dob = dobInput?.value;
  if (!dob) {
    if (ageDisplay) ageDisplay.textContent = '';
    return;
  }

  const age = calculateAge(dob);
  if (age < 0) return;

  if (ageDisplay) {
    ageDisplay.textContent = `→ Edad calculada: ${age} año${age === 1 ? '' : 's'}`;
  }
}

/**
 * Calcula la edad exacta a partir de una fecha de nacimiento (string YYYY-MM-DD).
 */
export function calculateAge(dobString) {
  const today = new Date();
  const birthDate = new Date(dobString);
  if (isNaN(birthDate.getTime())) return -1;

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// ═══════════════════════════════════════════
// REAL-TIME VALIDATION
// ═══════════════════════════════════════════
function initRealtimeValidation() {
  const fields = ['username', 'first_name', 'last_name', 'doc_number', 'nationality', 'email', 'phone', 'dob'];
  fields.forEach(field => {
    const el = document.getElementById(field);
    if (!el) return;
    el.addEventListener('blur', () => validateField(field, el.value));
    el.addEventListener('input', () => {
      if (el.classList.contains('is-invalid')) {
        validateField(field, el.value);
      }
    });
  });
}

/**
 * Valida un campo individual. Retorna true si es válido.
 */
export function validateField(fieldName, value) {
  const el = document.getElementById(fieldName);
  const errEl = document.getElementById(`${fieldName}-error`);
  let error = '';

  switch (fieldName) {
    case 'username':
      if (!value.trim()) {
        error = 'El nombre de usuario es obligatorio.';
      } else if (value.length < 3) {
        error = 'Mínimo 3 caracteres.';
      } else if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
        error = 'Solo letras, números, guiones y puntos.';
      }
      break;

    case 'first_name':
    case 'last_name':
      if (!value.trim()) {
        error = 'Este campo es obligatorio.';
      } else if (value.trim().length < 2) {
        error = 'Mínimo 2 caracteres.';
      }
      break;

    case 'doc_number':
      if (!value.trim()) {
        error = 'El número de documento es obligatorio.';
      } else if (value.trim().length < 4) {
        error = 'Número de documento inválido.';
      }
      break;

    case 'nationality':
      if (!value) error = 'Selecciona tu país.';
      break;

    case 'email':
      if (!value.trim()) {
        error = 'El correo es obligatorio.';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        error = 'Formato de correo inválido.';
      }
      break;

    case 'phone':
      if (!value.trim()) {
        error = 'El teléfono es obligatorio.';
      } else if (!/^\+?[\d\s\-().]{7,20}$/.test(value)) {
        error = 'Número de teléfono inválido.';
      }
      break;

    case 'dob': {
      if (!value) {
        error = 'La fecha de nacimiento es obligatoria.';
      } else {
        const age = calculateAge(value);
        if (age < 0) {
          error = 'Fecha inválida.';
        } else if (age < 18) {
          error = `Debes tener al menos 18 años para continuar. Edad detectada: ${age} años.`;
        } else if (age > 120) {
          error = 'Fecha de nacimiento fuera de rango.';
        }
      }
      break;
    }
  }

  if (el) el.classList.toggle('is-invalid', Boolean(error));
  if (errEl) errEl.textContent = error;
  return !error;
}

/**
 * Valida el formulario completo. Retorna true si todo es válido.
 */
function validateFullForm(data) {
  let isValid = true;

  const textFields = ['username', 'first_name', 'last_name', 'doc_number', 'nationality', 'email', 'phone', 'dob'];
  textFields.forEach(field => {
    if (!validateField(field, data[field] || '')) isValid = false;
  });

  // Archivos
  if (!selectedDocFile) {
    setError(document.getElementById('doc_file-error'), 'El documento de identidad es obligatorio.');
    isValid = false;
  }
  if (!selectedSelfieFile) {
    setError(document.getElementById('selfie_file-error'), 'La selfie / video facial es obligatoria.');
    isValid = false;
  }

  // Consent
  const consentEl = document.getElementById('consent');
  if (!consentEl?.checked) {
    setError(document.getElementById('consent-error'), 'Debes aceptar los términos para continuar.');
    isValid = false;
  } else {
    clearError(document.getElementById('consent-error'));
  }

  return isValid;
}

// ═══════════════════════════════════════════
// FORM SUBMIT
// ═══════════════════════════════════════════
kycForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert(formAlert);

  // Recopilar datos
  const formData = new FormData(kycForm);
  const data = Object.fromEntries(formData.entries());

  // Validación completa
  if (!validateFullForm(data)) {
    showAlert(formAlert, '⚠ Corrige los errores antes de continuar.', 'error');
    // Scroll al primer error
    const firstError = kycForm.querySelector('.is-invalid, .form-error:not(:empty)');
    firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  setLoading(submitBtn, true);

  try {
    // ── PASO 1: SUBIR ARCHIVOS A CLOUD STORAGE ─────────────
    let docFileURL    = null;
    let selfieFileURL = null;

    // TODO: Descomenta para Firebase Storage real:
    // const submissionId = crypto.randomUUID();
    //
    // const docRef    = ref(storage, `kyc/${submissionId}/identity_doc`);
    // const selfieRef = ref(storage, `kyc/${submissionId}/selfie`);
    //
    // const [docUpload, selfieUpload] = await Promise.all([
    //   uploadBytesResumable(docRef, selectedDocFile),
    //   uploadBytesResumable(selfieRef, selectedSelfieFile),
    // ]);
    //
    // [docFileURL, selfieFileURL] = await Promise.all([
    //   getDownloadURL(docUpload.ref),
    //   getDownloadURL(selfieUpload.ref),
    // ]);

    // Mock upload (demo)
    await simulateDelay(800);
    const submissionId = `SKL-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    docFileURL    = URL.createObjectURL(selectedDocFile);
    selfieFileURL = URL.createObjectURL(selectedSelfieFile);

    // ── PASO 2: GUARDAR DATOS EN FIRESTORE ─────────────────
    const kycPayload = {
      submissionId,
      username:    data.username.trim(),
      firstName:   data.first_name.trim(),
      lastName:    data.last_name.trim(),
      fullName:    `${data.first_name.trim()} ${data.last_name.trim()}`,
      docNumber:   data.doc_number.trim(),
      nationality: data.nationality,
      email:       data.email.trim().toLowerCase(),
      phone:       data.phone.trim(),
      dob:         data.dob,
      age:         calculateAge(data.dob),
      status:      'pending',           // pending | approved | rejected
      docFileURL,
      selfieFileURL,
      notes:       [],                  // Anotaciones del admin
      sanctions:   [],                  // Sanciones aplicadas
      // TODO: Reemplazar submittedAt con serverTimestamp() de Firestore:
      // submittedAt: serverTimestamp(),
      submittedAt: new Date().toISOString(),
    };

    // TODO: Guardar datos en la colección 'users' de Firestore:
    // const docRef = await addDoc(collection(db, 'users'), kycPayload);
    // console.log('[KYC] Solicitud guardada con ID:', docRef.id);

    // Mock: guardar en localStorage para demo del admin dashboard
    const existing = JSON.parse(localStorage.getItem('syklo_kyc_submissions') || '[]');
    existing.unshift(kycPayload);
    localStorage.setItem('syklo_kyc_submissions', JSON.stringify(existing));

    console.log('[KYC] Datos preparados para Firestore:', kycPayload);

    // ── PASO 3: MOSTRAR ESTADO DE ÉXITO ────────────────────
    kycForm.classList.add('hidden');
    kycSuccess.classList.remove('hidden');

    const successIdEl = document.getElementById('success-submission-id');
    if (successIdEl) successIdEl.textContent = `ID de solicitud: ${submissionId}`;

  } catch (error) {
    console.error('[KYC] Error al enviar:', error);
    showAlert(
      formAlert,
      'Ocurrió un error al enviar tu solicitud. Por favor inténtalo de nuevo.',
      'error'
    );
  } finally {
    setLoading(submitBtn, false);
  }
});

// ── UTILITY ───────────────────────────────────────────────
function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.textContent = message;
  el.className = `form-alert is-${type}`;
}

function clearAlert(el) {
  if (!el) return;
  el.textContent = '';
  el.className = 'form-alert';
}

function setError(el, message) {
  if (!el) return;
  el.textContent = message;
}

function clearError(el) {
  if (!el) return;
  el.textContent = '';
}

function setLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle('is-loading', isLoading);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
