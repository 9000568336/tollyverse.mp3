// ============================================================
//  TollyVerse.mp3 — Authentication Logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Generate floating music notes
  generateMusicNotes();

  // Check if user is already logged in
  auth.onAuthStateChanged(user => {
    if (user) {
      // Already logged in — redirect to app
      window.location.href = 'app.html';
    }
  });
});

// ── Tab Switcher ─────────────────────────────────────────────
function switchTab(tab) {
  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');
  clearToast();

  if (tab === 'login') {
    loginForm.style.display    = 'flex';
    registerForm.style.display = 'none';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
  } else {
    loginForm.style.display    = 'none';
    registerForm.style.display = 'flex';
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
  }
}

// ── Google Sign-In ────────────────────────────────────────────
async function signInWithGoogle() {
  const btn = document.getElementById('googleSignInBtn');
  btn.disabled = true;
  btn.style.opacity = '0.7';
  clearToast();

  try {
    const result = await auth.signInWithPopup(googleProvider);
    const user   = result.user;

    // Save / update user profile in Firestore
    await db.collection('users').doc(user.uid).set({
      displayName: user.displayName || '',
      email:       user.email || '',
      photoURL:    user.photoURL || '',
      provider:    'google',
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
      lastSeen:    firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    showToast('Welcome back! Redirecting…', 'success');
    setTimeout(() => { window.location.href = 'app.html'; }, 800);

  } catch (err) {
    console.error('Google Sign-In error:', err);
    showToast(getFirebaseErrorMessage(err.code), 'error');
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

// ── Email Login ───────────────────────────────────────────────
async function handleEmailLogin(e) {
  e.preventDefault();
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn      = document.getElementById('loginSubmitBtn');

  setButtonLoading(btn, true);
  clearToast();

  try {
    const credential = await auth.signInWithEmailAndPassword(email, password);

    // Update last seen
    await db.collection('users').doc(credential.user.uid).set({
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    showToast('Signed in! Redirecting…', 'success');
    setTimeout(() => { window.location.href = 'app.html'; }, 800);

  } catch (err) {
    console.error('Email login error:', err);
    showToast(getFirebaseErrorMessage(err.code), 'error');
    setButtonLoading(btn, false);
  }
}

// ── Email Register ────────────────────────────────────────────
async function handleEmailRegister(e) {
  e.preventDefault();
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const confirm  = document.getElementById('regConfirm').value;
  const btn      = document.getElementById('registerSubmitBtn');

  clearToast();

  if (password !== confirm) {
    showToast('Passwords do not match.', 'error');
    return;
  }

  setButtonLoading(btn, true);

  try {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const user       = credential.user;

    // Update display name
    await user.updateProfile({ displayName: name });

    // Save to Firestore
    await db.collection('users').doc(user.uid).set({
      displayName: name,
      email:       email,
      photoURL:    '',
      provider:    'email',
      playlists:   [],
      ratings:     {},
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
      lastSeen:    firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast('Account created! Welcome to TollyVerse 🎵', 'success');
    setTimeout(() => { window.location.href = 'app.html'; }, 900);

  } catch (err) {
    console.error('Register error:', err);
    showToast(getFirebaseErrorMessage(err.code), 'error');
    setButtonLoading(btn, false);
  }
}

// ── Helpers ───────────────────────────────────────────────────
function setButtonLoading(btn, loading) {
  const text   = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.btn-loader');
  btn.disabled       = loading;
  text.style.display  = loading ? 'none' : 'block';
  loader.style.display = loading ? 'block' : 'none';
}

function showToast(msg, type) {
  const toast = document.getElementById('authToast');
  toast.textContent = msg;
  toast.className   = `auth-toast ${type}`;
}
function clearToast() {
  const toast = document.getElementById('authToast');
  toast.className = 'auth-toast';
  toast.textContent = '';
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.style.opacity = isText ? '0.6' : '1';
}

function getFirebaseErrorMessage(code) {
  const messages = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password. Please try again.',
    'auth/email-already-in-use':  'This email is already registered.',
    'auth/invalid-email':         'Please enter a valid email address.',
    'auth/weak-password':         'Password must be at least 6 characters.',
    'auth/too-many-requests':     'Too many attempts. Please try later.',
    'auth/popup-closed-by-user':  'Google sign-in was cancelled.',
    'auth/network-request-failed':'Network error. Check your connection.',
    'auth/invalid-credential':    'Invalid email or password. Please try again.'
  };
  return messages[code] || 'An error occurred. Please try again.';
}

function generateMusicNotes() {
  const container = document.getElementById('musicNotes');
  const notes     = ['♪', '♫', '♬', '♩', '🎵', '🎶'];
  for (let i = 0; i < 12; i++) {
    const el       = document.createElement('div');
    el.className   = 'note';
    el.textContent = notes[Math.floor(Math.random() * notes.length)];
    el.style.cssText = `
      left: ${Math.random() * 100}%;
      --dur:   ${6 + Math.random() * 8}s;
      --delay: ${Math.random() * 8}s;
      font-size: ${0.8 + Math.random() * 1.4}rem;
    `;
    container.appendChild(el);
  }
}
