import argparse, os, sys
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import yaml

import db

# ── Config ────────────────────────────────────────────────────
def load_config():
    cfg = {}
    cfg_path = Path('config.yaml')
    if cfg_path.exists():
        with open(cfg_path) as f:
            cfg = yaml.safe_load(f) or {}
    return {
        'admin_password': cfg.get('admin_password') or os.environ.get('ADMIN_PASSWORD', 'changeme'),
        'api_key': cfg.get('api_key') or os.environ.get('API_KEY', ''),
        'secret_key': cfg.get('secret_key') or os.environ.get('SECRET_KEY', 'dev-secret'),
        'db_path': cfg.get('db_path') or os.environ.get('DB_PATH', 'data/dans-recipes.db'),
        'port': cfg.get('port') or int(os.environ.get('PORT', 5050)),
    }

config = load_config()
db.set_db_path(config['db_path'])
db.init_db()

app = FastAPI(title="Dan's Recipes")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Mount static directories
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/data", StaticFiles(directory="data"), name="data")

# ── Auth ───────────────────────────────────────────────────────
def check_auth(request: Request):
    auth = request.headers.get('Authorization', '')
    api_key = request.headers.get('X-API-Key', '')
    token = auth.replace('Bearer ', '').strip() if auth.startswith('Bearer ') else ''
    if (token and token == config['secret_key']) or (api_key and api_key == config['api_key']):
        return True
    raise HTTPException(status_code=401, detail="Unauthorized")

# ── HTML routes ────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index():
    return FileResponse("index.html")

@app.get("/recipe/{id}", response_class=HTMLResponse)
async def recipe_page(id: str):
    return FileResponse("recipe.html")

@app.get("/sourdough", response_class=HTMLResponse)
async def sourdough_page():
    return FileResponse("index.html")

# ── Auth endpoints ─────────────────────────────────────────────
@app.post("/api/login")
async def login(request: Request):
    body = await request.json()
    password = body.get('password', '')
    if password == config['admin_password']:
        return {"token": config['secret_key']}
    raise HTTPException(status_code=401, detail="Invalid password")

@app.get("/api/me")
async def me(auth=Depends(check_auth)):
    return {"ok": True}

# ── Recipe endpoints ───────────────────────────────────────────
@app.get("/api/recipes")
async def list_recipes(category: str = None, tag: str = None, q: str = None):
    return db.get_all_recipes(category=category, tag=tag, search=q)

@app.get("/api/recipes/{id}")
async def get_recipe(id: str):
    r = db.get_recipe(id)
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return r

@app.post("/api/recipes")
async def create_recipe(request: Request, auth=Depends(check_auth)):
    data = await request.json()
    id = db.create_recipe(data)
    return {"id": id}

@app.put("/api/recipes/{id}")
async def update_recipe(id: str, request: Request, auth=Depends(check_auth)):
    data = await request.json()
    if not db.get_recipe(id):
        raise HTTPException(status_code=404, detail="Not found")
    db.update_recipe(id, data)
    return {"ok": True}

@app.delete("/api/recipes/{id}")
async def delete_recipe(id: str, auth=Depends(check_auth)):
    if not db.get_recipe(id):
        raise HTTPException(status_code=404, detail="Not found")
    db.delete_recipe(id)
    return {"ok": True}

# ── Sourdough log endpoints ────────────────────────────────────
@app.get("/api/sourdough/log")
async def get_log():
    entries = db.get_log_entries()
    for e in entries:
        if e.get('flour_used') and e.get('water_used') and e['flour_used'] > 0:
            e['hydration'] = round(e['water_used'] / e['flour_used'] * 100, 1)
        else:
            e['hydration'] = None
    return entries

@app.post("/api/sourdough/log")
async def create_log(request: Request, auth=Depends(check_auth)):
    data = await request.json()
    id = db.create_log_entry(data)
    return {"id": id}

@app.put("/api/sourdough/log/{id}")
async def update_log(id: int, request: Request, auth=Depends(check_auth)):
    data = await request.json()
    db.update_log_entry(id, data)
    return {"ok": True}

@app.delete("/api/sourdough/log/{id}")
async def delete_log(id: int, auth=Depends(check_auth)):
    db.delete_log_entry(id)
    return {"ok": True}

# ── Category/tag endpoints ─────────────────────────────────────
@app.get("/api/categories")
async def categories():
    return db.get_categories()

@app.get("/api/tags")
async def tags():
    return db.get_tags()

# ── Entry point ────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args()
    port = args.port or config['port']
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
