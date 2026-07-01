/* ── Dan's Recipes — Browse/Search ───────────────────────── */

const ALL_CATEGORIES = [
  'Sauces/Dips','Seasonings','Kombucha','Pickles','Dehydrator',
  'Drinks','Appetizers','Sides','Mains','Baking/Desserts','Sourdough',
];

let allRecipes = [];
let activeCategory = 'All';
let activeTag = null;
let filterNeverMade = false;
let fuse = null;

const grid        = document.getElementById('recipe-grid');
const countEl     = document.getElementById('results-count');
const searchInput = document.getElementById('search-input');
const tagBar      = document.getElementById('tag-bar');
const zoomSlider  = document.getElementById('zoom-slider');

zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--zoom', zoomSlider.value);
});

async function init() {
  await initAuth();
  const recipesRes = await fetch('/api/recipes');
  allRecipes = await recipesRes.json();
  buildCategoryTabs(ALL_CATEGORIES);
  buildTagBar();
  renderGrid();
  fuse = new Fuse(allRecipes, {
    keys: [
      { name: 'title',                weight: 1.0 },
      { name: 'tags',                 weight: 0.8 },
      { name: 'category',             weight: 0.6 },
      { name: 'instructions',         weight: 0.5 },
      { name: 'notes',                weight: 0.5 },
      { name: 'sections.ingredients', weight: 0.6 },
      { name: 'sections.name',        weight: 0.4 },
    ],
    threshold: 0.35,
    includeScore: true,
    ignoreLocation: true,
  });
  searchInput.addEventListener('input', renderGrid);
}

