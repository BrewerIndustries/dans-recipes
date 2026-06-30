/* ── Dan's Recipes — Browse/Search ───────────────────────── */

let allRecipes = [];
let activeCategory = 'All';
let activeTag = null;
let fuse = null;

const grid = document.getElementById('recipe-grid');
const countEl = document.getElementById('results-count');
const searchInput = document.getElementById('search-input');
const tagBar = document.getElementById('tag-bar');
const zoomSlider = document.getElementById('zoom-slider');

// ── Zoom ──────────────────────────────────────────────────
zoomSlider.addEventListener('input', () => {
  document.documentElement.style.setProperty('--zoom', zoomSlider.value);
});

// ── Load data ─────────────────────────────────────────────
async function init() {
  const res = await fetch('data/index.json');
  const data = await res.json();
  allRecipes = data.recipes;

  buildCategoryTabs(data.categories);
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
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-tab';
    btn.dataset.cat = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      activeCategory = cat;
      activeTag = null;
      document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      buildTagBar();
      renderGrid();
    });
    nav.appendChild(btn);
  });

  // "All" tab handler
  document.querySelector('.cat-tab[data-cat="All"]').addEventListener('click', function () {
    activeCategory = 'All';
    activeTag = null;
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    buildTagBar();
    renderGrid();
  });
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

  countEl.textContent = results.length === 1
    ? '1 recipe'
    : `${results.length} recipes`;

  grid.innerHTML = '';

  if (results.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>No recipes found.</p></div>`;
    return;
  }

  results.forEach(recipe => {
    const card = document.createElement('a');
    card.className = 'recipe-card';
    card.href = `recipe.html?id=${recipe.id}`;
    card.innerHTML = `
      <div class="card-category">${recipe.category}</div>
      <div class="card-title">${recipe.title}</div>
      <div class="card-tags">
        ${recipe.tags.map(t => `<span class="card-tag">${t}</span>`).join('')}
      </div>
    `;
    grid.appendChild(card);
  });
}

init();
