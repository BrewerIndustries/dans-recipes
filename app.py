"""Dan's Recipes — FastAPI webapp."""

import argparse
import secrets
import uuid
from pathlib import Path

import uvicorn
import yaml
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import db

# ── Config ────────────────────────────────────────────────────────────────────

def _load_config():
    path = Path("config.yaml")
    if path.exists():
        return yaml.safe_load(path.read_text()) or {}
    return {}

cfg = _load_config()
ADMIN_PASSWORD = cfg.get("admin_password", "changeme")
API_KEY        = cfg.get("api_key", "")
DB_PATH        = cfg.get("db_path", "data/dans-recipes.db")

# In-memory valid session tokens
_valid_tokens: set[str] = set()

db.DB_PATH = Path(DB_PATH)
db.init_db()

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Dan's Recipes")
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/js",     StaticFiles(directory="js"),     name="js")
app.mount("/css",    StaticFiles(directory="css"),     name="css")

# ── Auth ──────────────────────────────────────────────────────────────────────

def _is_authed(request: Request) -> bool:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
        if token in _valid_tokens:
            return True
    api_key = request.headers.get("X-API-Key", "")
    if API_KEY and api_key == API_KEY:
        return True
    return False

def require_auth(request: Request):
    if not _is_authed(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

# ── Static pages ──────────────────────────────────────────────────────────────

@app.get("/")
def index():
    return FileResponse("index.html")

@app.get("/recipe/{recipe_id}")
def recipe_page(recipe_id: str):
    return FileResponse("recipe.html")

# ── Auth endpoints ────────────────────────────────────────────────────────────

@app.post("/api/login")
async def login(request: Request):
    body = await request.json()
    if body.get("password") == ADMIN_PASSWORD:
        token = secrets.token_hex(32)
        _valid_tokens.add(token)
        return {"token": token}
    raise HTTPException(status_code=401, detail="Wrong password")

@app.post("/api/logout")
async def logout(request: Request):
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        _valid_tokens.discard(auth[7:])
    return {"ok": True}

@app.get("/api/me")
async def me(request: Request):
    if _is_authed(request):
        return {"ok": True}
    raise HTTPException(status_code=401, detail="Not logged in")

# ── Recipe endpoints ──────────────────────────────────────────────────────────

@app.get("/api/recipes")
def list_recipes(category: str = None, tag: str = None, q: str = None):
    return db.get_all_recipes(category=category, tag=tag, search=q)

@app.get("/api/recipes/{recipe_id}")
def get_recipe(recipe_id: str):
    r = db.get_recipe(recipe_id)
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return r

@app.post("/api/recipes")
async def create_recipe(request: Request, _=Depends(require_auth)):
    data = await request.json()
    if not data.get("id"):
        data["id"] = str(uuid.uuid4())[:8]
    if not data.get("title") or not data.get("category"):
        raise HTTPException(status_code=400, detail="title and category required")
    recipe_id = db.create_recipe(data)
    return {"id": recipe_id}

@app.put("/api/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, request: Request, _=Depends(require_auth)):
    data = await request.json()
    if not db.get_recipe(recipe_id):
        raise HTTPException(status_code=404, detail="Recipe not found")
    db.update_recipe(recipe_id, data)
    return {"ok": True}

@app.delete("/api/recipes/{recipe_id}")
def delete_recipe(recipe_id: str, _=Depends(require_auth)):
    if not db.get_recipe(recipe_id):
        raise HTTPException(status_code=404, detail="Recipe not found")
    db.delete_recipe(recipe_id)
    return {"ok": True}

@app.get("/api/categories")
def categories():
    return db.get_categories()

@app.get("/api/tags")
def tags():
    return db.get_tags()

# ── Sourdough log endpoints ───────────────────────────────────────────────────

@app.get("/api/sourdough/log")
def get_log():
    return db.get_log_entries()

@app.post("/api/sourdough/log")
async def create_log(request: Request, _=Depends(require_auth)):
    data = await request.json()
    entry_id = db.create_log_entry(data)
    return {"id": entry_id}

@app.put("/api/sourdough/log/{entry_id}")
async def update_log(entry_id: int, request: Request, _=Depends(require_auth)):
    data = await request.json()
    if not db.get_log_entry(entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    db.update_log_entry(entry_id, data)
    return {"ok": True}

@app.delete("/api/sourdough/log/{entry_id}")
def delete_log(entry_id: int, _=Depends(require_auth)):
    if not db.get_log_entry(entry_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete_log_entry(entry_id)
    return {"ok": True}

# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=cfg.get("port", 5050))
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()
    uvicorn.run("app:app", host=args.host, port=args.port, reload=False)
