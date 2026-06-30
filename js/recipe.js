/* ── Dan's Recipes — Recipe Detail ───────────────────────── */

const zoomSlider = document.getElementById('zoom-slider');
zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--zoom', zoomSlider.value);
});

const id      = window.location.pathname.split('/').pop();
const content = document.getElementById('recipe-content');
let currentRecipe = null;
let madeLog = [];
let comments = [];

async function loadRecipe() {
  if (!id) { showError('No recipe specified.'); return; }
  try {
    const [recipeRes, madeRes, commentsRes] = await Promise.all([
      fetch(`/api/recipes/${id}`),
      fetch(`/api/recipes/${id}/made`),
      fetch(`/api/recipes/${id}/comments`),
    ]);
    if (!recipeRes.ok) throw new Error('Not found');
    currentRecipe = await recipeRes.json();
    madeLog = await madeRes.json();
    comments = await commentsRes.json();
    render(currentRecipe);
    document.title = `${currentRecipe.title} — Dan's Recipes`;
  } catch { showError('Recipe not found.'); }
}

function render(r) {
  const yieldHtml = r.yield ? `<span class="recipe-yield">Yield: ${r.yield}</span>` : '';
  const tagsHtml = (r.tags||[]).map(t=>`<span class="card-tag">${t}</span>`).join('');
  const ingredientsHtml = (r.sections||[]).map(sec => {
    const nameHtml = sec.name ? `<div class="sub-section-label">${sec.name}</div>` : '';
    return `${nameHtml}<ul class="ingredient-list">${(sec.ingredients||[]).map(i=>`<li>${i}</li>`).join('')}</ul>`;
  }).join('');
  const instructionsHtml = (r.instructions||'').split('\n\n')
    .map(p=>`<p>${p.replace(/\n/g,'<br>')}</p>`).join('<br>');
  const variationsHtml = r.variations&&r.variations.length ? `
    <div class="variations-block">
      <div class="section-label">Variations</div>
      ${r.variations.map(v=>`<div class="variation-item">
        <span class="variation-name">${v.name}:</span>
        <span class="variation-desc"> ${v.description}</span>
      </div>`).join('')}
    </div>` : '';
  const notesHtml = r.notes ? `<div class="notes-block">${r.notes}</div>` : '';

  const madeCount = madeLog.length;
  const lastMade = madeLog.length ? madeLog[0].made_on : null;
  const madeStatusHtml = madeCount === 0
    ? `<span class="made-status never">Never made</span>`
    : `<span class="made-status made">Made ${madeCount} time${madeCount===1?'':'s'}${lastMade ? ' · last ' + lastMade : ''}</span>`;

  content.innerHTML = `
    <div class="recipe-detail-toolbar">
      <button class="edit-btn" onclick="enterEditMode()">✏ Edit</button>
    </div>
    <h1 class="recipe-title">${r.title}</h1>
    <div class="recipe-meta">
      <span class="recipe-category-badge">${r.category}</span>
      ${yieldHtml}
      ${madeStatusHtml}
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
    <hr class="recipe-divider" />
    <div class="recipe-log-section" id="made-log-section">
      ${renderMadeLogHtml()}
    </div>
    <div class="recipe-log-section" id="comments-section">
      ${renderCommentsHtml()}
    </div>
  `;
  bindMadeLogEvents();
  bindCommentEvents();
}

// ── Made log ──────────────────────────────────────────────────

function renderMadeLogHtml() {
  const rows = madeLog.map(e => `
    <div class="log-entry">
      <span class="log-entry-date">${e.made_on || '—'}</span>
      ${e.notes ? `<span class="log-entry-notes">${esc(e.notes)}</span>` : ''}
      <button class="log-entry-del" data-id="${e.id}" data-type="made" title="Remove">✕</button>
    </div>`).join('');
  return `
    <div class="log-header-row">
      <div class="section-label">Made It Log</div>
      <button class="add-log-btn" id="show-made-form-btn">+ Log a Cook</button>
    </div>
    <div id="made-form-container"></div>
    ${madeLog.length ? `<div class="log-entries">${rows}</div>` : '<p class="log-empty">Not cooked yet.</p>'}
  `;
}

