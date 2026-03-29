/**
 * ─────────────────────────────────────────────────────────
 *  js/auth.js
 *  SYKLO KYC — Módulo de Autenticación de Administrador
 * ─────────────────────────────────────────────────────────
 *  Gestiona el login/logout de administradores usando
 *  Firebase Authentication (Email + Password).
 *  Controla la visibilidad del login-screen vs. dashboard.
 */

// TODO: Reemplazar con imports reales de Firebase cuando esté configurado
// import { auth } from './firebase-config.js';
// import {
//   signInWithEmailAndPassword,
//   signOut,
//   onAuthStateChanged
// } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { auth } from './firebase-config.js';

// ── DOM REFERENCES ────────────────────────────────────────
const loginScreen    = document.getElementById('login-screen');
const dashboard      = document.getElementById('dashboard');
const loginForm      = document.getElementById('login-form');
const loginBtn       = document.getElementById('login-btn');
const loginAlert     = document.getElementById('login-alert');
const logoutBtn      = document.getElementById('logout-btn');
const adminName      = document.getElementById('admin-name');
const adminEmailDisp = document.getElementById('admin-email-display');
const adminAvatar    = document.getElementById('admin-avatar');
const togglePass     = document.getElementById('toggle-pass');
const passInput      = document.getElementById('admin-password');

// ── MOCK SESSION (para demo sin Firebase) ─────────────────
// En producción, esto se controla con onAuthStateChanged.
let mockSession = null;

// ── HELPER: Mostrar/ocultar pantallas ─────────────────────
function showDashboard(user) {
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');

  // Actualizar info del admin en sidebar
  const name  = user.displayName || user.email?.split('@')[0] || 'Admin';
  const email = user.email || '';
  const initials = name.charAt(0).toUpperCase();

  if (adminName)      adminName.textContent      = name;
  if (adminEmailDisp) adminEmailDisp.textContent = email;
  if (adminAvatar)    adminAvatar.textContent     = initials;

  // Disparar evento para que el dashboard cargue los datos
  document.dispatchEvent(new CustomEvent('syklo:admin-ready', { detail: { user } }));
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  dashboard.classList.add('hidden');
}

// ── FIREBASE AUTH STATE LISTENER ──────────────────────────
// TODO: Descomenta cuando Firebase esté configurado.
// Esta función se dispara automáticamente cada vez que el
// estado de sesión cambia (login, logout, refresh de página).
//
// onAuthStateChanged(auth, (user) => {
//   if (user) {
//     showDashboard(user);
//   } else {
//     showLogin();
//   }
// });

// ── MOCK AUTH STATE (demo sin Firebase) ──────────────────
// Eliminar este bloque cuando uses Firebase real.
function checkMockSession() {
  const savedSession = sessionStorage.getItem('syklo_admin_session');
  if (savedSession) {
    mockSession = JSON.parse(savedSession);
    showDashboard(mockSession);
  } else {
    showLogin();
  }
}
checkMockSession();

// ── LOGIN FORM HANDLER ────────────────────────────────────
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearAlert(loginAlert);

  const email    = document.getElementById('admin-email')?.value.trim();
  const password = document.getElementById('admin-password')?.value;

  // Validación básica
  if (!email || !password) {
    showAlert(loginAlert, 'Por favor completa todos los campos.', 'error');
    return;
  }
  if (!isValidEmail(email)) {
    showAlert(loginAlert, 'Introduce un correo electrónico válido.', 'error');
    return;
  }

  setLoading(loginBtn, true);

  try {
    // ── CON FIREBASE REAL ────────────────────────────────
    // TODO: Reemplaza el bloque mock por este cuando Firebase esté listo:
    //
    // const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // const user = userCredential.user;
    // showDashboard(user);

    // ── MOCK LOGIN (demo) ────────────────────────────────
    await simulateDelay(1200);
    if (email === 'admin@syklo.com' && password === 'syklo2025') {
      const fakeUser = {
        email,
        displayName: 'Administrador',
        uid: 'mock-admin-uid',
      };
      mockSession = fakeUser;
      sessionStorage.setItem('syklo_admin_session', JSON.stringify(fakeUser));
      showDashboard(fakeUser);
    } else {
      throw new Error('auth/invalid-credential');
    }
    // ── FIN MOCK ─────────────────────────────────────────

  } catch (error) {
    console.error('[Auth] Error al iniciar sesión:', error);
    const msg = getAuthErrorMessage(error.code || error.message);
    showAlert(loginAlert, msg, 'error');
  } finally {
    setLoading(loginBtn, false);
  }
});

// ── LOGOUT HANDLER ────────────────────────────────────────
logoutBtn?.addEventListener('click', async () => {
  try {
    // TODO: Descomenta para Firebase real:
    // await signOut(auth);

    // Mock logout
    mockSession = null;
    sessionStorage.removeItem('syklo_admin_session');
    showLogin();
    loginForm?.reset();
    clearAlert(loginAlert);
  } catch (error) {
    console.error('[Auth] Error al cerrar sesión:', error);
  }
});

// ── PASSWORD VISIBILITY TOGGLE ────────────────────────────
togglePass?.addEventListener('click', () => {
  const isPassword = passInput.type === 'password';
  passInput.type = isPassword ? 'text' : 'password';

  const eyeIcon = document.getElementById('eye-icon');
  if (eyeIcon) {
    if (isPassword) {
      // Ojo tachado
      eyeIcon.innerHTML = `
        <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7 
                 a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242
                 M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 
                 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
      `;
    } else {
      eyeIcon.innerHTML = `
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 
                 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
      `;
    }
  }
});

// ── KEYBOARD SHORTCUT (⌘K / Ctrl+K para focus search) ────
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('search-input')?.focus();
  }
});

// ── SIDEBAR NAVIGATION ────────────────────────────────────
document.querySelectorAll('.sidebar__link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    navigateTo(view);
  });
});

export function navigateTo(view) {
  // Update active link
  document.querySelectorAll('.sidebar__link').forEach(l => {
    l.classList.toggle('sidebar__link--active', l.dataset.view === view);
  });
  // Show/hide views
  document.querySelectorAll('.dash-view').forEach(v => {
    v.classList.toggle('hidden', v.id !== `view-${view}`);
  });
  // Update title
  const titles = { submissions: 'Solicitudes KYC', stats: 'Estadísticas' };
  const dashTitle = document.getElementById('dash-title');
  if (dashTitle) dashTitle.textContent = titles[view] || view;
}

// ── UTILITY FUNCTIONS ─────────────────────────────────────
export function showAlert(el, message, type = 'error') {
  if (!el) return;
  el.textContent = message;
  el.className = `form-alert is-${type}`;
}

export function clearAlert(el) {
  if (!el) return;
  el.textContent = '';
  el.className = 'form-alert';
}

export function setLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle('is-loading', isLoading);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function simulateDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAuthErrorMessage(code) {
  const messages = {
    'auth/invalid-credential':        'Correo o contraseña incorrectos.',
    'auth/user-not-found':            'No existe una cuenta con ese correo.',
    'auth/wrong-password':            'Contraseña incorrecta.',
    'auth/too-many-requests':         'Demasiados intentos fallidos. Intenta más tarde.',
    'auth/user-disabled':             'Esta cuenta ha sido desactivada.',
    'auth/network-request-failed':    'Error de red. Verifica tu conexión.',
    'auth/invalid-email':             'El formato del correo no es válido.',
  };
  return messages[code] || 'Error de autenticación. Inténtalo de nuevo.';
}
