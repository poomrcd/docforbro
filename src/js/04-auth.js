/* ============================================================================
   04-auth.js — Auth UI + flows
   v9 — Simplified logout. Let showView handle the rest.
   ============================================================================ */

let authMode           = 'signin';
let authBusy           = false;
let authWasSignedIn    = false;
let authInRecovery     = false;
let isSigningOut       = false; // Prevents background events from bouncing us back

/* ══════════════════════════════════════════════════════════════════════
   UI HELPERS
   ══════════════════════════════════════════════════════════════════════ */
function injectAuthMessageArea() {
  var card = document.querySelector('.auth-card');
  if (!card || document.querySelector('#authMessage')) return;
  var msg = document.createElement('div');
  msg.id = 'authMessage';
  msg.hidden = true;
  card.insertBefore(msg, card.querySelector('.auth-head'));
}

function setAuthMessage(text, kind) {
  var el = document.querySelector('#authMessage');
  if (!el) return;
  if (!text) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = text;
  if (kind === 'success') {
    el.style.cssText =
      'font-size:13px;color:#15803D;background:#ECFDF5;border:1px solid #A7F3D0;' +
      'border-radius:8px;padding:9px 12px;margin-bottom:14px;line-height:1.55;';
  } else {
    el.style.cssText =
      'font-size:13px;color:var(--muted);background:var(--panel-soft);border:1px solid var(--line);' +
      'border-radius:8px;padding:9px 12px;margin-bottom:14px;line-height:1.55;';
  }
}

function setAuthError(text) {
  var el = document.querySelector('#authError');
  if (!el) return;
  if (!text) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = text;
}

function setAuthBusy(busy) {
  authBusy = busy;
  ['#authSubmit', '#authGoogle', '#authToggle', '#authForgot'].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (el) el.disabled = busy;
  });
}

function setAuthMode(mode) {
  authMode = mode;
  var title       = document.querySelector('#authTitle');
  var sub         = document.querySelector('#authSub');
  var submit      = document.querySelector('#authSubmit');
  var confirmFld  = document.querySelector('#authConfirmField');
  var pwdFld      = document.querySelector('#authPasswordField');
  var toggleText  = document.querySelector('#authToggleText');
  var toggle      = document.querySelector('#authToggle');
  var forgot      = document.querySelector('#authForgot');
  var divider     = document.querySelector('.auth-divider');
  var googleBtn   = document.querySelector('#authGoogle');

  setAuthError('');
  setAuthMessage('');

  if (mode === 'signin') {
    if (title)      title.textContent = 'Welcome back';
    if (sub)        sub.textContent = 'Sign in to continue.';
    if (submit)     submit.textContent = 'Sign in';
    if (confirmFld) confirmFld.hidden = true;
    if (pwdFld)     pwdFld.hidden = false;
    if (toggleText) toggleText.textContent = 'New to DocForBro?';
    if (toggle)     toggle.textContent = 'Create an account';
    if (forgot)     forgot.style.display = '';
    if (divider)    divider.style.display = '';
    if (googleBtn)  googleBtn.style.display = '';
  } else if (mode === 'signup') {
    if (title)      title.textContent = 'Create your account';
    if (sub)        sub.textContent = 'Free forever. No credit card.';
    if (submit)     submit.textContent = 'Create account';
    if (confirmFld) confirmFld.hidden = false;
    if (pwdFld)     pwdFld.hidden = false;
    if (toggleText) toggleText.textContent = 'Already have an account?';
    if (toggle)     toggle.textContent = 'Sign in';
    if (forgot)     forgot.style.display = 'none';
    if (divider)    divider.style.display = '';
    if (googleBtn)  googleBtn.style.display = '';
  } else if (mode === 'forgot') {
    if (title)      title.textContent = 'Reset your password';
    if (sub)        sub.textContent = "Enter your email and we'll send you a reset link.";
    if (submit)     submit.textContent = 'Send reset link';
    if (confirmFld) confirmFld.hidden = true;
    if (pwdFld)     pwdFld.hidden = true;
    if (toggleText) toggleText.textContent = '';
    if (toggle)     toggle.textContent = 'Back to sign in';
    if (forgot)     forgot.style.display = 'none';
    if (divider)    divider.style.display = 'none';
    if (googleBtn)  googleBtn.style.display = 'none';
  }

  setTimeout(function () {
    var e = document.querySelector('#authEmail');
    if (e) e.focus();
  }, 60);
}

/* ══════════════════════════════════════════════════════════════════════
   FRIENDLY ERRORS
   ══════════════════════════════════════════════════════════════════════ */
