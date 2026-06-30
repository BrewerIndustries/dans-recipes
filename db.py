"""SQLite layer for Dan's Recipes."""

import json
import sqlite3
from pathlib import Path

DB_PATH = Path("data/dans-recipes.db")


def _conn():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    return db


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    with _conn() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS recipes (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            category    TEXT NOT NULL,
            tags        TEXT DEFAULT '[]',
            yield       TEXT,
            image       TEXT DEFAULT '',
            sections    TEXT DEFAULT '[]',
            instructions TEXT DEFAULT '',
            variations  TEXT DEFAULT '[]',
            notes       TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sourdough_log (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            date_started TEXT,
            date_finished TEXT,
            flour_used   REAL,
            water_used   REAL,
            starter_used REAL,
            ranking      INTEGER DEFAULT 0,
            notes        TEXT,
            recipe_id    TEXT REFERENCES recipes(id),
            created_at   TEXT DEFAULT (datetime('now'))
        );
        """)


def _row_to_recipe(row):
    r = dict(row)
    r["tags"]       = json.loads(r.get("tags") or "[]")
    r["sections"]   = json.loads(r.get("sections") or "[]")
    r["variations"] = json.loads(r.get("variations") or "[]")
    return r


def get_all_recipes(category=None, tag=None, search=None):
    with _conn() as db:
        rows = db.execute(
            "SELECT id, title, category, tags, yield, image FROM recipes ORDER BY title"
        ).fetchall()
    results = [_row_to_recipe(r) for r in rows]
    if category and category != "All":
        results = [r for r in results if r["category"] == category]
    if tag:
        results = [r for r in results if tag in r["tags"]]
    if search:
        s = search.lower()
        results = [r for r in results if s in r["title"].lower()
                   or any(s in t.lower() for t in r["tags"])
                   or s in r["category"].lower()]
    return results


def get_recipe(recipe_id):
    with _conn() as db:
        row = db.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    return _row_to_recipe(row) if row else None


def create_recipe(data):
    with _conn() as db:
        db.execute("""
            INSERT INTO recipes (id, title, category, tags, yield, image, sections, instructions, variations, notes)
            VALUES (:id, :title, :category, :tags, :yield, :image, :sections, :instructions, :variations, :notes)
        """, {
            "id":           data["id"],
            "title":        data["title"],
            "category":     data["category"],
            "tags":         json.dumps(data.get("tags", [])),
            "yield":        data.get("yield"),
            "image":        data.get("image", ""),
            "sections":     json.dumps(data.get("sections", [])),
            "instructions": data.get("instructions", ""),
            "variations":   json.dumps(data.get("variations", [])),
            "notes":        data.get("notes"),
        })
    return data["id"]


def update_recipe(recipe_id, data):
    fields = {}
    for key in ("title", "category", "yield", "image", "instructions", "notes"):
        if key in data:
            fields[key] = data[key]
    for key in ("tags", "sections", "variations"):
        if key in data:
            fields[key] = json.dumps(data[key])
    if not fields:
        return
    fields["updated_at"] = "datetime('now')"
    set_clause = ", ".join(
        f"{k} = datetime('now')" if k == "updated_at" else f"{k} = :{k}"
        for k in fields
    )
    params = {k: v for k, v in fields.items() if k != "updated_at"}
    params["id"] = recipe_id
    with _conn() as db:
        db.execute(f"UPDATE recipes SET {set_clause} WHERE id = :id", params)


def delete_recipe(recipe_id):
    with _conn() as db:
        db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))


def get_categories():
    with _conn() as db:
        rows = db.execute(
            "SELECT category, COUNT(*) as count FROM recipes GROUP BY category ORDER BY category"
        ).fetchall()
    return [{"name": r["category"], "count": r["count"]} for r in rows]


def get_tags():
    with _conn() as db:
        rows = db.execute("SELECT tags FROM recipes").fetchall()
    all_tags = set()
    for row in rows:
        all_tags.update(json.loads(row["tags"] or "[]"))
    return sorted(all_tags)


def _row_to_log(row):
    r = dict(row)
    if r.get("flour_used") and r.get("water_used"):
        r["hydration"] = round(r["water_used"] / r["flour_used"] * 100, 1)
    else:
        r["hydration"] = None
    return r


def get_log_entries():
    with _conn() as db:
        rows = db.execute(
            "SELECT * FROM sourdough_log ORDER BY date_started DESC, created_at DESC"
        ).fetchall()
    return [_row_to_log(r) for r in rows]


def get_log_entry(entry_id):
    with _conn() as db:
        row = db.execute("SELECT * FROM sourdough_log WHERE id = ?", (entry_id,)).fetchone()
    return _row_to_log(row) if row else None


def create_log_entry(data):
    with _conn() as db:
        cur = db.execute("""
            INSERT INTO sourdough_log
              (date_started, date_finished, flour_used, water_used, starter_used, ranking, notes, recipe_id)
            VALUES (:date_started, :date_finished, :flour_used, :water_used, :starter_used, :ranking, :notes, :recipe_id)
        """, {
            "date_started":  data.get("date_started"),
            "date_finished": data.get("date_finished"),
            "flour_used":    data.get("flour_used"),
            "water_used":    data.get("water_used"),
            "starter_used":  data.get("starter_used"),
            "ranking":       data.get("ranking", 0),
            "notes":         data.get("notes"),
            "recipe_id":     data.get("recipe_id"),
        })
        return cur.lastrowid


def update_log_entry(entry_id, data):
    fields = {}
    for key in ("date_started", "date_finished", "flour_used", "water_used",
                "starter_used", "ranking", "notes", "recipe_id"):
        if key in data:
            fields[key] = data[key]
    if not fields:
        return
    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = entry_id
    with _conn() as db:
        db.execute(f"UPDATE sourdough_log SET {set_clause} WHERE id = :id", fields)


def delete_log_entry(entry_id):
    with _conn() as db:
        db.execute("DELETE FROM sourdough_log WHERE id = ?", (entry_id,))
