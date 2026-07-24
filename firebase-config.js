// ============================================================
//  TollyVerse.mp3 — Firebase Configuration
//  Replace the values below with YOUR Firebase project config.
//  Get them from: https://console.firebase.google.com
//  Project Settings → Your apps → SDK setup and configuration
// ============================================================

const firebaseConfig = {
  apiKey:            "AIzaSyA-6LCNTKs8CbQJ7AMQCUGhdSGLlyhY8Ak",
  authDomain:        "tollyverse-f4bb3.firebaseapp.com",
  projectId:         "tollyverse-f4bb3",
  storageBucket:     "tollyverse-f4bb3.firebasestorage.app",
  messagingSenderId: "833668546260",
  appId:             "1:833668546260:web:cf39d261a59713e4090541",
  measurementId:     "G-YY1KQJMG5S"
};

// ============================================================
//  ADMIN EMAILS — Add your Gmail here
// ============================================================
const ADMIN_EMAILS = [
  "admin@gmail.com"   // ← Replace with YOUR Gmail address
];

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const auth   = firebase.auth();
const db     = firebase.firestore();

const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.addScope('profile');
googleProvider.addScope('email');
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Firestore settings (ignoreUndefinedProperties avoids errors on optional fields)
db.settings({ ignoreUndefinedProperties: true });

// Helper: check if a user is admin
function isAdmin(email) {
  return ADMIN_EMAILS.includes((email || '').toLowerCase());
}
