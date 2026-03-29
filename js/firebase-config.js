/**
 * ─────────────────────────────────────────────────────────
 * js/firebase-config.js
 * SYKLO KYC — Configuración principal de Firebase
 * ─────────────────────────────────────────────────────────
 */

// 1. Importaciones usando URLs CDN para JavaScript Vanilla (sin empaquetadores)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// 2. Exportamos la configuración para poder usarla en la creación de nuevos admins (App Secundaria)
export const firebaseConfig = {
  apiKey: "AIzaSyBUZMD89bH1ENbpHizUzRlyn4j6BBsuhXU",
  authDomain: "syklo-kyc.firebaseapp.com",
  projectId: "syklo-kyc",
  storageBucket: "syklo-kyc.firebasestorage.app",
  messagingSenderId: "492305606101",
  appId: "1:492305606101:web:2d49db81dad3b2c909095c"
};

// 3. Inicializar la aplicación principal de Firebase
const app = initializeApp(firebaseConfig);

// 4. Exportar los servicios para usarlos en el resto del proyecto
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log("[Syklo] Firebase inicializado correctamente.");
