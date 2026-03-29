/**
 * js/auth.js
 * SYKLO KYC — Autenticación Real con Firebase
 */

import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginAlert = document.getElementById('login-alert');
const logoutBtn = document.getElementById('logout-btn');
const adminName = document.getElementById('admin-name');
const adminEmailDisp = document.getElementById('admin-email-display');
const adminAvatar = document.getElementById('admin-avatar');
const togglePass = document.getElementById('toggle-pass');
const passInput = document.getElementById('admin-password');

// 1. Escuchar el estado de la sesión en tiempo real
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Si hay sesión, buscamos los datos del admin en Firestore
    try {
      const docRef = doc(db, 'admins', user.uid);
      const docSnap = await getDoc(docRef);
      
      let profileName = user.email.split('@')[0];
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        profileName = data.fullName || profileName;
      }
      showDashboard(user, profileName);
    } catch (error) {
      console.error("Error obteniendo perfil:", error);
      showDashboard(user, user.email.split('@')[0]);
    }
  } else {
    showLogin();
  }
});

function showDashboard(user, profileName) {
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');

  if (adminName) adminName.textContent = profileName;
  if (adminEmailDisp) adminEmailDisp.textContent = user.email;
  if (adminAvatar) adminAvatar.textContent = profileName.charAt(0).toUpperCase();

  document.dispatchEvent(new CustomEvent('syklo:admin-ready', { detail: { user } }));
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  dashboard.classList.add('hidden');
}

// 2. Procesar el formulario de inicio de sesión
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert(loginAlert);

  const email = document.getElementById('admin-email')?.value.trim();
  const password = document.getElementById('admin-password')?.value;

  if (!email || !password) {
    showAlert(loginAlert, 'Por favor completa todos los campos.', 'error');
    return;
  }

  setLoading(loginBtn, true);

  try {
    // Llamada real a Firebase
    await signInWithEmailAndPassword(auth, email, password);
    // Nota: No llamamos a showDashboard() aquí porque onAuthStateChanged se encarga automáticamente
  } catch (error) {
    console.error('[Auth] Error:', error);
    showAlert(loginAlert, 'Correo o contraseña incorrectos.', 'error');
  } finally {
    setLoading(loginBtn, false);
  }
});

// 3. Cerrar Sesión
logoutBtn?.addEventListener('click', async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('[Auth] Error al cerrar sesión:', error);
  }
});

// 4. Utilidades visuales e interacciones
togglePass?.addEventListener('click', () => {
  const isPassword = passInput.type === 'password';
  passInput.type = isPassword ? 'text' : 'password';
  const eyeIcon = document.getElementById('eye-icon');
  if (eyeIcon) {
    eyeIcon.innerHTML = isPassword 
      ? `<path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7 a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>`
      : `<path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('search-input')?.focus();
  }
});

document.querySelectorAll('.sidebar__link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    document.querySelectorAll('.sidebar__link').forEach(l => l.classList.toggle('sidebar__link--active', l.dataset.view === view));
    document.querySelectorAll('.dash-view').forEach(v => v.classList.toggle('hidden', v.id !== `view-${view}`));
    const titles = { submissions: 'Solicitudes KYC', stats: 'Estadísticas', team: 'Gestión de Equipo' };
    const dashTitle = document.getElementById('dash-title');
    if (dashTitle) dashTitle.textContent = titles[view] || view;
  });
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

function setLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle('is-loading', isLoading);
}
