/* ── Dan's Recipes — Browse/Search ───────────────────────── */

let allRecipes = [];
let activeCategory = 'All';
let activeTag = null;
let fuse = null;

const grid        = document.getElementById('recipe-grid');
const countEl     = document.getElementById('results-count');
const searchInput = document.getElementById('search-input');
const tagBar      = document.getElementById('tag-bar');
const zoomSlider  = document.getElementById('zoom-slider');

// ── Auth ──────────────────────────────────────────────────
let isLoggedIn = false;

function authHeaders() {
  const token = localStorage.getItem('recipe_token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async function checkAuth() {
  try {
    const res = await fetch('/api/me', { headers: authHeaders() });
    isLoggedIn = res.ok;
  } catch { isLoggedIn = false; }
  renderLoginBar();
}

function renderLoginBar() {
  const bar = document.getElementById('login-bar');
  if (!bar) return;
  if (isLoggedIn) {
    bar.innerHTML = `
      <span class="login-status">✓ Editing on</span>
      <button class="login-btn" onclick="doLogout()">Log out</button>
    `;
  } else {
    bar.innerHTML = `<button class="login-btn" onclick="showLoginModal()">Edit</button>`;
  }
}

function showLoginModal() {
  document.getElementById('login-modal').style.display = 'flex';
  document.getElementById('login-pwd').focus();
}
function hideLoginModal() {
  document.getElementById('login-modal').style.display = 'none';
  document.getElementById('login-error').textContent = '';
}

async function doLogin() {
  const pwd = document.getElementById('login-pwd').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pwd }),
  });
  if (res.ok) {
    const data = await res.json();
    localStorage.setItem('recipe_token', data.token);
    isLoggedIn = true;
    hideLoginModal();
    renderLoginBar();
    renderGrid();
  } else {
    document.getElementById('login-error').textContent = 'Wrong password.';
  }
}

async function doLogout() {
  await fetch('/api/logout', { method: 'POST', headers: authHeaders() });
  localStorage.removeItem('recipe_token');
  isLoggedIn = false;
  renderLoginBar();
  renderGrid();
}

// ── Zoom ──────────────────────────────────────────────────
zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--zoom', zoomSlider.value);
});

// ── Load data ─────────────────────────────────────────────
async function init() {
  await checkAuth();

  const [recipesRes, catsRes] = await Promise.all([
    fetch('/api/recipes'),
    fetch('/api/categories'),
  ]);
  allRecipes = await recipesRes.json();
  const categories = (await catsRes.json()).map(c => c.name);

  buildCategoryTabs(categories);
  buildTagBar();
  renderGrid();

  fuse = new Fuse(allRecipes, {
    keys: ['title', 'tags', 'category'],
    threshold: 0.35,
    includeScore: true,
  });

  searchInput.addEventListener('input', renderGrid);
}

// ── Category tabs ─────────────────────────────────────────
function buildCategoryTabs(categories) {
  const nav = document.querySelector('.category-nav-inner');

  document.querySelector('.cat-tab[data-cat="All"]').addEventListener('click', function () {
    setCategory('All');
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab';
    btn.dataset.cat = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      setCategory(cat);
      document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    nav.appendChild(btn);
  });
}

function setCategory(cat) {
  activeCategory = cat;
  activeTag = null;
  buildTagBar();

  // Sourdough bake log sub-tabs
  const logSection = document.getElementById('log-section');
  const subTabs = document.getElementById('sourdough-subtabs');
  if (cat === 'Sourdough') {
    subTabs && (subTabs.style.display = 'flex');
    showRecipesSubtab();
  } else {
    subTabs && (subTabs.style.display = 'none');
    logSection && (logSection.style.display = 'none');
    grid.style.display = '';
  }

  renderGrid();
}

// ── Sourdough sub-tabs ────────────────────────────────────
function showRecipesSubtab() {
  document.getElementById('recipe-grid').style.display = '';
  document.getElementById('results-count').style.display = '';
  document.getElementById('tag-bar').style.display = '';
  const logSection = document.getElementById('log-section');
  logSection && (logSection.style.display = 'none');
  document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('subtab-recipes');
  btn && btn.classList.add('active');
}

