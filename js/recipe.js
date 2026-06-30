/* ── Dan's Recipes — Recipe Detail (API-driven) ─────────────── */

const zoomSlider = document.getElementById('zoom-slider');
zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--zoom', zoomSlider.value);
});

// Get recipe ID from URL path: /recipe/{id}
const pathParts = window.location.pathname.split('/');
const id = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
const content = document.getElementById('recipe-content');

let currentRecipe = null;
let editMode = false;

function getToken() { return localStorage.getItem('recipe_token') || ''; }
function authHeaders() {
  const t = getToken();
  return t ? { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function checkAuth() {
  if (!getToken()) return false;
  try {
    const res = await fetch('/api/me', { headers: authHeaders() });
    return res.ok;
  } catch { return false; }
}

async function loadRecipe() {
  if (!id) { showError('No recipe specified.'); return; }
  try {
    const res = await fetch(`/api/recipes/${id}`);
    if (!res.ok) throw new Error('Not found');
    currentRecipe = await res.json();
    document.title = `${currentRecipe.title} — Dan's Recipes`;
    const isAdmin = await checkAuth();
    renderRecipe(currentRecipe, isAdmin);
    setupAdminButtons(isAdmin);
  } catch {
    showError('Recipe not found.');
  }
}

function setupAdminButtons(isAdmin) {
  const editBtn = document.getElementById('edit-btn');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const deleteBtn = document.getElementById('delete-btn');

  if (!isAdmin) return;
  editBtn.style.display = 'inline-flex';
  deleteBtn.style.display = 'inline-flex';

  editBtn.addEventListener('click', () => enterEditMode());
  saveBtn.addEventListener('click', () => saveRecipe());
  cancelBtn.addEventListener('click', () => {
    editMode = false;
    renderRecipe(currentRecipe, true);
    setupAdminButtons(true);
  });
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`Delete "${currentRecipe.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (res.ok) window.location.href = '/';
    else alert('Delete failed');
  });
}

function renderRecipe(r, isAdmin) {
  const yieldHtml = r.yield ? `<span class="recipe-yield">Yield: ${r.yield}</span>` : '';
  const tagsHtml = (r.tags || []).map(t => `<span class="card-tag">${t}</span>`).join('');

  const ingredientsHtml = (r.sections || []).map(sec => {
    const heading = sec.heading || sec.name || '';
    const nameHtml = heading ? `<div class="sub-section-label">${heading}</div>` : '';
    const items = (sec.ingredients || []).map(i => `<li>${i}</li>`).join('');
    return `${nameHtml}<ul class="ingredient-list">${items}</ul>`;
  }).join('');

  const instructionsHtml = (r.instructions || '')
    .split('\n\n')
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('<br>');

  const variationsHtml = r.variations && r.variations.length ? `
    <div class="variations-block">
      <div class="section-label">Variations</div>
      ${r.variations.map(v => `
        <div class="variation-item">
          <span class="variation-name">${v.name}:</span>
          <span class="variation-desc"> ${v.description}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const notesHtml = r.notes ? `<div class="notes-block">${r.notes}</div>` : '';

  content.innerHTML = `
    <h1 class="recipe-title">${r.title}</h1>
    <div class="recipe-meta">
      <span class="recipe-category-badge">${r.category}</span>
      ${yieldHtml}
    </div>
    <div class="recipe-tags-row">${tagsHtml}</div>
    <hr class="recipe-divider" />
    <div class="recipe-body">
      <div class="ingredients-col">
        <div class="section-label">Ingredients</div>
        ${ingredientsHtml}
      </div>
      <div class="instructions-col">
        <div class="section-label">Instructions</div>
        <div class="instructions-text">${instructionsHtml}</div>
        ${variationsHtml}
      </div>
    </div>
    ${notesHtml}
  `;

  // Update edit/save/cancel buttons visibility
  const editBtn = document.getElementById('edit-btn');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const deleteBtn = document.getElementById('delete-btn');
  if (editBtn) editBtn.style.display = isAdmin && !editMode ? 'inline-flex' : 'none';
  if (saveBtn) saveBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (deleteBtn) deleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';
}

function enterEditMode() {
  editMode = true;
  const r = currentRecipe;

  // Sections as text
  const sectionsText = (r.sections || []).map(sec => {
    const heading = sec.heading || sec.name || '';
    const lines = (sec.ingredients || []).join('\n');
    return heading ? `# ${heading}\n${lines}` : lines;
  }).join('\n\n');

  const variationsText = (r.variations || []).map(v => `${v.name}: ${v.description}`).join('\n');

  content.innerHTML = `
    <div class="edit-form">
      <div class="form-group">
        <label class="edit-label">Title</label>
        <input type="text" id="ef-title" class="form-input edit-input" value="${escHtml(r.title)}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="edit-label">Category</label>
          <input type="text" id="ef-category" class="form-input edit-input" value="${escHtml(r.category)}" />
        </div>
        <div class="form-group">
          <label class="edit-label">Yield</label>
          <input type="text" id="ef-yield" class="form-input edit-input" value="${escHtml(r.yield || '')}" />
        </div>
      </div>
      <div class="form-group">
        <label class="edit-label">Tags (comma separated)</label>
        <input type="text" id="ef-tags" class="form-input edit-input" value="${escHtml((r.tags||[]).join(', '))}" />
      </div>
      <div class="form-group">
        <label class="edit-label">Image URL</label>
        <input type="text" id="ef-image" class="form-input edit-input" value="${escHtml(r.image||'')}" />
      </div>
      <div class="form-group">
        <label class="edit-label">Ingredients (one per line, use "# Section" for subsections)</label>
        <textarea id="ef-ingredients" class="form-textarea edit-textarea" rows="8">${escHtml(sectionsText)}</textarea>
      </div>
      <div class="form-group">
        <label class="edit-label">Instructions</label>
        <textarea id="ef-instructions" class="form-textarea edit-textarea" rows="8">${escHtml(r.instructions||'')}</textarea>
      </div>
      <div class="form-group">
        <label class="edit-label">Variations (one per line: "Name: Description")</label>
        <textarea id="ef-variations" class="form-textarea edit-textarea" rows="3">${escHtml(variationsText)}</textarea>
      </div>
      <div class="form-group">
        <label class="edit-label">Notes</label>
        <textarea id="ef-notes" class="form-textarea edit-textarea" rows="2">${escHtml(r.notes||'')}</textarea>
      </div>
    </div>
  `;

  const editBtn = document.getElementById('edit-btn');
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  if (editBtn) editBtn.style.display = 'none';
  if (saveBtn) saveBtn.style.display = 'inline-flex';
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
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

async function saveRecipe() {
  const variations = (document.getElementById('ef-variations').value || '').split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(l => {
      const idx = l.indexOf(':');
      return idx > -1
        ? { name: l.slice(0, idx).trim(), description: l.slice(idx + 1).trim() }
        : { name: l, description: '' };
    });

  const data = {
    title: document.getElementById('ef-title').value.trim(),
    category: document.getElementById('ef-category').value.trim(),
    yield: document.getElementById('ef-yield').value.trim() || null,
    image: document.getElementById('ef-image').value.trim() || '',
    tags: document.getElementById('ef-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    sections: parseIngredientsText(document.getElementById('ef-ingredients').value),
    instructions: document.getElementById('ef-instructions').value.trim(),
    variations,
    notes: document.getElementById('ef-notes').value.trim() || null,
  };

  try {
    const res = await fetch(`/api/recipes/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Save failed');
    currentRecipe = { ...currentRecipe, ...data };
    editMode = false;
    renderRecipe(currentRecipe, true);
    setupAdminButtons(true);
    document.title = `${currentRecipe.title} — Dan's Recipes`;
  } catch (e) { alert('Error: ' + e.message); }
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showError(msg) {
  content.innerHTML = `<p style="text-align:center;color:var(--color-muted);padding:3rem;">${msg}</p>`;
}

loadRecipe();