function friendlyAuthError(err) {
  var msg = String(err && err.message ? err.message : err) || 'Something went wrong.';

  if (/invalid login credentials/i.test(msg))     return 'Incorrect email or password.';
  if (/email not confirmed/i.test(msg))           return 'Please confirm your email first — check your inbox.';
  if (/user already registered/i.test(msg))       return 'That email already has an account. Try signing in.';
  if (/rate limit|too many|only request/i.test(msg)) return 'Too many attempts. Please wait a moment and try again.';
  if (/password should be/i.test(msg))            return 'Password is too weak — use at least 8 characters.';
  if (/unable to validate email/i.test(msg))      return "That email address doesn't look valid.";
  if (/network|fetch/i.test(msg))                 return 'Network error — check your connection and try again.';
  if (/email address not authorized/i.test(msg))  return 'That email address is not authorized in this environment.';

  return msg;
}

/* ══════════════════════════════════════════════════════════════════════
   SUBMIT
   ══════════════════════════════════════════════════════════════════════ */
async function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  if (authBusy) return;

  var email    = (document.querySelector('#authEmail') && document.querySelector('#authEmail').value || '').trim();
  var password = (document.querySelector('#authPassword') && document.querySelector('#authPassword').value) || '';
  var confirm  = (document.querySelector('#authConfirm') && document.querySelector('#authConfirm').value) || '';

  setAuthError('');
  setAuthMessage('');

  if (authMode === 'forgot') {
    if (!email) { setAuthError('Enter your email address.'); return; }
    setAuthBusy(true);
    try {
      await Store.auth.resetPassword(email);
      setAuthMessage(
        "If an account exists for " + email + ", we've sent a reset link. Check your inbox (and spam).",
        'success'
      );
    } catch (err) {
      setAuthError(friendlyAuthError(err));
    } finally {
      setAuthBusy(false);
    }
    return;
  }

  if (!email) { setAuthError('Enter your email address.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setAuthError("That email address doesn't look valid."); return; }
  if (!password) { setAuthError('Enter your password.'); return; }
  if (password.length < 8) { setAuthError('Password must be at least 8 characters.'); return; }
  if (authMode === 'signup' && password !== confirm) { setAuthError('Passwords do not match.'); return; }

  setAuthBusy(true);
  try {
    if (authMode === 'signup') {
      var result = await Store.auth.signUp(email, password);
      if (result.needsConfirmation) {
        setAuthMessage(
          'We sent a confirmation link to ' + email + '. Click it to activate your account, then come back and sign in.',
          'success'
        );
        var pw = document.querySelector('#authPassword');
        var cf = document.querySelector('#authConfirm');
        if (pw) pw.value = '';
        if (cf) cf.value = '';
      }
    } else {
      await Store.auth.signIn(email, password);
    }
  } catch (err) {
    setAuthError(friendlyAuthError(err));
  } finally {
    setAuthBusy(false);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   GOOGLE OAUTH
   ══════════════════════════════════════════════════════════════════════ */
async function handleAuthGoogle() {
  if (authBusy) return;
  setAuthError('');
  setAuthBusy(true);
  try {
    await Store.auth.signInWithGoogle();
  } catch (err) {
    setAuthError(friendlyAuthError(err));
    setAuthBusy(false);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   SIGN OUT
   ══════════════════════════════════════════════════════════════════════ */
async function handleSignOut(skipConfirm) {
  if (!skipConfirm) {
    var ok = await confirmDialog({
      title: 'Sign out?',
      message: 'Your data stays safe in the cloud. You can sign back in anytime.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Cancel'
    });
    if (!ok) return;
  }

  isSigningOut = true;
  
  // 1. Tell Supabase to clear the session (don't wait for it)
  Store.auth.signOut().catch(function (err) {
    console.warn('Sign out network error:', err);
  });

  // 2. Clear local state immediately
  Store.user = null;
  Store.session = null;
  if (typeof updateSidebarUser === 'function') updateSidebarUser(null);

  // 3. Force view change
  if (typeof showView === 'function') showView('landing');
  toast('Signed out');

  // 4. Unblock the auth listener after a short delay
  setTimeout(() => {
    isSigningOut = false;
  }, 1000);
}

/* ══════════════════════════════════════════════════════════════════════
   URL PARAMS
   ══════════════════════════════════════════════════════════════════════ */
function checkUrlForRecovery() {
  var hash = window.location.hash || '';
  return hash.indexOf('type=recovery') !== -1;
}

function checkUrlForError() {
  var params = new URLSearchParams(window.location.search);
  return params.get('error_description') || params.get('error');
}

/* ══════════════════════════════════════════════════════════════════════
   PASSWORD RESET PANEL
   ══════════════════════════════════════════════════════════════════════ */
function showPasswordResetPanel() {
  authInRecovery = true;

  var card = document.querySelector('.auth-card');
  if (!card) return;

  card.innerHTML =
    '<header class="auth-head">' +
      '<h1>Set a new password</h1>' +
      '<p>Choose a password you\'ll remember. At least 8 characters.</p>' +
    '</header>' +
    '<form id="resetForm" novalidate>' +
      '<div class="auth-field">' +
        '<label for="resetPassword">New password</label>' +
        '<input type="password" id="resetPassword" autocomplete="new-password" minlength="8" required>' +
      '</div>' +
      '<div class="auth-field">' +
        '<label for="resetConfirm">Confirm new password</label>' +
        '<input type="password" id="resetConfirm" autocomplete="new-password" minlength="8" required>' +
      '</div>' +
      '<p class="auth-error" id="resetError" hidden></p>' +
      '<button type="submit" class="btn primary lg full" id="resetSubmit">Update password</button>' +
    '</form>';

  document.querySelector('#resetForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var p1  = document.querySelector('#resetPassword').value;
    var p2  = document.querySelector('#resetConfirm').value;
    var err = document.querySelector('#resetError');
    err.hidden = true;

    if (p1.length < 8) {
      err.hidden = false;
      err.textContent = 'Password must be at least 8 characters.';
      return;
    }
    if (p1 !== p2) {
      err.hidden = false;
      err.textContent = 'Passwords do not match.';
      return;
    }

    var submit = document.querySelector('#resetSubmit');
    submit.disabled = true;
    submit.textContent = 'Updating…';

    try {
      await Store.auth.updatePassword(p1);
      try { window.history.replaceState({}, '', window.location.pathname); } catch (e) {}

      card.innerHTML =
        '<header class="auth-head">' +
          '<h1>Password updated</h1>' +
          '<p>Your new password is set. You\'re now signed in.</p>' +
        '</header>' +
        '<button class="btn primary lg full" id="continueToApp">Continue to DocForBro</button>';

      document.querySelector('#continueToApp').addEventListener('click', function () {
        authInRecovery = false;
        showView('gallery');
      });
    } catch (e2) {
      err.hidden = false;
      err.textContent = friendlyAuthError(e2);
      submit.disabled = false;
      submit.textContent = 'Update password';
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════════════ */
function initAuth() {
  injectAuthMessageArea();

  if (checkUrlForRecovery()) {
    showPasswordResetPanel();
  } else {
    var errDesc = checkUrlForError();
    if (errDesc) {
      setAuthError(decodeURIComponent(String(errDesc).replace(/\+/g, ' ')));
      try { window.history.replaceState({}, '', window.location.pathname); } catch (e) {}
    }

    setAuthMode('signin');

    var form = document.querySelector('#authForm');
    if (form) form.addEventListener('submit', handleAuthSubmit);

    var toggle = document.querySelector('#authToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        if (authMode === 'signin')      setAuthMode('signup');
        else if (authMode === 'signup') setAuthMode('signin');
        else                             setAuthMode('signin');
      });
    }

    var forgot = document.querySelector('#authForgot');
    if (forgot) {
      forgot.addEventListener('click', function () { setAuthMode('forgot'); });
    }

    var google = document.querySelector('#authGoogle');
    if (google) google.addEventListener('click', handleAuthGoogle);

    ['#authEmail', '#authPassword', '#authConfirm'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAuthSubmit();
        }
      });
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-action="signout"]')) {
      handleSignOut();
    }
  });

  var lastAuthUserId = null;
  var authHasLoaded = false;

  Store.whenAuthReady().then(function () {
    authHasLoaded = true;
    if (Store.isSignedIn() && !authInRecovery) {
      lastAuthUserId = Store.user.id;
      authWasSignedIn = true;
    }
  });

  Store.onAuthChange(function (user) {
    if (isSigningOut) return;
    if (authInRecovery || !authHasLoaded) return;
    
    var userId = (user && user.id) || null;

    if (userId === lastAuthUserId) return;

    if (userId) {
      lastAuthUserId = userId;
      authWasSignedIn = true;
      showView('gallery');
    } else {
      lastAuthUserId = null;
      authWasSignedIn = false;
      showView('landing');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}