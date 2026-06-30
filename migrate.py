"""One-time migration: import JSON recipe files into SQLite."""

import json
from pathlib import Path
import db

db.init_db()

recipe_dir = Path("data/recipes")
imported = 0
skipped = 0

for json_file in sorted(recipe_dir.glob("*.json")):
    try:
        data = json.loads(json_file.read_text())
        if db.get_recipe(data["id"]):
            print(f"  skip  {data['id']} (already exists)")
            skipped += 1
            continue
        db.create_recipe(data)
        print(f"  import {data['id']} — {data['title']}")
        imported += 1
    except Exception as e:
        print(f"  ERROR {json_file.name}: {e}")

print(f"\nDone: {imported} imported, {skipped} skipped.")