function renderMadeFormHtml() {
  const today = new Date().toISOString().split('T')[0];
  return `
    <form class="inline-log-form" id="made-form">
      <input type="date" name="made_on" value="${today}" placeholder="Date (optional)">
      <input type="text" name="notes" placeholder="Notes (optional)" style="flex:1">
      <button type="submit" class="save-btn">Save</button>
      <button type="button" class="cancel-btn" id="cancel-made-btn">Cancel</button>
    </form>`;
}

function bindMadeLogEvents() {
  document.getElementById('show-made-form-btn')?.addEventListener('click', () => {
    document.getElementById('made-form-container').innerHTML = renderMadeFormHtml();
    document.getElementById('cancel-made-btn').addEventListener('click', () => {
      document.getElementById('made-form-container').innerHTML = '';
    });
    document.getElementById('made-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const res = await fetch(`/api/recipes/${id}/made`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({made_on: form.made_on.value, notes: form.notes.value.trim()||null}),
      });
      if (res.ok) {
        const data = await res.json();
        madeLog.unshift({id: data.id, made_on: form.made_on.value, notes: form.notes.value.trim()||null});
        document.getElementById('made-log-section').innerHTML = renderMadeLogHtml();
        bindMadeLogEvents();
        refreshMadeStatus();
      }
    });
  });

  document.querySelectorAll('.log-entry-del[data-type="made"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this entry?')) return;
      const entryId = parseInt(btn.dataset.id);
      const res = await fetch(`/api/recipes/${id}/made/${entryId}`, {method:'DELETE'});
      if (res.ok) {
        madeLog = madeLog.filter(e => e.id !== entryId);
        document.getElementById('made-log-section').innerHTML = renderMadeLogHtml();
        bindMadeLogEvents();
        refreshMadeStatus();
      }
    });
  });
}

function refreshMadeStatus() {
  const madeCount = madeLog.length;
  const lastMade = madeLog.length ? madeLog[0].made_on : null;
  const el = document.querySelector('.made-status');
  if (!el) return;
  if (madeCount === 0) {
    el.className = 'made-status never';
    el.textContent = 'Never made';
  } else {
    el.className = 'made-status made';
    el.textContent = `Made ${madeCount} time${madeCount===1?'':'s'}${lastMade ? ' · last ' + lastMade : ''}`;
  }
}

// ── Comments ──────────────────────────────────────────────────

function renderCommentsHtml() {
  const rows = comments.map(c => `
    <div class="log-entry">
      <span class="log-entry-date">${c.created_at.slice(0,16).replace('T',' ')}</span>
      <span class="log-entry-notes">${esc(c.comment)}</span>
      <button class="log-entry-del" data-id="${c.id}" data-type="comment" title="Remove">✕</button>
    </div>`).join('');
  return `
    <div class="log-header-row">
      <div class="section-label">Comments</div>
      <button class="add-log-btn" id="show-comment-form-btn">+ Add Comment</button>
    </div>
    <div id="comment-form-container"></div>
    ${comments.length ? `<div class="log-entries">${rows}</div>` : '<p class="log-empty">No comments yet.</p>'}
  `;
}

function bindCommentEvents() {
  document.getElementById('show-comment-form-btn')?.addEventListener('click', () => {
    document.getElementById('comment-form-container').innerHTML = `
      <form class="inline-log-form" id="comment-form">
        <input type="text" name="comment" placeholder="Your note..." style="flex:1" required>
        <button type="submit" class="save-btn">Save</button>
        <button type="button" class="cancel-btn" id="cancel-comment-btn">Cancel</button>
      </form>`;
    document.getElementById('cancel-comment-btn').addEventListener('click', () => {
      document.getElementById('comment-form-container').innerHTML = '';
    });
    document.getElementById('comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const res = await fetch(`/api/recipes/${id}/comments`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({comment: form.comment.value.trim()}),
      });
      if (res.ok) {
        const data = await res.json();
        const now = new Date().toISOString().slice(0,16).replace('T',' ');
        comments.unshift({id: data.id, comment: form.comment.value.trim(), created_at: now});
        document.getElementById('comments-section').innerHTML = renderCommentsHtml();
        bindCommentEvents();
      }
    });
  });

  document.querySelectorAll('.log-entry-del[data-type="comment"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this comment?')) return;
      const commentId = parseInt(btn.dataset.id);
      const res = await fetch(`/api/recipes/${id}/comments/${commentId}`, {method:'DELETE'});
      if (res.ok) {
        comments = comments.filter(c => c.id !== commentId);
        document.getElementById('comments-section').innerHTML = renderCommentsHtml();
        bindCommentEvents();
      }
    });
  });
}

