/* ── Dan's Recipes — Browse/Search (API-driven) ─────────────── */

let allRecipes = [];
let activeCategory = 'All';
let activeTag = null;
let activeSourdoughView = 'recipes'; // 'recipes' or 'log'
let fuse = null;
let logData = [];
let sourdoughRecipes = [];

const grid = document.getElementById('recipe-grid');
const countEl = document.getElementById('results-count');
const searchInput = document.getElementById('search-input');
const tagBar = document.getElementById('tag-bar');
const zoomSlider = document.getElementById('zoom-slider');

// ── Zoom ──────────────────────────────────────────────────────
zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--zoom', zoomSlider.value);
});

// ── Auth ──────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('recipe_token') || ''; }
function authHeaders() {
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function checkAuth() {
  if (!getToken()) { window.isLoggedIn = false; return false; }
  try {
    const res = await fetch('/api/me', { headers: authHeaders() });
    window.isLoggedIn = res.ok;
  } catch { window.isLoggedIn = false; }
  return window.isLoggedIn;
}

async function login(password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error('Invalid password');
  const data = await res.json();
  localStorage.setItem('recipe_token', data.token);
  window.isLoggedIn = true;
}

function logout() {
  localStorage.removeItem('recipe_token');
  window.isLoggedIn = false;
  updateAuthUI();
  renderGrid();
}

function updateAuthUI() {
  const statusEl = document.getElementById('login-status');
  const loginBtn = document.getElementById('login-btn');
  const adminBar = document.getElementById('admin-bar');
  if (window.isLoggedIn) {
    statusEl.textContent = 'Logged in';
    loginBtn.textContent = 'Logout';
    loginBtn.onclick = logout;
    if (adminBar) adminBar.style.display = 'flex';
  } else {
    statusEl.textContent = '';
    loginBtn.textContent = 'Login';
    loginBtn.onclick = showLoginModal;
    if (adminBar) adminBar.style.display = 'none';
  }
}

// ── Login modal ───────────────────────────────────────────────
function showLoginModal() {
  document.getElementById('login-modal').style.display = 'flex';
  document.getElementById('login-password').focus();
}

function hideLoginModal() {
  document.getElementById('login-modal').style.display = 'none';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').style.display = 'none';
}

document.getElementById('login-cancel').addEventListener('click', hideLoginModal);
document.getElementById('login-submit').addEventListener('click', async () => {
  const pw = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  try {
    await login(pw);
    hideLoginModal();
    updateAuthUI();
    renderGrid();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
});
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-submit').click();
});
document.getElementById('login-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) hideLoginModal();
});