function showLogSubtab() {
  document.getElementById('recipe-grid').style.display = 'none';
  document.getElementById('results-count').style.display = 'none';
  document.getElementById('tag-bar').style.display = 'none';
  const logSection = document.getElementById('log-section');
  logSection && (logSection.style.display = '');
  document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('subtab-log');
  btn && btn.classList.add('active');
  loadLog();
}

// ── Sourdough bake log ────────────────────────────────────
let logEntries = [];
let editingLogId = null;

async function loadLog() {
  const res = await fetch('/api/sourdough/log');
  logEntries = await res.json();
  renderLog();
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function renderLog() {
  const section = document.getElementById('log-section');
  if (!section) return;

  const addBtn = isLoggedIn ? `<button class="add-log-btn" onclick="showAddLogForm()">+ New Bake</button>` : '';

  section.innerHTML = `
    <div class="log-header">
      <h2 class="log-title">Sourdough Bake Log</h2>
      ${addBtn}
    </div>
    <div id="log-form-container"></div>
    ${logEntries.length === 0
      ? '<p class="log-empty">No bakes logged yet.</p>'
      : `<div class="log-table-wrap">
          <table class="log-table">
            <thead><tr>
              <th>Started</th><th>Finished</th>
              <th>Flour (g)</th><th>Water (g)</th><th>Hydration</th>
              <th>Starter (g)</th><th>Rating</th><th>Notes</th><th>Recipe</th>
              ${isLoggedIn ? '<th></th>' : ''}
            </tr></thead>
            <tbody id="log-tbody"></tbody>
          </table>
        </div>`
    }
  `;

  const tbody = document.getElementById('log-tbody');
  if (!tbody) return;

  logEntries.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.date_started || '—'}</td>
      <td>${e.date_finished || '—'}</td>
      <td>${e.flour_used != null ? e.flour_used : '—'}</td>
      <td>${e.water_used != null ? e.water_used : '—'}</td>
      <td>${e.hydration != null ? e.hydration + '%' : '—'}</td>
      <td>${e.starter_used != null ? e.starter_used : '—'}</td>
      <td class="log-stars" title="${e.ranking}/5">${stars(e.ranking || 0)}</td>
      <td class="log-notes">${e.notes || ''}</td>
      <td>${e.recipe_id ? `<a href="/recipe/${e.recipe_id}" class="log-recipe-link">view</a>` : ''}</td>
      ${isLoggedIn ? `<td class="log-actions">
        <button class="log-action-btn" onclick="showEditLogForm(${e.id})">Edit</button>
        <button class="log-action-btn danger" onclick="deleteLog(${e.id})">✕</button>
      </td>` : ''}
    `;
    tbody.appendChild(tr);
  });
}

function logFormHtml(entry) {
  const e = entry || {};
  const sourdoughRecipes = allRecipes.filter(r => r.category === 'Sourdough');
  const recipeOptions = sourdoughRecipes.map(r =>
    `<option value="${r.id}" ${e.recipe_id === r.id ? 'selected' : ''}>${r.title}</option>`
  ).join('');

  return `
    <form class="log-form" onsubmit="saveLogEntry(event, ${e.id || 'null'})">
      <div class="log-form-grid">
        <label>Date Started<input type="date" name="date_started" value="${e.date_started || ''}"></label>
        <label>Date Finished<input type="date" name="date_finished" value="${e.date_finished || ''}"></label>
        <label>Flour (g)<input type="number" name="flour_used" step="any" value="${e.flour_used || ''}"></label>
        <label>Water (g)<input type="number" name="water_used" step="any" value="${e.water_used || ''}">
          <span class="hydration-preview" id="hydration-preview"></span>
        </label>
        <label>Starter (g)<input type="number" name="starter_used" step="any" value="${e.starter_used || ''}"></label>
        <label>Rating
          <div class="star-input" id="star-input" data-value="${e.ranking || 0}">
            ${[1,2,3,4,5].map(n => `<span class="star-opt ${(e.ranking||0) >= n ? 'on' : ''}" data-n="${n}" onclick="setStarRating(${n})">★</span>`).join('')}
          </div>
          <input type="hidden" name="ranking" id="ranking-input" value="${e.ranking || 0}">
        </label>
        <label class="log-form-wide">Recipe (optional)
          <select name="recipe_id">
            <option value="">None</option>
            ${recipeOptions}
          </select>
        </label>
        <label class="log-form-wide">Notes
          <textarea name="notes" rows="2">${e.notes || ''}</textarea>
        </label>
      </div>
      <div class="log-form-actions">
        <button type="submit" class="save-btn">Save</button>
        <button type="button" class="cancel-btn" onclick="cancelLogForm()">Cancel</button>
      </div>
    </form>
  `;
}

function setStarRating(n) {
  document.getElementById('ranking-input').value = n;
  document.querySelectorAll('.star-opt').forEach(s => {
    s.classList.toggle('on', parseInt(s.dataset.n) <= n);
  });
}

function showAddLogForm() {
  document.getElementById('log-form-container').innerHTML = logFormHtml(null);
  updateHydrationPreview();
}

function showEditLogForm(id) {
  const entry = logEntries.find(e => e.id === id);
  if (!entry) return;
  editingLogId = id;
  document.getElementById('log-form-container').innerHTML = logFormHtml(entry);
  updateHydrationPreview();
}

function cancelLogForm() {
  document.getElementById('log-form-container').innerHTML = '';
  editingLogId = null;
}

function updateHydrationPreview() {
  const form = document.querySelector('.log-form');
  if (!form) return;
  const calc = () => {
    const f = parseFloat(form.flour_used.value);
    const w = parseFloat(form.water_used.value);
    const el = document.getElementById('hydration-preview');
    if (el) el.textContent = f && w ? `→ ${(w/f*100).toFixed(1)}% hydration` : '';
  };
  form.flour_used.addEventListener('input', calc);
  form.water_used.addEventListener('input', calc);
}

async function saveLogEntry(evt, id) {
  evt.preventDefault();
  const form = evt.target;
  const data = {
    date_started:  form.date_started.value || null,
    date_finished: form.date_finished.value || null,
    flour_used:    parseFloat(form.flour_used.value) || null,
    water_used:    parseFloat(form.water_used.value) || null,
    starter_used:  parseFloat(form.starter_used.value) || null,
    ranking:       parseInt(form.ranking.value) || 0,
    notes:         form.notes.value || null,
    recipe_id:     form.recipe_id.value || null,
  };

  const url = id ? `/api/sourdough/log/${id}` : '/api/sourdough/log';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (res.ok) {
    cancelLogForm();
    await loadLog();
  }
}

async function deleteLog(id) {
  if (!confirm('Delete this bake entry?')) return;
  const res = await fetch(`/api/sourdough/log/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (res.ok) await loadLog();
}

