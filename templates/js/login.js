/* ═══════════════════════════════════════════════
   login.js — GradeDesk Auth Logic
   Handles: view switching, form validation,
            password visibility, step nav,
            API stubs (wired to auth.js / api.js later)
═══════════════════════════════════════════════ */

// ── VIEW SWITCHING ──────────────────────────────

const viewLogin    = document.getElementById('view-login');
const viewRegister = document.getElementById('view-register');
const regFooter    = document.getElementById('reg-footer');

function showLogin() {
  viewLogin.hidden    = false;
  viewRegister.hidden = true;
  document.title = 'GradeDesk — Sign In';
}

function showRegister() {
  viewLogin.hidden    = true;
  viewRegister.hidden = false;
  document.title = 'GradeDesk — Create Account';
  goToStep(1); // always start at step 1
}

document.getElementById('goto-register').addEventListener('click', showRegister);
document.getElementById('goto-login').addEventListener('click', showLogin);
document.getElementById('goto-login-final').addEventListener('click', showLogin);

// ── PASSWORD TOGGLE ─────────────────────────────

document.querySelectorAll('.eye-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    // swap icon opacity as a simple visual hint
    btn.style.opacity = isHidden ? '1' : '0.5';
  });
});

// ── FIELD ERROR HELPERS ─────────────────────────

function setError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  // highlight the associated input (same form-group)
  const input = el.closest('.form-group')?.querySelector('input, select');
  if (input) input.classList.toggle('error', !!msg);
}

function clearError(id) { setError(id, ''); }

function clearAllErrors(ids) { ids.forEach(clearError); }

function showBanner(id, msgId, msg) {
  const banner = document.getElementById(id);
  const span   = document.getElementById(msgId);
  if (!banner || !span) return;
  span.textContent = msg;
  banner.hidden = false;
}

function hideBanner(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}

// ── INPUT LIVE CLEAR ────────────────────────────
// Clears the error on a field the moment the user starts typing again.

function attachLiveClear(inputId, errorId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener('input', () => clearError(errorId));
}

attachLiveClear('login-email',    'err-login-email');
attachLiveClear('login-password', 'err-login-password');
attachLiveClear('reg-fname',      'err-reg-fname');
attachLiveClear('reg-lname',      'err-reg-lname');
attachLiveClear('reg-email',      'err-reg-email');
attachLiveClear('reg-password',   'err-reg-password');
attachLiveClear('reg-confirm',    'err-reg-confirm');
attachLiveClear('reg-school-name','err-reg-school');
attachLiveClear('reg-year-start', 'err-reg-year-start');
attachLiveClear('reg-year-end',   'err-reg-year-end');

// ── VALIDATORS ──────────────────────────────────

function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
}

function isEmpty(val) {
  return val.trim() === '';
}

// ════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════

const loginSubmit = document.getElementById('login-submit');

loginSubmit.addEventListener('click', async () => {
  hideBanner('login-banner');

  const email    = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  let valid = true;

  if (isEmpty(email)) {
    setError('err-login-email', 'Email is required.');
    valid = false;
  } else if (!isValidEmail(email)) {
    setError('err-login-email', 'Enter a valid email address.');
    valid = false;
  } else {
    clearError('err-login-email');
  }

  if (isEmpty(password)) {
    setError('err-login-password', 'Password is required.');
    valid = false;
  } else {
    clearError('err-login-password');
  }

  if (!valid) return;

  // ── Loading state ──
  setButtonLoading(loginSubmit, true);

  try {
    // ┌─────────────────────────────────────────────────┐
    // │  API STUB — replace with real call in auth.js   │
    // │                                                 │
    // │  const res = await api.login(email, password);  │
    // │  // stores JWT, then:                           │
    // │  window.location.href = '/dashboard.html';      │
    // └─────────────────────────────────────────────────┘

    await fakeDelay(1200); // remove when real API is wired

    // Demo: treat "admin@school.edu" / "password" as valid
    if (email === 'admin@school.edu' && password === 'password') {
      window.location.href = '/index.html';
    } else {
      showBanner('login-banner', 'login-banner-msg', 'Invalid email or password.');
    }

  } catch (err) {
    showBanner('login-banner', 'login-banner-msg', 'Could not connect. Try again.');
  } finally {
    setButtonLoading(loginSubmit, false);
  }
});

// Also allow Enter key on password field
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') loginSubmit.click();
});

// ════════════════════════════════════════════════
//  REGISTRATION — STEP NAVIGATION
// ════════════════════════════════════════════════

const regStep1 = document.getElementById('reg-step-1');
const regStep2 = document.getElementById('reg-step-2');
const regStep3 = document.getElementById('reg-step-3');

