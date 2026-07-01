/* ── Shared auth logic ───────────────────────────────────────── */

let _loggedIn = false;

async function initAuth() {
  try {
    const res = await fetch('/api/auth/me');
    _loggedIn = (await res.json()).loggedIn;
  } catch { _loggedIn = false; }
  _renderAuthSlots();
  return _loggedIn;
}

function isLoggedIn() { return _loggedIn; }

function _renderAuthSlots() {
  document.querySelectorAll('.auth-slot').forEach(slot => {
    slot.innerHTML = _loggedIn
      ? `<span class="login-status">Dan</span>
         <button class="login-btn" onclick="authLogout()">Log out</button>`
      : `<button class="login-btn" onclick="showLoginModal()">Log in</button>`;
  });
  // Show/hide admin-only elements
  document.querySelectorAll('.auth-only').forEach(el => {
    el.style.display = _loggedIn ? '' : 'none';
  });
}

function showLoginModal(onSuccess) {
  const existing = document.getElementById('login-modal');
  if (existing) { existing._onSuccess = onSuccess; existing.querySelector('#login-password').focus(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'login-modal';
  overlay.innerHTML = `
    <div class="modal-box">
      <h3>Dan's Recipes</h3>
      <input class="modal-input" type="password" id="login-password"
             placeholder="Password" autocomplete="current-password">
      <div class="modal-error" id="login-error"></div>
      <div class="modal-btns">
        <button class="cancel-btn" onclick="document.getElementById('login-modal').remove()">Cancel</button>
        <button class="save-btn" onclick="_doLogin()">Log in</button>
      </div>
    </div>`;
  overlay._onSuccess = onSuccess;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  const input = document.getElementById('login-password');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') _doLogin(); });
}

async function _doLogin() {
  const pw    = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });
  if (res.ok) {
    _loggedIn = true;
    const modal = document.getElementById('login-modal');
    const cb = modal?._onSuccess;
    modal?.remove();
    _renderAuthSlots();
    if (typeof cb === 'function') cb();
    if (typeof onAuthChange === 'function') onAuthChange(true);
  } else {
    errEl.textContent = 'Incorrect password.';
    document.getElementById('login-password').select();
  }
}

async function authLogout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  _loggedIn = false;
  _renderAuthSlots();
  if (typeof onAuthChange === 'function') onAuthChange(false);
}

// Wrap a callback: if not logged in, show login modal then run callback after auth
function requireAuth(callback) {
  if (_loggedIn) { callback(); return; }
  showLoginModal(callback);
}

// Intercept a fetch response — if 401, trigger login and resolve with a new attempt
async function authFetch(url, opts, retry) {
  const res = await fetch(url, opts);
  if (res.status === 401) {
    return new Promise(resolve => {
      showLoginModal(async () => {
        resolve(await fetch(url, opts));
      });
    });
  }
  return res;
}
