/* ── Dan's Recipes — Recipe Detail ───────────────────────── */

const zoomSlider = document.getElementById('zoom-slider');
zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--zoom', zoomSlider.value);
});

const params  = new URLSearchParams(window.location.search);
// Support both /recipe/slug (path) and ?id=slug (legacy)
const id      = window.location.pathname.split('/').pop() || params.get('id');
const content = document.getElementById('recipe-content');

let currentRecipe = null;
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
}

// ── Load & render ─────────────────────────────────────────
async function loadRecipe() {
  if (!id) { showError('No recipe specified.'); return; }
  await checkAuth();
  try {
    const res = await fetch(`/api/recipes/${id}`);
    if (!res.ok) throw new Error('Not found');
    currentRecipe = await res.json();
    render(currentRecipe);
    document.title = `${currentRecipe.title} — Dan's Recipes`;
  } catch {
    showError('Recipe not found.');
  }
}

function render(r) {
  const yieldHtml = r.yield
    ? `<span class="recipe-yield">Yield: ${r.yield}</span>` : '';

  const tagsHtml = (r.tags || []).map(t =>
    `<span class="card-tag">${t}</span>`
  ).join('');

  const ingredientsHtml = (r.sections || []).map(sec => {
    const nameHtml = sec.name ? `<div class="sub-section-label">${sec.name}</div>` : '';
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

  const notesHtml = r.notes
    ? `<div class="notes-block">${r.notes}</div>` : '';

  const editBtn = isLoggedIn
    ? `<button class="edit-btn" id="edit-toggle" onclick="enterEditMode()">✏ Edit</button>` : '';

  content.innerHTML = `
    <div class="recipe-detail-toolbar">
      ${editBtn}
    </div>
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
}

// ── Edit mode ─────────────────────────────────────────────
function enterEditMode() {
  const r = currentRecipe;

  const sectionsValue = (r.sections || []).map(sec =>
    (sec.name ? `[${sec.name}]\n` : '') + (sec.ingredients || []).join('\n')
  ).join('\n\n');

  const variationsValue = (r.variations || []).map(v =>
    `${v.name}: ${v.description}`
  ).join('\n');

  const CATEGORIES = [
    'Sauces/Dips','Seasonings','Kombucha','Pickles','Dehydrator',
    'Drinks','Appetizers','Sides','Mains','Baking/Desserts','Sourdough'
  ];

  content.innerHTML = `
    <form class="edit-form" onsubmit="saveEdits(event)">
      <div class="edit-form-header">
        <h2>Editing Recipe</h2>
        <div class="edit-form-btns">
          <button type="submit" class="save-btn">Save</button>
          <button type="button" class="cancel-btn" onclick="cancelEdit()">Cancel</button>
          <button type="button" class="delete-btn" onclick="deleteRecipe()">Delete</button>
        </div>
      </div>

      <div class="edit-grid">
        <label class="edit-wide">Title
          <input type="text" name="title" value="${esc(r.title)}" required>
        </label>

        <label>Category
          <select name="category">
            ${CATEGORIES.map(c => `<option ${c === r.category ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </label>

        <label>Yield
          <input type="text" name="yield" value="${esc(r.yield || '')}">
        </label>

        <label class="edit-wide">Tags (comma separated)
          <input type="text" name="tags" value="${esc((r.tags || []).join(', '))}">
        </label>

        <label class="edit-wide">Image URL
          <input type="url" name="image" value="${esc(r.image || '')}">
        </label>

        <label class="edit-wide">Ingredients
          <small>One per line. Start a section with [Section Name] on its own line.</small>
          <textarea name="sections" rows="10">${esc(sectionsValue)}</textarea>
        </label>

        <label class="edit-wide">Instructions
          <textarea name="instructions" rows="8">${esc(r.instructions || '')}</textarea>
        </label>

        <label class="edit-wide">Variations
          <small>One per line: Name: Description</small>
          <textarea name="variations" rows="4">${esc(variationsValue)}</textarea>
        </label>

        <label class="edit-wide">Notes
          <textarea name="notes" rows="3">${esc(r.notes || '')}</textarea>
        </label>
      </div>
    </form>
  `;
}

function cancelEdit() {
  render(currentRecipe);
}

function parseSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let current = { name: null, ingredients: [] };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      if (current.ingredients.length) sections.push(current);
      current = { name: sectionMatch[1], ingredients: [] };
    } else {
      current.ingredients.push(line);
    }
  }
  if (current.ingredients.length) sections.push(current);
  return sections;
}

function parseVariations(text) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const idx = l.indexOf(':');
    return idx > -1
      ? { name: l.slice(0, idx).trim(), description: l.slice(idx + 1).trim() }
      : { name: l, description: '' };
  });
}

async function saveEdits(evt) {
  evt.preventDefault();
  const form = evt.target;
  const data = {
    title:        form.title.value.trim(),
    category:     form.category.value,
    yield:        form.yield.value.trim() || null,
    image:        form.image.value.trim(),
    tags:         form.tags.value.split(',').map(t => t.trim()).filter(Boolean),
    sections:     parseSections(form.sections.value),
    instructions: form.instructions.value.trim(),
    variations:   parseVariations(form.variations.value),
    notes:        form.notes.value.trim() || null,
  };

  const res = await fetch(`/api/recipes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });

  if (res.ok) {
    currentRecipe = { ...currentRecipe, ...data };
    render(currentRecipe);
  } else {
    alert('Save failed.');
  }
}

async function deleteRecipe() {
  if (!confirm(`Delete "${currentRecipe.title}"? This cannot be undone.`)) return;
  const res = await fetch(`/api/recipes/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (res.ok) {
    window.location.href = '/';
  } else {
    alert('Delete failed.');
  }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(msg) {
  content.innerHTML = `<p style="text-align:center;color:var(--color-muted);padding:3rem;">${msg}</p>`;
}

loadRecipe();