// ── Add Recipe modal ──────────────────────────────────────────
document.getElementById('add-recipe-btn')?.addEventListener('click', showAddRecipeModal);
document.getElementById('nr-cancel')?.addEventListener('click', () => {
  document.getElementById('add-recipe-modal').style.display = 'none';
});
document.getElementById('add-recipe-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

function showAddRecipeModal() {
  document.getElementById('add-recipe-modal').style.display = 'flex';
}

function parseIngredientsText(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = { heading: '', ingredients: [] };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) {
      if (current.ingredients.length > 0 || current.heading) sections.push(current);
      current = { heading: trimmed.replace(/^#+\s*/, ''), ingredients: [] };
    } else {
      current.ingredients.push(trimmed);
    }
  }
  if (current.ingredients.length > 0 || current.heading) sections.push(current);
  return sections;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

document.getElementById('nr-submit')?.addEventListener('click', async () => {
  const title = document.getElementById('nr-title').value.trim();
  const category = document.getElementById('nr-category').value.trim();
  if (!title || !category) { alert('Title and category are required'); return; }
  const tags = document.getElementById('nr-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const sections = parseIngredientsText(document.getElementById('nr-ingredients').value);
  const data = {
    id: slugify(title),
    title, category, tags,
    yield: document.getElementById('nr-yield').value.trim() || null,
    image: document.getElementById('nr-image').value.trim() || '',
    sections,
    instructions: document.getElementById('nr-instructions').value.trim(),
    variations: [],
    notes: document.getElementById('nr-notes').value.trim() || null,
  };
  try {
    const res = await fetch('/api/recipes', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    document.getElementById('add-recipe-modal').style.display = 'none';
    allRecipes = await loadRecipes(null, null, null);
    fuse = new Fuse(allRecipes, { keys: ['title', 'tags', 'category'], threshold: 0.35, includeScore: true });
    buildTagBar();
    renderGrid();
    alert('Recipe added!');
  } catch (e) { alert('Error: ' + e.message); }
});

// ── Load data ─────────────────────────────────────────────────
async function loadRecipes(category, tag, query) {
  const params = new URLSearchParams();
  if (category && category !== 'All') params.set('category', category);
  if (tag) params.set('tag', tag);
  if (query) params.set('q', query);
  const res = await fetch('/api/recipes?' + params);
  return await res.json();
}

async function init() {
  await checkAuth();
  updateAuthUI();

  const [recipesData, catsData] = await Promise.all([
    fetch('/api/recipes').then(r => r.json()),
    fetch('/api/categories').then(r => r.json()),
  ]);
  allRecipes = recipesData;

  buildCategoryTabs(catsData.map(c => c.category));
  buildTagBar();
  renderGrid();

  fuse = new Fuse(allRecipes, {
    keys: ['title', 'tags', 'category'],
    threshold: 0.35,
    includeScore: true,
  });

  searchInput.addEventListener('input', renderGrid);
}

// ── Category tabs ─────────────────────────────────────────────
function buildCategoryTabs(categories) {
  const nav = document.querySelector('.category-nav-inner');
  nav.innerHTML = '<button class="cat-tab active" data-cat="All">All</button>';

  document.querySelector('.cat-tab[data-cat="All"]').addEventListener('click', function () {
    selectCategory('All', this);
  });

  categories.sort().forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab';
    btn.dataset.cat = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => selectCategory(cat, btn));
    nav.appendChild(btn);
  });
}

function selectCategory(cat, btn) {
  activeCategory = cat;
  activeTag = null;
  activeSourdoughView = 'recipes';
  document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const sourdoughSection = document.getElementById('sourdough-section');
  if (cat === 'Sourdough') {
    sourdoughSection.style.display = 'block';
    showSourdoughView('recipes');
  } else {
    sourdoughSection.style.display = 'none';
    document.getElementById('log-section').style.display = 'none';
    grid.style.display = 'grid';
    countEl.style.display = '';
  }

  buildTagBar();
  renderGrid();
}

// ── Sourdough sub-tabs ────────────────────────────────────────
document.getElementById('sub-recipes')?.addEventListener('click', () => showSourdoughView('recipes'));
document.getElementById('sub-log')?.addEventListener('click', () => showSourdoughView('log'));

function showSourdoughView(view) {
  activeSourdoughView = view;
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('sub-' + view)?.classList.add('active');
  if (view === 'log') {
    grid.style.display = 'none';
    countEl.style.display = 'none';
    tagBar.innerHTML = '';
    document.getElementById('log-section').style.display = 'block';
    loadLog();
  } else {
    grid.style.display = 'grid';
    countEl.style.display = '';
    document.getElementById('log-section').style.display = 'none';
    renderGrid();
  }
}

// ── Tag bar ───────────────────────────────────────────────────
function buildTagBar() {
  tagBar.innerHTML = '';
  const source = activeCategory === 'All'
    ? allRecipes
    : allRecipes.filter(r => r.category === activeCategory);
  const tags = [...new Set(source.flatMap(r => r.tags || []))].sort();
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

// ── Render grid ───────────────────────────────────────────────
function renderGrid() {
  if (activeSourdoughView === 'log') return;
  const query = searchInput.value.trim();
  let results = allRecipes;

  if (query && fuse) {
    results = fuse.search(query).map(r => r.item);
  }
  if (activeCategory !== 'All') {
    results = results.filter(r => r.category === activeCategory);
  }
  if (activeTag) {
    results = results.filter(r => (r.tags || []).includes(activeTag));
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

// ── Sourdough bake log ────────────────────────────────────────
function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

async function loadLog() {
  const [logRes, recRes] = await Promise.all([
    fetch('/api/sourdough/log'),
    fetch('/api/recipes?category=Sourdough'),
  ]);
  logData = await logRes.json();
  sourdoughRecipes = await recRes.json();
  renderLog();
}

function renderLog() {
  const addArea = document.getElementById('add-log-area');
  const tableWrap = document.getElementById('log-table-wrap');

  if (window.isLoggedIn) {
    addArea.innerHTML = `<button class="btn-add" id="show-add-log-btn" style="margin-bottom:1rem">&#xFF0B; Add Bake</button><div id="add-log-form-area"></div>`;
    document.getElementById('show-add-log-btn').addEventListener('click', () => showAddLogForm());
  } else {
    addArea.innerHTML = '';
  }

  if (!logData.length) {
    tableWrap.innerHTML = '<p style="color:var(--color-muted);padding:1rem 0">No bake log entries yet.</p>';
    return;
  }

  const rows = logData.map(e => {
    const hydStr = e.hydration != null ? e.hydration + '%' : '—';
    const recipeLink = e.recipe_id
      ? `<a href="/recipe/${e.recipe_id}" style="color:var(--color-accent)">${e.recipe_id}</a>` : '—';
    const editDel = window.isLoggedIn
      ? `<button class="btn-icon" onclick="editLogEntry(${e.id})">&#x270F;&#xFE0F;</button>
         <button class="btn-icon btn-icon-danger" onclick="deleteLogEntry(${e.id})">&#x1F5D1;&#xFE0F;</button>` : '';
    return `<tr>
      <td>${e.date_started || '—'}</td>
      <td>${e.date_finished || '—'}</td>
      <td>${e.flour_used != null ? e.flour_used + 'g' : '—'}</td>
      <td>${e.water_used != null ? e.water_used + 'g' : '—'}</td>
      <td>${hydStr}</td>
      <td>${e.starter_used != null ? e.starter_used + 'g' : '—'}</td>
      <td class="stars-cell">${stars(e.ranking || 0)}</td>
      <td>${e.notes || '—'}</td>
      <td>${recipeLink}</td>
      ${window.isLoggedIn ? `<td>${editDel}</td>` : ''}
    </tr>`;
  }).join('');

  tableWrap.innerHTML = `
    <div class="log-table-scroll">
      <table class="log-table">
        <thead><tr>
          <th>Started</th><th>Finished</th><th>Flour</th><th>Water</th>
          <th>Hydration</th><th>Starter</th><th>Rating</th><th>Notes</th><th>Recipe</th>
          ${window.isLoggedIn ? '<th>Actions</th>' : ''}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function logFormHTML(entry) {
  const e = entry || {};
  const recipeOptions = sourdoughRecipes.map(r =>
    `<option value="${r.id}" ${e.recipe_id === r.id ? 'selected' : ''}>${r.title}</option>`
  ).join('');
  const starPicker = [1,2,3,4,5].map(n =>
    `<button type="button" class="star-btn ${(e.ranking||0) >= n ? 'active' : ''}" data-val="${n}" onclick="pickStar(this,${n})">★</button>`
  ).join('');
  return `
    <div class="log-form">
      <input type="hidden" id="lf-ranking" value="${e.ranking || 0}" />
      <div class="form-row">
        <div class="form-group"><label>Date Started</label><input type="date" id="lf-date-started" class="form-input" value="${e.date_started||''}" /></div>
        <div class="form-group"><label>Date Finished</label><input type="date" id="lf-date-finished" class="form-input" value="${e.date_finished||''}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Flour (g)</label><input type="number" id="lf-flour" class="form-input" value="${e.flour_used||''}" /></div>
        <div class="form-group"><label>Water (g)</label><input type="number" id="lf-water" class="form-input" value="${e.water_used||''}" /></div>
        <div class="form-group"><label>Starter (g)</label><input type="number" id="lf-starter" class="form-input" value="${e.starter_used||''}" /></div>
      </div>
      <div class="form-group">
        <label>Rating</label>
        <div class="star-picker">${starPicker}</div>
      </div>
      <div class="form-group"><label>Recipe</label>
        <select id="lf-recipe" class="form-input">
          <option value="">— none —</option>${recipeOptions}
        </select>
      </div>
      <div class="form-group"><label>Notes</label><textarea id="lf-notes" class="form-textarea" rows="2">${e.notes||''}</textarea></div>
      <div class="form-actions">
        <button class="btn-primary" id="lf-save">Save</button>
        <button class="btn-secondary" id="lf-cancel">Cancel</button>
      </div>
    </div>`;
}

function pickStar(btn, val) {
  document.getElementById('lf-ranking').value = val;
  btn.closest('.star-picker').querySelectorAll('.star-btn').forEach((b, i) => {
    b.classList.toggle('active', i < val);
  });
}

function getLogFormData() {
  return {
    date_started: document.getElementById('lf-date-started').value || null,
    date_finished: document.getElementById('lf-date-finished').value || null,
    flour_used: parseFloat(document.getElementById('lf-flour').value) || null,
    water_used: parseFloat(document.getElementById('lf-water').value) || null,
    starter_used: parseFloat(document.getElementById('lf-starter').value) || null,
    ranking: parseInt(document.getElementById('lf-ranking').value) || 0,
    notes: document.getElementById('lf-notes').value.trim() || null,
    recipe_id: document.getElementById('lf-recipe').value || null,
  };
}

function showAddLogForm() {
  const area = document.getElementById('add-log-form-area');
  area.innerHTML = logFormHTML(null);
  document.getElementById('lf-cancel').addEventListener('click', () => { area.innerHTML = ''; });
  document.getElementById('lf-save').addEventListener('click', async () => {
    const data = getLogFormData();
    await fetch('/api/sourdough/log', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
    area.innerHTML = '';
    await loadLog();
  });
}

async function editLogEntry(id) {
  const entry = logData.find(e => e.id === id);
  if (!entry) return;
  const tableWrap = document.getElementById('log-table-wrap');
  tableWrap.insertAdjacentHTML('beforebegin', `<div id="edit-log-form">${logFormHTML(entry)}</div>`);
  document.getElementById('lf-cancel').addEventListener('click', () => {
    document.getElementById('edit-log-form')?.remove();
  });
  document.getElementById('lf-save').addEventListener('click', async () => {
    const data = getLogFormData();
    await fetch(`/api/sourdough/log/${id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) });
    document.getElementById('edit-log-form')?.remove();
    await loadLog();
  });
}

async function deleteLogEntry(id) {
  if (!confirm('Delete this log entry?')) return;
  await fetch(`/api/sourdough/log/${id}`, { method: 'DELETE', headers: authHeaders() });
  await loadLog();
}

init();