function goToStep(n) {
  regStep1.hidden = n !== 1;
  regStep2.hidden = n !== 2;
  regStep3.hidden = n !== 3;
  regFooter.hidden = n === 3;
  updateStepDots(n);
}

function updateStepDots(n) {
  const dots  = [
    document.getElementById('step-dot-1'),
    document.getElementById('step-dot-2'),
    document.getElementById('step-dot-3'),
  ];
  const lines = document.querySelectorAll('.step-line');

  dots.forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 < n)  dot.classList.add('done');
    if (i + 1 === n) dot.classList.add('active');
  });

  lines.forEach((line, i) => {
    line.classList.toggle('done', i + 1 < n);
  });
}

// ── Step 1 → 2: Validate account fields ──

document.getElementById('reg-next-1').addEventListener('click', () => {
  const fname    = document.getElementById('reg-fname').value;
  const lname    = document.getElementById('reg-lname').value;
  const email    = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;

  let valid = true;

  if (isEmpty(fname)) {
    setError('err-reg-fname', 'Required.'); valid = false;
  } else { clearError('err-reg-fname'); }

  if (isEmpty(lname)) {
    setError('err-reg-lname', 'Required.'); valid = false;
  } else { clearError('err-reg-lname'); }

  if (isEmpty(email)) {
    setError('err-reg-email', 'Email is required.'); valid = false;
  } else if (!isValidEmail(email)) {
    setError('err-reg-email', 'Enter a valid email address.'); valid = false;
  } else { clearError('err-reg-email'); }

  if (password.length < 8) {
    setError('err-reg-password', 'Must be at least 8 characters.'); valid = false;
  } else { clearError('err-reg-password'); }

  if (isEmpty(confirm)) {
    setError('err-reg-confirm', 'Please confirm your password.'); valid = false;
  } else if (confirm !== password) {
    setError('err-reg-confirm', 'Passwords do not match.'); valid = false;
  } else { clearError('err-reg-confirm'); }

  if (valid) goToStep(2);
});

// ── Step 2 → Back ──

document.getElementById('reg-back-1').addEventListener('click', () => {
  goToStep(1);
});

// ── Step 2 → Submit ──

const regNext2 = document.getElementById('reg-next-2');

regNext2.addEventListener('click', async () => {
  hideBanner('reg-banner');

  const school    = document.getElementById('reg-school-name').value;
  const yearStart = parseInt(document.getElementById('reg-year-start').value, 10);
  const yearEnd   = parseInt(document.getElementById('reg-year-end').value, 10);
  const semester  = document.getElementById('reg-semester').value;

  let valid = true;

  if (isEmpty(school)) {
    setError('err-reg-school', 'School name is required.'); valid = false;
  } else { clearError('err-reg-school'); }

  if (!yearStart || yearStart < 2000) {
    setError('err-reg-year-start', 'Enter a valid year.'); valid = false;
  } else { clearError('err-reg-year-start'); }

  if (!yearEnd || yearEnd <= yearStart) {
    setError('err-reg-year-end', 'Must be after start year.'); valid = false;
  } else { clearError('err-reg-year-end'); }

  if (!semester) {
    setError('err-reg-sem', 'Select a semester.'); valid = false;
  } else { clearError('err-reg-sem'); }

  if (!valid) return;

  setButtonLoading(regNext2, true);

  try {
    // ┌─────────────────────────────────────────────────────────────┐
    // │  API STUB — replace with real calls in api.js               │
    // │                                                             │
    // │  Step A: POST /api/auth/register/ → creates user + JWT      │
    // │  Step B: POST /api/school-years/  → { year_start, year_end }│
    // │  Step C: POST /api/school-year-semesters/ → links both      │
    // │  Step D: POST /api/grade-templates/ → chosen template       │
    // └─────────────────────────────────────────────────────────────┘

    await fakeDelay(1400); // remove when real API is wired

    const fname = document.getElementById('reg-fname').value.trim();
    const lname = document.getElementById('reg-lname').value.trim();
    document.getElementById('success-sub').innerHTML =
      `Account created for <strong>${fname} ${lname}</strong>.<br>You can now sign in with your email and password.`;

    goToStep(3);

  } catch (err) {
    showBanner('reg-banner', 'reg-banner-msg', 'Registration failed. Please try again.');
  } finally {
    setButtonLoading(regNext2, false);
  }
});

// ════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════

function setButtonLoading(btn, loading) {
  const label   = btn.querySelector('.btn-label');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled  = loading;
  if (label)   label.hidden = loading;
  if (spinner) spinner.hidden = !loading;
}

function fakeDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── INIT: check hash for deep-link to register ──
// Allows linking directly to login.html#register for the first-boot prompt.

(function init() {
  if (window.location.hash === '#register') {
    showRegister();
  } else {
    showLogin();
  }
})();