function buildCategoryTabs(categories) {
  const nav = document.querySelector('.category-nav-inner');
  document.querySelector('.cat-tab[data-cat="All"]').addEventListener('click', function () {
    setCategory('All');
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab'; btn.dataset.cat = cat; btn.textContent = cat;
    btn.addEventListener('click', () => {
      setCategory(cat);
      document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    nav.appendChild(btn);
  });
}

function toggleNeverMade() {
  filterNeverMade = !filterNeverMade;
  document.getElementById('never-made-btn').classList.toggle('active', filterNeverMade);
  renderGrid();
}

function setCategory(cat) {
  activeCategory = cat; activeTag = null; tagBarExpanded = false; buildTagBar();
  const subTabs = document.getElementById('sourdough-subtabs');
  const logSection = document.getElementById('log-section');
  if (cat === 'Sourdough') {
    subTabs && (subTabs.style.display = 'flex');
    showRecipesSubtab();
  } else {
    subTabs && (subTabs.style.display = 'none');
    logSection && (logSection.style.display = 'none');
    grid.style.display = ''; countEl.style.display = ''; tagBar.style.display = '';
  }
  renderGrid();
}

function showRecipesSubtab() {
  grid.style.display = ''; countEl.style.display = ''; tagBar.style.display = '';
  const logSection = document.getElementById('log-section');
  logSection && (logSection.style.display = 'none');
  document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('subtab-recipes') && document.getElementById('subtab-recipes').classList.add('active');
}

function showLogSubtab() {
  grid.style.display = 'none'; countEl.style.display = 'none'; tagBar.style.display = 'none';
  const logSection = document.getElementById('log-section');
  logSection && (logSection.style.display = '');
  document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('subtab-log') && document.getElementById('subtab-log').classList.add('active');
  loadLog();
}

// ── Sourdough bake log ─────────────────────────────────────
let logEntries = [];

async function loadLog() {
  const res = await fetch('/api/sourdough/log');
  logEntries = await res.json();
  renderLog();
}

function stars(n) { return '★'.repeat(n||0) + '☆'.repeat(5-(n||0)); }

function renderLog() {
  const section = document.getElementById('log-section');
  if (!section) return;
  section.innerHTML = `
    <div class="log-header">
      <h2 class="log-title">Sourdough Bake Log</h2>
      <button class="add-log-btn" onclick="showAddLogForm()">+ New Bake</button>
    </div>
    <div id="log-form-container"></div>
    ${logEntries.length === 0 ? '<p class="log-empty">No bakes logged yet.</p>' : `
      <div class="log-table-wrap"><table class="log-table">
        <thead><tr>
          <th>Name</th><th>Started</th><th>Finished</th><th>Flour (g)</th><th>Water (g)</th>
          <th>Hydration</th><th>Starter (g)</th><th>Rating</th><th>Notes</th><th>Recipe</th><th></th>
        </tr></thead>
        <tbody id="log-tbody"></tbody>
      </table></div>`}
  `;
  const tbody = document.getElementById('log-tbody');
  if (!tbody) return;
  logEntries.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="log-name">${e.name||'—'}</td><td>${e.date_started||'—'}</td><td>${e.date_finished||'—'}</td>
      <td>${e.flour_used!=null?e.flour_used:'—'}</td><td>${e.water_used!=null?e.water_used:'—'}</td>
      <td>${e.hydration!=null?e.hydration+'%':'—'}</td><td>${e.starter_used!=null?e.starter_used:'—'}</td>
      <td class="log-stars">${stars(e.ranking)}</td>
      <td class="log-notes">${e.notes||''}</td>
      <td>${e.recipe_id?`<a href="/recipe/${e.recipe_id}" class="log-recipe-link">view</a>`:''}</td>
      <td class="log-actions">
        <button class="log-action-btn" onclick="showEditLogForm(${e.id})">Edit</button>
        <button class="log-action-btn danger" onclick="deleteLog(${e.id})">✕</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function logFormHtml(entry) {
  const e = entry || {};
  const opts = allRecipes.filter(r=>r.category==='Sourdough')
    .map(r=>`<option value="${r.id}" ${e.recipe_id===r.id?'selected':''}>${r.title}</option>`).join('');
  return `<form class="log-form" onsubmit="saveLogEntry(event,${e.id||'null'})">
    <div class="log-form-grid">
      <label class="log-form-wide">Bake Name<input type="text" name="name" placeholder="e.g. Country loaf, Focaccia…" value="${e.name||''}"></label>
      <label>Date Started<input type="date" name="date_started" value="${e.date_started||''}"></label>
      <label>Date Finished<input type="date" name="date_finished" value="${e.date_finished||''}"></label>
      <label>Flour (g)<input type="number" name="flour_used" step="any" value="${e.flour_used||''}"></label>
      <label>Water (g)<input type="number" name="water_used" step="any" value="${e.water_used||''}">
        <span class="hydration-preview" id="hydration-preview"></span></label>
      <label>Starter (g)<input type="number" name="starter_used" step="any" value="${e.starter_used||''}"></label>
      <label>Rating
        <div class="star-input" id="star-input">
          ${[1,2,3,4,5].map(n=>`<span class="star-opt ${(e.ranking||0)>=n?'on':''}" onclick="setStarRating(${n})">★</span>`).join('')}
        </div>
        <input type="hidden" name="ranking" id="ranking-input" value="${e.ranking||0}">
      </label>
      <label class="log-form-wide">Recipe (optional)<select name="recipe_id"><option value="">None</option>${opts}</select></label>
      <label class="log-form-wide">Notes<textarea name="notes" rows="2">${e.notes||''}</textarea></label>
    </div>
    <div class="log-form-actions">
      <button type="submit" class="save-btn">Save</button>
      <button type="button" class="cancel-btn" onclick="cancelLogForm()">Cancel</button>
    </div>
  </form>`;
}

function setStarRating(n) {
  document.getElementById('ranking-input').value = n;
  document.querySelectorAll('.star-opt').forEach((s,i) => s.classList.toggle('on', i < n));
}
function showAddLogForm() {
  document.getElementById('log-form-container').innerHTML = logFormHtml(null);
  wireHydration();
}
function showEditLogForm(id) {
  const e = logEntries.find(e=>e.id===id);
  if (!e) return;
  document.getElementById('log-form-container').innerHTML = logFormHtml(e);
  wireHydration();
}
function cancelLogForm() { document.getElementById('log-form-container').innerHTML = ''; }
function wireHydration() {
  const form = document.querySelector('.log-form');
  if (!form) return;
  const calc = () => {
    const f = parseFloat(form.flour_used.value), w = parseFloat(form.water_used.value);
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
    name:          form.name.value.trim()||null,
    date_started:  form.date_started.value||null,
    date_finished: form.date_finished.value||null,
    flour_used:    parseFloat(form.flour_used.value)||null,
    water_used:    parseFloat(form.water_used.value)||null,
    starter_used:  parseFloat(form.starter_used.value)||null,
    ranking:       parseInt(form.ranking.value)||0,
    notes:         form.notes.value||null,
    recipe_id:     form.recipe_id.value||null,
  };
  const res = await fetch(id?`/api/sourdough/log/${id}`:'/api/sourdough/log', {
    method: id?'PUT':'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data),
  });
  if (res.ok) { cancelLogForm(); await loadLog(); }
}
async function deleteLog(id) {
  if (!confirm('Delete this bake entry?')) return;
  const res = await fetch(`/api/sourdough/log/${id}`, {method:'DELETE'});
  if (res.ok) await loadLog();
}

// ── Tag bar ───────────────────────────────────────────────
let tagBarExpanded = false;
const TAG_LIMIT = 20;

function buildTagBar() {
  tagBar.innerHTML = '';
  const source = activeCategory==='All' ? allRecipes : allRecipes.filter(r=>r.category===activeCategory);

  // Count frequency of each tag
  const freq = {};
  source.forEach(r => (r.tags||[]).forEach(t => { freq[t] = (freq[t]||0) + 1; }));
  const sorted = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || a.localeCompare(b));

  const visible = tagBarExpanded ? sorted : sorted.slice(0, TAG_LIMIT);
  const hidden  = sorted.length - TAG_LIMIT;

  // Always include the active tag even if it falls outside the visible slice
  const toRender = activeTag && !visible.includes(activeTag)
    ? [activeTag, ...visible] : visible;

  toRender.forEach(tag => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip' + (tag === activeTag ? ' active' : '');
    chip.textContent = tag;
    chip.addEventListener('click', () => { activeTag = activeTag===tag?null:tag; buildTagBar(); renderGrid(); });
    tagBar.appendChild(chip);
  });

  if (sorted.length > TAG_LIMIT) {
    const more = document.createElement('button');
    more.className = 'tag-chip tag-chip-more';
    more.textContent = tagBarExpanded ? 'Show less' : `+${hidden} more`;
    more.addEventListener('click', () => { tagBarExpanded = !tagBarExpanded; buildTagBar(); });
    tagBar.appendChild(more);
  }
}

// ── Render grid ───────────────────────────────────────────
function renderGrid() {
  const query = searchInput.value.trim();
  let results = allRecipes;
  if (query && fuse) results = fuse.search(query).map(r=>r.item);
  if (activeCategory!=='All') results = results.filter(r=>r.category===activeCategory);
  if (activeTag) results = results.filter(r=>(r.tags||[]).includes(activeTag));
  if (filterNeverMade) results = results.filter(r=>!r.made_count || r.made_count===0);
  countEl.textContent = results.length===1?'1 recipe':`${results.length} recipes`;
  grid.innerHTML = '';
  if (!results.length) { grid.innerHTML='<div class="empty-state"><p>No recipes found.</p></div>'; return; }
  results.forEach(recipe => {
    const card = document.createElement('a');
    card.href = `/recipe/${recipe.id}`;
    const neverMade = !recipe.made_count || recipe.made_count === 0;
    const madeHtml = neverMade
      ? `<span class="card-never-made">never made</span>`
      : `<span class="card-made-count">made ${recipe.made_count}×</span>`;
    const thumbHtml = recipe.image
      ? `<img class="card-thumb" src="${recipe.image}" alt="" loading="lazy">`
      : '';
    card.className = `recipe-card${recipe.image ? ' has-thumb' : ''}`;
    card.innerHTML = `
      <div class="card-category">${recipe.category}</div>
      <div class="card-title">${recipe.title}</div>
      <div class="card-footer">
        <div class="card-tags">${(recipe.tags||[]).map(t=>`<span class="card-tag">${t}</span>`).join('')}</div>
        ${madeHtml}
      </div>
      ${thumbHtml}`;
    grid.appendChild(card);
  });
}

// Called by auth.js when login/logout changes state
function onAuthChange() { /* auth-only elements already toggled by _renderAuthSlots */ }

// ── Tag Manager ───────────────────────────────────────────────
async function showTagManager() {
  const res = await fetch('/api/recipes');
  const recipes = await res.json();
  const freq = {};
  recipes.forEach(r => (r.tags||[]).forEach(t => { freq[t] = (freq[t]||0)+1; }));
  let sorted = Object.entries(freq).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));

  const overlay = document.createElement('div');
  overlay.className = 'source-modal-overlay';
  overlay.id = 'tag-manager';
  overlay.innerHTML = `
    <div class="source-modal-box tag-mgr-box">
      <div class="source-modal-header">
        <span class="source-modal-title">Manage Tags (${sorted.length})</span>
        <button class="source-modal-close" onclick="document.getElementById('tag-manager').remove()">✕</button>
      </div>
      <div class="tag-mgr-search-row">
        <input id="tag-mgr-q" class="tag-mgr-input" type="search" placeholder="Filter tags…">
      </div>
      <div class="source-modal-body tag-mgr-body" id="tag-mgr-body"></div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target===overlay) overlay.remove(); });
  document.body.appendChild(overlay);

  function renderRows(list) {
    const body = document.getElementById('tag-mgr-body');
    if (!list.length) { body.innerHTML = '<p class="log-empty">No tags match.</p>'; return; }
    body.innerHTML = list.map(([tag, cnt]) => `
      <div class="tag-mgr-row" data-tag="${encodeURIComponent(tag)}">
        <span class="tag-mgr-name">${tag}</span>
        <span class="tag-mgr-count">${cnt} recipe${cnt===1?'':'s'}</span>
        <button class="tag-row-btn" data-action="rename">Rename</button>
        <button class="tag-row-btn tag-row-del" data-action="delete">✕</button>
      </div>`).join('');
  }
  renderRows(sorted);

  document.getElementById('tag-mgr-q').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderRows(sorted.filter(([t]) => t.includes(q)));
  });

  document.getElementById('tag-mgr-body').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const row = btn.closest('.tag-mgr-row');
    const tag = decodeURIComponent(row.dataset.tag);
    const action = btn.dataset.action;

    if (action === 'rename') {
      const nameEl = row.querySelector('.tag-mgr-name');
      nameEl.innerHTML = `<input class="tag-mgr-edit-input" value="${tag}" type="text">`;
      btn.textContent = 'Save'; btn.dataset.action = 'save';
      row.querySelector('[data-action="delete"]').style.display = 'none';
      row.querySelector('.tag-mgr-edit-input').focus();
    } else if (action === 'save') {
      const newTag = row.querySelector('.tag-mgr-edit-input').value.trim().toLowerCase();
      if (!newTag || newTag === tag) { document.getElementById('tag-manager').remove(); showTagManager(); return; }
      const res = await authFetch('/api/tags/rename', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({old:tag, new:newTag}) });
      if (res.ok) {
        sorted = sorted.map(([t,c]) => t===tag ? [newTag, c] : [t,c]);
        // merge counts if newTag already existed
        const counts = {};
        sorted.forEach(([t,c]) => { counts[t] = (counts[t]||0)+c; });
        sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
        renderRows(sorted);
        allRecipes = await (await fetch('/api/recipes')).json();
        buildTagBar(); renderGrid();
      }
    } else if (action === 'delete') {
      if (!confirm(`Remove tag "${tag}" from all recipes?`)) return;
      const res = await authFetch(`/api/tags/${encodeURIComponent(tag)}`, { method:'DELETE' });
      if (res.ok) {
        sorted = sorted.filter(([t]) => t !== tag);
        renderRows(sorted);
        allRecipes = await (await fetch('/api/recipes')).json();
        buildTagBar(); renderGrid();
      }
    }
  });
}

init();
