/* ============================================================
   login.js — EduTrack Login Page Logic
   Sections:
   1. DOM References
   2. Password Toggle
   3. Form Validation
   4. Form Submission (REST API)
   5. Toast Notifications
   6. Intro Overlay Cleanup
   ============================================================ */


/* ── 1. DOM REFERENCES ── */
const loginForm     = document.getElementById('loginForm');
const emailInput    = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn      = document.getElementById('loginBtn');
const btnText       = document.getElementById('btnText');
const btnLoader     = document.getElementById('btnLoader');
const btnArrow      = document.getElementById('btnArrow');
const togglePassBtn = document.getElementById('togglePassword');
const eyeIcon       = document.getElementById('eyeIcon');
const emailError    = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');
const toast         = document.getElementById('toast');
const toastMsg      = document.getElementById('toastMsg');
const introOverlay  = document.getElementById('intro-overlay');


/* ── 2. PASSWORD TOGGLE ── */
togglePassBtn.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';

  // Swap icon: open eye ↔ slashed eye
  eyeIcon.innerHTML = isPassword
    ? /* eye-slash */`
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>`
    : /* eye-open */`
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>`;
});


/* ── 3. FORM VALIDATION ── */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clearErrors() {
  emailError.classList.add('hidden');
  passwordError.classList.add('hidden');
  emailInput.style.borderColor = '';
  passwordInput.style.borderColor = '';
}

function showFieldError(inputEl, errorEl, message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  inputEl.style.borderColor = 'rgba(239,68,68,0.6)';
  inputEl.style.boxShadow   = '0 0 0 3px rgba(239,68,68,0.1)';
  inputEl.focus();
}

function validateForm() {
  clearErrors();
  let valid = true;

  if (!emailInput.value.trim()) {
    showFieldError(emailInput, emailError, 'Email is required.');
    valid = false;
  } else if (!isValidEmail(emailInput.value.trim())) {
    showFieldError(emailInput, emailError, 'Please enter a valid email address.');
    valid = false;
  }

  if (!passwordInput.value) {
    showFieldError(passwordInput, passwordError, 'Password is required.');
    valid = false;
  } else if (passwordInput.value.length < 6) {
    showFieldError(passwordInput, passwordError, 'Password must be at least 6 characters.');
    valid = false;
  }

  return valid;
}

// Live clear errors on input
emailInput.addEventListener('input',    () => { emailError.classList.add('hidden');    emailInput.style.borderColor    = ''; emailInput.style.boxShadow    = ''; });
passwordInput.addEventListener('input', () => { passwordError.classList.add('hidden'); passwordInput.style.borderColor = ''; passwordInput.style.boxShadow = ''; });


/* ── 4. FORM SUBMISSION ── */
const API_BASE = '/api';  // Change to your Django server URL if needed

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateForm()) return;

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:    emailInput.value.trim(),
        password: passwordInput.value,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      // Store token (JWT or session)
      if (data.token)         localStorage.setItem('auth_token', data.token);
      if (data.access)        localStorage.setItem('auth_token', data.access);
      if (data.refresh)       localStorage.setItem('refresh_token', data.refresh);

      // Success state on button
      btnText.textContent = 'Success!';
      loginBtn.style.background = 'linear-gradient(135deg, #059669, #10b981)';
      loginBtn.style.boxShadow  = '0 4px 20px rgba(16,185,129,0.4)';

      // Redirect after short delay
      setTimeout(() => {
        window.location.href = '/dashboard/';
      }, 800);

    } else {
      setLoading(false);

      // Django REST common error shapes
      const msg =
        data.detail             ||
        data.non_field_errors?.[0] ||
        data.message            ||
        'Invalid email or password.';

      showToast(msg, 'error');

      // Shake the form card
      const card = document.querySelector('.form-card');
      card.style.animation = 'none';
      void card.offsetWidth; // reflow
      card.style.animation = 'shakeCard 0.4s ease';
    }

  } catch (err) {
    setLoading(false);
    showToast('Could not connect to the server. Please try again.', 'error');
    console.error('[EduTrack] Login error:', err);
  }
});


/* ── 5. LOADING STATE HELPERS ── */
function setLoading(isLoading) {
  loginBtn.disabled = isLoading;

  if (isLoading) {
    btnText.textContent = 'Signing in';
    btnArrow.classList.add('hidden');
    btnLoader.classList.remove('hidden');
  } else {
    btnText.textContent = 'Sign In';
    btnArrow.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
}


/* ── 6. TOAST NOTIFICATIONS ── */
let toastTimeout = null;

function showToast(message, type = 'error') {
  toastMsg.textContent = message;

  if (type === 'error') {
    toast.style.background  = 'rgba(239,68,68,0.12)';
    toast.style.borderColor = 'rgba(239,68,68,0.3)';
    toast.style.color       = '#fca5a5';
  } else {
    toast.style.background  = 'rgba(16,185,129,0.12)';
    toast.style.borderColor = 'rgba(16,185,129,0.3)';
    toast.style.color       = '#6ee7b7';
  }

  toast.classList.remove('hidden');
  // Trigger reflow so transition plays
  void toast.offsetWidth;
  toast.classList.add('show');

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3500);
}


/* ── 7. INTRO OVERLAY CLEANUP ── */
// Remove from DOM after animation to free memory
introOverlay.addEventListener('animationend', () => {
  introOverlay.remove();
});


/* ── CSS INJECTION: shake keyframe ── */
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shakeCard {
    0%,100% { transform: translateX(0); }
    20%      { transform: translateX(-8px); }
    40%      { transform: translateX(8px); }
    60%      { transform: translateX(-5px); }
    80%      { transform: translateX(5px); }
  }
`;
document.head.appendChild(shakeStyle);
