/* ── Dan's Recipes — Recipe Detail ───────────────────────── */

const zoomSlider = document.getElementById('zoom-slider');
zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--zoom', zoomSlider.value);
});

const params = new URLSearchParams(window.location.search);
const id = params.get('id');
const content = document.getElementById('recipe-content');

async function loadRecipe() {
  if (!id) { showError('No recipe specified.'); return; }

  try {
    const res = await fetch(`data/recipes/${id}.json`);
    if (!res.ok) throw new Error('Not found');
    const recipe = await res.json();
    render(recipe);
    document.title = `${recipe.title} — Dan's Recipes`;
  } catch {
    showError('Recipe not found.');
  }
}

function render(r) {
  const yieldHtml = r.yield
    ? `<span class="recipe-yield">Yield: ${r.yield}</span>` : '';

  const tagsHtml = r.tags.map(t =>
    `<span class="card-tag">${t}</span>`
  ).join('');

  const ingredientsHtml = r.sections.map(sec => {
    const nameHtml = sec.name
      ? `<div class="sub-section-label">${sec.name}</div>` : '';
    const items = sec.ingredients.map(i => `<li>${i}</li>`).join('');
    return `${nameHtml}<ul class="ingredient-list">${items}</ul>`;
  }).join('');

  const instructionsHtml = (r.instructions || '')
    .split('\n\n')
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('<br>');

  const variationsHtml = r.variations ? `
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
}

function showError(msg) {
  content.innerHTML = `<p style="text-align:center;color:var(--color-muted);padding:3rem;">${msg}</p>`;
}

loadRecipe();
