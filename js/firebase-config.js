/**
 * ─────────────────────────────────────────────────────────
 *  js/firebase-config.js
 *  SYKLO KYC — Firebase Configuration Placeholder
 * ─────────────────────────────────────────────────────────
 *
 *  INSTRUCCIONES DE CONFIGURACIÓN:
 *  1. Ve a https://console.firebase.google.com/
 *  2. Crea un proyecto llamado "syklo-kyc" (o el nombre que elijas)
 *  3. En "Configuración del proyecto" > "Tus apps" > agrega una app Web
 *  4. Copia el objeto firebaseConfig que Firebase te proporciona
 *  5. Pégalo en el bloque de FIREBASE CONFIG más abajo
 *  6. Habilita en Firebase Console:
 *     - Authentication > Email/Password
 *     - Firestore Database
 *     - Storage
 *
 *  SEGURIDAD (Firestore Rules recomendadas):
 *  rules_version = '2';
 *  service cloud.firestore {
 *    match /databases/{database}/documents {
 *      // Solo admins autenticados pueden leer/escribir usuarios
 *      match /users/{userId} {
 *        allow read, write: if request.auth != null && request.auth.token.admin == true;
 *        // El propio usuario puede crear su solicitud
 *        allow create: if true; // Restringir más en producción
 *      }
 *    }
 *  }
 */

// ── FIREBASE CONFIG ──────────────────────────────────────
// TODO: Reemplaza estos valores con los de tu proyecto Firebase
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

// ── FIREBASE INITIALIZATION ──────────────────────────────
// TODO: Descomenta este bloque cuando agregues las credenciales reales
// import { initializeApp }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
// import { getAuth }               from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
// import { getFirestore }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
// import { getStorage }            from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
//
// const app       = initializeApp(firebaseConfig);
// export const auth    = getAuth(app);
// export const db      = getFirestore(app);
// export const storage = getStorage(app);
//
// console.log("[Syklo] Firebase inicializado correctamente.");

// ── MOCK EXPORTS (para desarrollo sin Firebase) ──────────
// Estos exports vacíos permiten que los demás módulos importen
// sin errores mientras Firebase no está configurado.
export const auth    = null;
export const db      = null;
export const storage = null;

console.warn(
  "[Syklo] Firebase no configurado. " +
  "Edita js/firebase-config.js con tus credenciales para habilitar " +
  "Authentication, Firestore y Storage."
);