// ── Tag bar ───────────────────────────────────────────────
function buildTagBar() {
  tagBar.innerHTML = '';
  const source = activeCategory === 'All'
    ? allRecipes
    : allRecipes.filter(r => r.category === activeCategory);
  const tags = [...new Set(source.flatMap(r => r.tags))].sort();
  tags.forEach(tag => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip' + (tag === activeTag ? ' active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => {
      activeTag = activeTag === tag ? null : tag;
      buildTagBar();
      renderGrid();
    });
    tagBar.appendChild(chip);
  });
}

// ── Render grid ───────────────────────────────────────────
function renderGrid() {
  const query = searchInput.value.trim();
  let results = allRecipes;

  if (query && fuse) {
    results = fuse.search(query).map(r => r.item);
  }
  if (activeCategory !== 'All') {
    results = results.filter(r => r.category === activeCategory);
  }
  if (activeTag) {
    results = results.filter(r => r.tags.includes(activeTag));
  }

  countEl.textContent = results.length === 1 ? '1 recipe' : `${results.length} recipes`;
  grid.innerHTML = '';

  if (results.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>No recipes found.</p></div>`;
    return;
  }

  results.forEach(recipe => {
    const card = document.createElement('a');
    card.className = 'recipe-card';
    card.href = `/recipe/${recipe.id}`;
    card.innerHTML = `
      <div class="card-category">${recipe.category}</div>
      <div class="card-title">${recipe.title}</div>
      <div class="card-tags">
        ${(recipe.tags || []).map(t => `<span class="card-tag">${t}</span>`).join('')}
      </div>
    `;
    grid.appendChild(card);
  });
}

init();