const CATEGORIES = [
  'Sauces/Dips','Seasonings','Kombucha','Pickles','Dehydrator',
  'Drinks','Appetizers','Sides','Mains','Baking/Desserts','Sourdough'
];

function enterEditMode() {
  const r = currentRecipe;
  const sectionsValue = (r.sections||[]).map(sec =>
    (sec.name?`[${sec.name}]\n`:'')+( sec.ingredients||[]).join('\n')
  ).join('\n\n');
  const variationsValue = (r.variations||[]).map(v=>`${v.name}: ${v.description}`).join('\n');

  content.innerHTML = `
    <form class="edit-form" onsubmit="saveEdits(event)">
      <div class="edit-form-header">
        <h2>Edit Recipe</h2>
        <div class="edit-form-btns">
          <button type="submit" class="save-btn">Save</button>
          <button type="button" class="cancel-btn" onclick="cancelEdit()">Cancel</button>
          <button type="button" class="delete-btn" onclick="deleteRecipe()">Delete</button>
        </div>
      </div>
      <div class="edit-grid">
        <label class="edit-wide">Title<input type="text" name="title" value="${esc(r.title)}" required></label>
        <label>Category
          <select name="category">${CATEGORIES.map(c=>`<option ${c===r.category?'selected':''}>${c}</option>`).join('')}</select>
        </label>
        <label>Yield<input type="text" name="yield" value="${esc(r.yield||'')}"></label>
        <label class="edit-wide">Tags (comma separated)<input type="text" name="tags" value="${esc((r.tags||[]).join(', '))}"></label>
        <label class="edit-wide">Image URL<input type="url" name="image" value="${esc(r.image||'')}"></label>
        <label class="edit-wide">Ingredients
          <small>One per line. Start a section with [Section Name].</small>
          <textarea name="sections" rows="10">${esc(sectionsValue)}</textarea>
        </label>
        <label class="edit-wide">Instructions<textarea name="instructions" rows="8">${esc(r.instructions||'')}</textarea></label>
        <label class="edit-wide">Variations
          <small>One per line: Name: Description</small>
          <textarea name="variations" rows="4">${esc(variationsValue)}</textarea>
        </label>
        <label class="edit-wide">Notes<textarea name="notes" rows="3">${esc(r.notes||'')}</textarea></label>
      </div>
    </form>`;
}

function cancelEdit() { render(currentRecipe); }

function parseSections(text) {
  const sections = []; let current = {name:null,ingredients:[]};
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const m = line.match(/^\[(.+)\]$/);
    if (m) { if (current.ingredients.length) sections.push(current); current={name:m[1],ingredients:[]}; }
    else current.ingredients.push(line);
  }
  if (current.ingredients.length) sections.push(current);
  return sections;
}

function parseVariations(text) {
  return text.split('\n').map(l=>l.trim()).filter(Boolean).map(l => {
    const idx = l.indexOf(':');
    return idx>-1 ? {name:l.slice(0,idx).trim(),description:l.slice(idx+1).trim()} : {name:l,description:''};
  });
}

async function saveEdits(evt) {
  evt.preventDefault();
  const form = evt.target;
  const data = {
    title:        form.title.value.trim(),
    category:     form.category.value,
    yield:        form.yield.value.trim()||null,
    image:        form.image.value.trim(),
    tags:         form.tags.value.split(',').map(t=>t.trim()).filter(Boolean),
    sections:     parseSections(form.sections.value),
    instructions: form.instructions.value.trim(),
    variations:   parseVariations(form.variations.value),
    notes:        form.notes.value.trim()||null,
  };
  const res = await fetch(`/api/recipes/${id}`, {
    method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data),
  });
  if (res.ok) { currentRecipe={...currentRecipe,...data}; render(currentRecipe); }
  else alert('Save failed.');
}

async function deleteRecipe() {
  if (!confirm(`Delete "${currentRecipe.title}"? This cannot be undone.`)) return;
  const res = await fetch(`/api/recipes/${id}`, {method:'DELETE'});
  if (res.ok) window.location.href='/';
  else alert('Delete failed.');
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showError(msg) {
  content.innerHTML=`<p style="text-align:center;color:var(--color-muted);padding:3rem;">${msg}</p>`;
}

loadRecipe();
