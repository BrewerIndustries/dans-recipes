import sqlite3, json, os
from pathlib import Path
from contextlib import contextmanager

DB_PATH = os.environ.get('DB_PATH', 'data/dans-recipes.db')

def set_db_path(path):
    global DB_PATH
    DB_PATH = path

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    with get_conn() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.commit()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS recipes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                tags TEXT DEFAULT '[]',
                yield TEXT,
                image TEXT DEFAULT '',
                sections TEXT DEFAULT '[]',
                instructions TEXT DEFAULT '',
                variations TEXT DEFAULT '[]',
                notes TEXT,
                source_url TEXT,
                source_image TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS sourdough_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date_started TEXT,
                date_finished TEXT,
                flour_used REAL,
                water_used REAL,
                starter_used REAL,
                ranking INTEGER DEFAULT 0,
                notes TEXT,
                recipe_id TEXT REFERENCES recipes(id),
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS recipe_made_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
                made_on TEXT NOT NULL,
                notes TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS recipe_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
                comment TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        conn.commit()
        # Migrations for columns added after initial deploy
        for col, typedef in [('source_url', 'TEXT'), ('source_image', 'TEXT')]:
            try:
                conn.execute(f"ALTER TABLE recipes ADD COLUMN {col} {typedef}")
                conn.commit()
            except Exception:
                pass  # column already exists

def _deserialize(row):
    d = dict(row)
    for field in ('tags', 'sections', 'variations'):
        if field in d and d[field] is not None:
            try:
                d[field] = json.loads(d[field])
            except Exception:
                d[field] = []
    return d

def get_all_recipes(category=None, tag=None, search=None):
    with get_conn() as conn:
        sql = """
            SELECT r.*,
                   COUNT(m.id) as made_count,
                   MAX(m.made_on) as last_made
            FROM recipes r
            LEFT JOIN recipe_made_log m ON m.recipe_id = r.id
            WHERE 1=1
        """
        params = []
        if category:
            sql += " AND r.category = ?"
            params.append(category)
        if search:
            sql += " AND (r.title LIKE ? OR r.tags LIKE ? OR r.category LIKE ?)"
            s = f"%{search}%"
            params.extend([s, s, s])
        sql += " GROUP BY r.id ORDER BY r.title"
        rows = conn.execute(sql, params).fetchall()
    results = [_deserialize(r) for r in rows]
    if tag:
        results = [r for r in results if tag in r.get('tags', [])]
    return results

def get_recipe(id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM recipes WHERE id = ?", [id]).fetchone()
    return _deserialize(row) if row else None

def create_recipe(data):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO recipes (id, title, category, tags, yield, image, sections, instructions, variations, notes, source_url, source_image)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            data['id'], data['title'], data['category'],
            json.dumps(data.get('tags', [])),
            data.get('yield'),
            data.get('image', ''),
            json.dumps(data.get('sections', [])),
            data.get('instructions', ''),
            json.dumps(data.get('variations') or []),
            data.get('notes'),
            data.get('source_url'),
            data.get('source_image'),
        ])
        conn.commit()
    return data['id']

def update_recipe(id, data):
    with get_conn() as conn:
        conn.execute("""
            UPDATE recipes SET
                title=?, category=?, tags=?, yield=?, image=?, sections=?,
                instructions=?, variations=?, notes=?, source_url=?, source_image=?,
                updated_at=datetime('now')
            WHERE id=?
        """, [
            data['title'], data['category'],
            json.dumps(data.get('tags', [])),
            data.get('yield'),
            data.get('image', ''),
            json.dumps(data.get('sections', [])),
            data.get('instructions', ''),
            json.dumps(data.get('variations') or []),
            data.get('notes'),
            data.get('source_url'),
            data.get('source_image'),
            id,
        ])
        conn.commit()

def set_source_image(id, filename):
    with get_conn() as conn:
        conn.execute("UPDATE recipes SET source_image=?, updated_at=datetime('now') WHERE id=?", [filename, id])
        conn.commit()

def delete_recipe(id):
    with get_conn() as conn:
        conn.execute("DELETE FROM recipes WHERE id=?", [id])
        conn.commit()

def get_categories():
    with get_conn() as conn:
        rows = conn.execute("SELECT category, COUNT(*) as count FROM recipes GROUP BY category ORDER BY category").fetchall()
    return [dict(r) for r in rows]

def get_tags():
    with get_conn() as conn:
        rows = conn.execute("SELECT tags FROM recipes").fetchall()
    all_tags = set()
    for row in rows:
        try:
            all_tags.update(json.loads(row['tags']))
        except Exception:
            pass
    return sorted(all_tags)

def get_log_entries():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM sourdough_log ORDER BY date_started DESC, id DESC").fetchall()
    return [dict(r) for r in rows]

def get_log_entry(id):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM sourdough_log WHERE id=?", [id]).fetchone()
    return dict(row) if row else None

def create_log_entry(data):
    with get_conn() as conn:
        cur = conn.execute("""
            INSERT INTO sourdough_log (date_started, date_finished, flour_used, water_used, starter_used, ranking, notes, recipe_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, [
            data.get('date_started'), data.get('date_finished'),
            data.get('flour_used'), data.get('water_used'), data.get('starter_used'),
            data.get('ranking', 0), data.get('notes'), data.get('recipe_id'),
        ])
        conn.commit()
        return cur.lastrowid

def update_log_entry(id, data):
    with get_conn() as conn:
        conn.execute("""
            UPDATE sourdough_log SET
                date_started=?, date_finished=?, flour_used=?, water_used=?,
                starter_used=?, ranking=?, notes=?, recipe_id=?
            WHERE id=?
        """, [
            data.get('date_started'), data.get('date_finished'),
            data.get('flour_used'), data.get('water_used'), data.get('starter_used'),
            data.get('ranking', 0), data.get('notes'), data.get('recipe_id'),
            id,
        ])
        conn.commit()

def delete_log_entry(id):
    with get_conn() as conn:
        conn.execute("DELETE FROM sourdough_log WHERE id=?", [id])
        conn.commit()

# ── Recipe made log ────────────────────────────────────────────

def get_made_log(recipe_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM recipe_made_log WHERE recipe_id=? ORDER BY made_on DESC, id DESC",
            [recipe_id]
        ).fetchall()
    return [dict(r) for r in rows]

def add_made_entry(recipe_id, made_on, notes=None):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO recipe_made_log (recipe_id, made_on, notes) VALUES (?, ?, ?)",
            [recipe_id, made_on, notes]
        )
        conn.commit()
        return cur.lastrowid

def delete_made_entry(entry_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM recipe_made_log WHERE id=?", [entry_id])
        conn.commit()

# ── Recipe comments ────────────────────────────────────────────

def get_comments(recipe_id):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM recipe_comments WHERE recipe_id=? ORDER BY created_at DESC",
            [recipe_id]
        ).fetchall()
    return [dict(r) for r in rows]

def add_comment(recipe_id, comment):
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO recipe_comments (recipe_id, comment) VALUES (?, ?)",
            [recipe_id, comment]
        )
        conn.commit()
        return cur.lastrowid

def delete_comment(comment_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM recipe_comments WHERE id=?", [comment_id])
        conn.commit()
