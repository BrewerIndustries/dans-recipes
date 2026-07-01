import argparse, os, shutil, json, secrets
from pathlib import Path
import urllib.request, urllib.parse
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Depends
from fastapi.responses import HTMLResponse, FileResponse, Response
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

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], allow_credentials=True)

# ── Auth ──────────────────────────────────────────────────────
_sessions: set[str] = set()

def require_auth(request: Request):
    token = request.cookies.get("session")
    if not token or token not in _sessions:
        raise HTTPException(status_code=401, detail="Unauthorized")

@app.post("/api/auth/login")
async def auth_login(request: Request, response: Response):
    data = await request.json()
    if data.get("password") != config["admin_password"]:
        raise HTTPException(status_code=401, detail="Wrong password")
    token = secrets.token_hex(32)
    _sessions.add(token)
    response.set_cookie("session", token, httponly=True, samesite="lax", max_age=86400 * 30)
    return {"ok": True}

@app.post("/api/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get("session")
    _sessions.discard(token)
    response.delete_cookie("session")
    return {"ok": True}

@app.get("/api/auth/me")
async def auth_me(request: Request):
    token = request.cookies.get("session")
    return {"loggedIn": bool(token and token in _sessions)}

SOURCE_IMAGES_DIR = Path(config['db_path']).parent / "source-images"
RECIPE_IMAGES_DIR = Path(config['db_path']).parent / "recipe-images"
SOURCE_IMAGES_DIR.mkdir(exist_ok=True)
RECIPE_IMAGES_DIR.mkdir(exist_ok=True)

# Mount static directories
app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")
app.mount("/data", StaticFiles(directory="data"), name="data")
app.mount("/source-images", StaticFiles(directory=str(SOURCE_IMAGES_DIR)), name="source-images")
app.mount("/recipe-images", StaticFiles(directory=str(RECIPE_IMAGES_DIR)), name="recipe-images")


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

@app.post("/api/recipes", dependencies=[Depends(require_auth)])
async def create_recipe(request: Request):
    data = await request.json()
    id = db.create_recipe(data)
    return {"id": id}

@app.put("/api/recipes/{id}", dependencies=[Depends(require_auth)])
async def update_recipe(id: str, request: Request):
    data = await request.json()
    if not db.get_recipe(id):
        raise HTTPException(status_code=404, detail="Not found")
    db.update_recipe(id, data)
    return {"ok": True}

@app.delete("/api/recipes/{id}", dependencies=[Depends(require_auth)])
async def delete_recipe(id: str, request: Request):
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

@app.post("/api/sourdough/log", dependencies=[Depends(require_auth)])
async def create_log(request: Request):
    data = await request.json()
    id = db.create_log_entry(data)
    return {"id": id}

@app.put("/api/sourdough/log/{id}", dependencies=[Depends(require_auth)])
async def update_log(id: int, request: Request):
    data = await request.json()
    db.update_log_entry(id, data)
    return {"ok": True}

@app.delete("/api/sourdough/log/{id}", dependencies=[Depends(require_auth)])
async def delete_log(id: int, request: Request):
    db.delete_log_entry(id)
    return {"ok": True}

# ── Image uploads ─────────────────────────────────────────────
@app.post("/api/recipes/{id}/source-image", dependencies=[Depends(require_auth)])
async def upload_source_image(id: str, file: UploadFile = File(...)):
    if not db.get_recipe(id):
        raise HTTPException(status_code=404, detail="Not found")
    suffix = Path(file.filename).suffix.lower() or ".jpg"
    dest = SOURCE_IMAGES_DIR / f"{id}{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    filename = f"{id}{suffix}"
    db.set_source_image(id, filename)
    return {"filename": filename}

@app.post("/api/recipes/{id}/image", dependencies=[Depends(require_auth)])
async def upload_recipe_image(id: str, file: UploadFile = File(...)):
    if not db.get_recipe(id):
        raise HTTPException(status_code=404, detail="Not found")
    suffix = Path(file.filename).suffix.lower() or ".jpg"
    dest = RECIPE_IMAGES_DIR / f"{id}{suffix}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    url = f"/recipe-images/{id}{suffix}"
    db.update_recipe(id, {**db.get_recipe(id), 'image': url})
    return {"url": url}

# ── Fetch photo from source URL via Microlink ─────────────────
@app.post("/api/recipes/{id}/fetch-photo", dependencies=[Depends(require_auth)])
async def fetch_photo(id: str):
    recipe = db.get_recipe(id)
    if not recipe:
        raise HTTPException(status_code=404, detail="Not found")
    source_url = recipe.get("source_url")
    if not source_url:
        raise HTTPException(status_code=400, detail="Recipe has no source URL — add one first")
    # Ask Microlink for the og:image
    try:
        ml_url = f"https://api.microlink.io?url={urllib.parse.quote(source_url, safe='')}"
        req = urllib.request.Request(ml_url, headers={"User-Agent": "dans-recipes/1.0"})
        with urllib.request.urlopen(req, timeout=12) as r:
            payload = json.loads(r.read())
        img_url = (payload.get("data") or {}).get("image", {})
        if isinstance(img_url, dict):
            img_url = img_url.get("url")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Microlink error: {e}")
    if not img_url:
        raise HTTPException(status_code=404, detail="No image found at that URL")
    # Download the image
    try:
        req = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r:
            content_type = r.headers.get("content-type", "image/jpeg")
            ext = ".png" if "png" in content_type else ".webp" if "webp" in content_type else ".jpg"
            dest = RECIPE_IMAGES_DIR / f"{id}{ext}"
            with dest.open("wb") as f:
                shutil.copyfileobj(r, f)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Image download failed: {e}")
    url = f"/recipe-images/{id}{ext}"
    db.update_recipe(id, {**recipe, "image": url})
    return {"url": url}

# ── Made log endpoints ────────────────────────────────────────
@app.get("/api/recipes/{id}/made")
async def get_made(id: str):
    return db.get_made_log(id)

@app.post("/api/recipes/{id}/made", dependencies=[Depends(require_auth)])
async def add_made(id: str, request: Request):
    if not db.get_recipe(id):
        raise HTTPException(status_code=404, detail="Not found")
    data = await request.json()
    entry_id = db.add_made_entry(id, data.get("made_on") or None, data.get("notes"))
    return {"id": entry_id}

@app.delete("/api/recipes/{id}/made/{entry_id}", dependencies=[Depends(require_auth)])
async def delete_made(id: str, entry_id: int):
    db.delete_made_entry(entry_id)
    return {"ok": True}

# ── Comment endpoints ─────────────────────────────────────────
@app.get("/api/recipes/{id}/comments")
async def get_comments(id: str):
    return db.get_comments(id)

@app.post("/api/recipes/{id}/comments", dependencies=[Depends(require_auth)])
async def add_comment(id: str, request: Request):
    if not db.get_recipe(id):
        raise HTTPException(status_code=404, detail="Not found")
    data = await request.json()
    comment = (data.get("comment") or "").strip()
    if not comment:
        raise HTTPException(status_code=400, detail="comment required")
    comment_id = db.add_comment(id, comment)
    return {"id": comment_id}

@app.delete("/api/recipes/{id}/comments/{comment_id}", dependencies=[Depends(require_auth)])
async def delete_comment(id: str, comment_id: int):
    db.delete_comment(comment_id)
    return {"ok": True}

# ── Category/tag endpoints ─────────────────────────────────────
@app.get("/api/categories")
async def categories():
    return db.get_categories()

@app.get("/api/tags")
async def tags():
    return db.get_tags()

@app.post("/api/tags/rename", dependencies=[Depends(require_auth)])
async def rename_tag(request: Request):
    data = await request.json()
    old, new = data.get("old", "").strip(), data.get("new", "").strip().lower()
    if not old or not new:
        raise HTTPException(status_code=400, detail="old and new required")
    count = db.rename_tag(old, new)
    return {"updated": count}

@app.delete("/api/tags/{tag:path}", dependencies=[Depends(require_auth)])
async def delete_tag(tag: str):
    count = db.delete_tag(tag)
    return {"updated": count}

# ── Entry point ────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args()
    port = args.port or config['port']
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
