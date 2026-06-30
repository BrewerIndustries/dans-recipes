#!/usr/bin/env python3
"""One-time migration: import JSON recipe files into SQLite."""
import json, sys
from pathlib import Path

import db

def migrate():
    db.init_db()

    index_path = Path('data/index.json')
    recipes_dir = Path('data/recipes')

    if not index_path.exists():
        print("data/index.json not found")
        sys.exit(1)

    with open(index_path) as f:
        index = json.load(f)

    inserted = 0
    skipped = 0

    for entry in index.get('recipes', []):
        recipe_id = entry['id']
        recipe_path = recipes_dir / f"{recipe_id}.json"

        if not recipe_path.exists():
            print(f"  SKIP (no file): {recipe_id}")
            skipped += 1
            continue

        # Check if already exists
        if db.get_recipe(recipe_id):
            print(f"  SKIP (exists): {recipe_id}")
            skipped += 1
            continue

        with open(recipe_path) as f:
            data = json.load(f)

        # Normalize fields
        data.setdefault('image', '')
        data['variations'] = data.get('variations') or []
        data['sections'] = data.get('sections') or []
        data['tags'] = data.get('tags') or []

        # sections use 'name' key in JSON files — keep as-is, db stores JSON as-is
        # but normalize so both 'name' and 'heading' work in the frontend
        for sec in data['sections']:
            if 'name' in sec and 'heading' not in sec:
                sec['heading'] = sec.pop('name') or ''

        db.create_recipe(data)
        print(f"  OK: {data['title']}")
        inserted += 1

    print(f"\nDone: {inserted} inserted, {skipped} skipped")

if __name__ == '__main__':
    migrate()
