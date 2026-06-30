import sqlite3, json, os
from pathlib import Path

DB_PATH = os.environ.get('DB_PATH', 'data/dans-recipes.db')

def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def set_db_path(path):
    global DB_PATH
    DB_PATH = path

def init_db():
    conn = get_conn()
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
    """)
    conn.commit()
    conn.close()

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
    conn = get_conn()
    sql = "SELECT * FROM recipes WHERE 1=1"
    params = []
    if category:
        sql += " AND category = ?"
        params.append(category)
    if search:
        sql += " AND (title LIKE ? OR tags LIKE ? OR category LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s])
    rows = conn.execute(sql + " ORDER BY title", params).fetchall()
    conn.close()
    results = [_deserialize(r) for r in rows]
    if tag:
        results = [r for r in results if tag in r.get('tags', [])]
    return results

def get_recipe(id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM recipes WHERE id = ?", [id]).fetchone()
    conn.close()
    return _deserialize(row) if row else None

def create_recipe(data):
    conn = get_conn()
    conn.execute("""
        INSERT INTO recipes (id, title, category, tags, yield, image, sections, instructions, variations, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        data['id'], data['title'], data['category'],
        json.dumps(data.get('tags', [])),
        data.get('yield'),
        data.get('image', ''),
        json.dumps(data.get('sections', [])),
        data.get('instructions', ''),
        json.dumps(data.get('variations') or []),
        data.get('notes'),
    ])
    conn.commit()
    conn.close()
    return data['id']

def update_recipe(id, data):
    conn = get_conn()
    conn.execute("""
        UPDATE recipes SET
            title=?, category=?, tags=?, yield=?, image=?, sections=?,
            instructions=?, variations=?, notes=?,
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
        id,
    ])
    conn.commit()
    conn.close()

def delete_recipe(id):
    conn = get_conn()
    conn.execute("DELETE FROM recipes WHERE id=?", [id])
    conn.commit()
    conn.close()

def get_categories():
    conn = get_conn()
    rows = conn.execute("SELECT category, COUNT(*) as count FROM recipes GROUP BY category ORDER BY category").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_tags():
    conn = get_conn()
    rows = conn.execute("SELECT tags FROM recipes").fetchall()
    conn.close()
    all_tags = set()
    for row in rows:
        try:
            tags = json.loads(row['tags'])
            all_tags.update(tags)
        except Exception:
            pass
    return sorted(all_tags)

def get_log_entries():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM sourdough_log ORDER BY date_started DESC, id DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_log_entry(id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM sourdough_log WHERE id=?", [id]).fetchone()
    conn.close()
    return dict(row) if row else None

def create_log_entry(data):
    conn = get_conn()
    cur = conn.execute("""
        INSERT INTO sourdough_log (date_started, date_finished, flour_used, water_used, starter_used, ranking, notes, recipe_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        data.get('date_started'), data.get('date_finished'),
        data.get('flour_used'), data.get('water_used'), data.get('starter_used'),
        data.get('ranking', 0), data.get('notes'), data.get('recipe_id'),
    ])
    conn.commit()
    id = cur.lastrowid
    conn.close()
    return id

def update_log_entry(id, data):
    conn = get_conn()
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
    conn.close()

def delete_log_entry(id):
    conn = get_conn()
    conn.execute("DELETE FROM sourdough_log WHERE id=?", [id])
    conn.commit()
    conn.close()
