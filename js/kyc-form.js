/**
 * js/kyc-form.js
 * SYKLO KYC — Lógica del Formulario con Firebase Real
 */

import { db, storage } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const kycForm = document.getElementById('kyc-form');
const kycSuccess = document.getElementById('kyc-success');
const submitBtn = document.getElementById('submit-btn');
const formAlert = document.getElementById('form-alert');
const dobInput = document.getElementById('dob');
const ageDisplay = document.getElementById('age-display');

const docInput = document.getElementById('doc_file');
const selfieInput = document.getElementById('selfie_file');
const docPreview = document.getElementById('doc-preview');
const selfiePreview = document.getElementById('selfie-preview');
const docDropzoneUI = document.getElementById('doc-dropzone-ui');
const selfieDropzoneUI = document.getElementById('selfie-dropzone-ui');

let selectedDocFile = null;
let selectedSelfieFile = null;

document.addEventListener('DOMContentLoaded', () => {
  initDropzones();
  initDateValidation();
  initRealtimeValidation();
});

function initDropzones() {
  setupDropzone({
    dropzoneId: 'doc-dropzone',
    input: docInput,
    uiEl: docDropzoneUI,
    previewEl: docPreview,
    accept: ['image/', 'application/pdf'],
    maxBytes: 10 * 1024 * 1024,
    onFileSelected: (file) => { selectedDocFile = file; },
    onFileRemoved: () => { selectedDocFile = null; },
    errorFieldId: 'doc_file-error',
  });

  setupDropzone({
    dropzoneId: 'selfie-dropzone',
    input: selfieInput,
    uiEl: selfieDropzoneUI,
    previewEl: selfiePreview,
    accept: ['image/', 'video/'],
    maxBytes: 50 * 1024 * 1024,
    onFileSelected: (file) => { selectedSelfieFile = file; },
    onFileRemoved: () => { selectedSelfieFile = null; },
    errorFieldId: 'selfie_file-error',
  });
}

function setupDropzone({ dropzoneId, input, uiEl, previewEl, accept, maxBytes, onFileSelected, onFileRemoved, errorFieldId }) {
  const zone = document.getElementById(dropzoneId);
  if (!zone || !input) return;
  const errorEl = document.getElementById(errorFieldId);

  zone.addEventListener('click', (e) => {
    if (!e.target.classList.contains('preview-remove')) input.click();
  });

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

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) processFile(file);
  });

  function processFile(file) {
    clearError(errorEl);
    const isAccepted = accept.some(type => file.type.startsWith(type));
    if (!isAccepted) {
      setError(errorEl, `Tipo de archivo no permitido: ${file.type || 'desconocido'}`);
      return;
    }
    if (file.size > maxBytes) {
      setError(errorEl, `El archivo supera el límite de ${maxBytes / (1024 * 1024)} MB.`);
      return;
    }
    onFileSelected(file);
    renderPreview(file, uiEl, previewEl, () => {
      onFileRemoved();
      input.value = '';
      clearError(errorEl);
    });
  }
}

function renderPreview(file, uiEl, previewEl, onRemove) {
  uiEl.style.opacity = '0';
  uiEl.style.pointerEvents = 'none';
  previewEl.innerHTML = '';
  previewEl.classList.add('has-file');

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'preview-remove';
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
    img.onload = () => URL.revokeObjectURL(img.src);
    previewEl.appendChild(img);
  } else if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    previewEl.appendChild(video);
  } else if (file.type === 'application/pdf') {
    previewEl.innerHTML = `<div style="padding:24px;color:var(--clr-text-dim);text-align:center;">PDF Seleccionado</div>`;
  }
  previewEl.appendChild(removeBtn);
}

function initDateValidation() {
  dobInput?.addEventListener('input', updateAgeDisplay);
}

function updateAgeDisplay() {
  const dob = dobInput?.value;
  if (!dob) {
    if (ageDisplay) ageDisplay.textContent = '';
    return;
  }
  const age = calculateAge(dob);
  if (age >= 0 && ageDisplay) {
    ageDisplay.textContent = `→ Edad calculada: ${age} año${age === 1 ? '' : 's'}`;
  }
}

export function calculateAge(dobString) {
  const today = new Date();
  const birthDate = new Date(dobString);
  if (isNaN(birthDate.getTime())) return -1;
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function initRealtimeValidation() {
  const fields = ['username', 'first_name', 'last_name', 'doc_number', 'nationality', 'email', 'phone', 'dob'];
  fields.forEach(field => {
    const el = document.getElementById(field);
    if (!el) return;
    el.addEventListener('blur', () => validateField(field, el.value));
    el.addEventListener('input', () => {
      if (el.classList.contains('is-invalid')) validateField(field, el.value);
    });
  });
}

export function validateField(fieldName, value) {
  const el = document.getElementById(fieldName);
  const errEl = document.getElementById(`${fieldName}-error`);
  let error = '';

  switch (fieldName) {
    case 'username':
      if (!value.trim()) error = 'Obligatorio.';
      else if (value.length < 3) error = 'Mínimo 3 caracteres.';
      break;
    case 'first_name':
    case 'last_name':
      if (!value.trim()) error = 'Obligatorio.';
      break;
    case 'doc_number':
      if (!value.trim()) error = 'Obligatorio.';
      break;
    case 'nationality':
      if (!value) error = 'Selecciona tu país.';
      break;
    case 'email':
      if (!value.trim()) error = 'Obligatorio.';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'Correo inválido.';
      break;
    case 'phone':
      if (!value.trim()) error = 'Obligatorio.';
      break;
    case 'dob':
      if (!value) error = 'Obligatorio.';
      else {
        const age = calculateAge(value);
        if (age < 0) error = 'Fecha inválida.';
        else if (age < 18) error = `Debes tener 18 años. Tienes: ${age}.`;
      }
      break;
  }

  if (el) el.classList.toggle('is-invalid', Boolean(error));
  if (errEl) errEl.textContent = error;
  return !error;
}

function validateFullForm(data) {
  let isValid = true;
  const textFields = ['username', 'first_name', 'last_name', 'doc_number', 'nationality', 'email', 'phone', 'dob'];
  
  textFields.forEach(field => {
    if (!validateField(field, data[field] || '')) isValid = false;
  });

  if (!selectedDocFile) {
    setError(document.getElementById('doc_file-error'), 'Documento obligatorio.');
    isValid = false;
  }
  if (!selectedSelfieFile) {
    setError(document.getElementById('selfie_file-error'), 'Selfie/Video obligatorio.');
    isValid = false;
  }

  const consentEl = document.getElementById('consent');
  if (!consentEl?.checked) {
    setError(document.getElementById('consent-error'), 'Debes aceptar los términos.');
    isValid = false;
  } else {
    clearError(document.getElementById('consent-error'));
  }

  return isValid;
}

// ── ENVÍO REAL A FIREBASE ──
kycForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert(formAlert);

  const formData = new FormData(kycForm);
  const data = Object.fromEntries(formData.entries());

  if (!validateFullForm(data)) {
    showAlert(formAlert, '⚠ Corrige los errores antes de continuar.', 'error');
    return;
  }

  setLoading(submitBtn, true);

  try {
    // 1. Generar un ID único para los archivos
    const submissionId = `SKL-${Date.now()}`;

    // 2. Referencias en Cloud Storage
    const docRef = ref(storage, `kyc_documents/${submissionId}/identity_doc`);
    const selfieRef = ref(storage, `kyc_documents/${submissionId}/selfie`);

    // 3. Subir ambos archivos al mismo tiempo
    const [docUpload, selfieUpload] = await Promise.all([
      uploadBytesResumable(docRef, selectedDocFile),
      uploadBytesResumable(selfieRef, selectedSelfieFile),
    ]);

    // 4. Obtener las URLs públicas y seguras de los archivos
    const docFileURL = await getDownloadURL(docUpload.ref);
    const selfieFileURL = await getDownloadURL(selfieUpload.ref);

    // 5. Preparar el paquete de datos
    const kycPayload = {
      submissionId,
      username: data.username.trim(),
      firstName: data.first_name.trim(),
      lastName: data.last_name.trim(),
      fullName: `${data.first_name.trim()} ${data.last_name.trim()}`,
      docNumber: data.doc_number.trim(),
      nationality: data.nationality,
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      dob: data.dob,
      age: calculateAge(data.dob),
      status: 'pending',
      docFileURL,
      selfieFileURL,
      notes: [],
      sanctions: [],
      submittedAt: serverTimestamp(),
    };

    // 6. Guardar todo en la colección 'users' de Firestore
    await addDoc(collection(db, 'users'), kycPayload);

    // 7. Mostrar pantalla de éxito
    kycForm.classList.add('hidden');
    kycSuccess.classList.remove('hidden');
    const successIdEl = document.getElementById('success-submission-id');
    if (successIdEl) successIdEl.textContent = `ID: ${submissionId}`;

  } catch (error) {
    console.error('[KYC] Error al enviar:', error);
    showAlert(formAlert, 'Ocurrió un error de conexión con los servidores. Inténtalo de nuevo.', 'error');
  } finally {
    setLoading(submitBtn, false);
  }
});

function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.textContent = message;
  el.className = `form-alert is-${type}`;
  el.style.display = 'flex';
}

function clearAlert(el) {
  if (!el) return;
  el.textContent = '';
  el.className = 'form-alert';
  el.style.display = 'none';
}

function setError(el, message) { if (el) el.textContent = message; }
function clearError(el) { if (el) el.textContent = ''; }
function setLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle('is-loading', isLoading);
}
