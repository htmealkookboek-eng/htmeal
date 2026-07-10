#htmealkookboek@gmail.com
import pathlib
import json
import threading
import os
import sys
import urllib.parse
import subprocess
import webbrowser
import logging
import shutil
from http.server import SimpleHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
import hashlib
import uuid
from datetime import datetime

BASE_DIR = pathlib.Path(__file__).parent
sys.path.insert(0, str(BASE_DIR))

from logic.collections import RecipeCollection
from logic.search import RecipeSearch
from database import (
    ensure_db,
    get_all_recipes,
    get_recipe,
    search_recipes,
    get_favorites,
    get_user,
    get_all_users,
    save_recipe,
    delete_recipe,
    save_user,
    delete_user,
    get_journey_entries,
    get_journey_entry,
    save_journey_entry,
    delete_journey_entry,
)

RECIPE_FILE = BASE_DIR / "data" / "recipes.json"
WORLD_RECIPES_FILE = BASE_DIR / "data" / "world_recipes.json"
WORLD_JOURNEY_FILE = BASE_DIR / "data" / "world_journey.json"
USERS_FILE = BASE_DIR / "data" / "users.json"
STATIC_DIR = BASE_DIR / "static"
LOG_DIR = BASE_DIR / "logs"
LOG_FILE = LOG_DIR / "cookbook.log"
BACKUP_GC_DIR = BASE_DIR / "backup" / "gc"
MAX_IMAGE_DATA_URL_LENGTH = 3_200_000
MAX_IMAGES_PER_RECIPE = 6
MAX_RECIPE_TITLE_LENGTH = 200
MAX_RECIPE_DESC_LENGTH = 3000
ALLOWED_IMAGE_PREFIXES = (
    "data:image/jpeg",
    "data:image/jpg",
    "data:image/png",
    "data:image/webp",
)
ALLOWED_ORIGIN = os.environ.get("HTMEAL_ALLOWED_ORIGIN")
ADMIN_TOKEN = os.environ.get("HTMEAL_ADMIN_TOKEN")
CSRF_HEADER = "X-CSRF-Token"

RATE_LIMITS = {}
RATE_LIMIT_WINDOW_SECONDS = 60

# File locks to protect concurrent access
RECIPE_LOCK = threading.Lock()
USERS_LOCK = threading.Lock()
WORLD_LOCK = threading.Lock()

def is_rate_limited(key, limit=5):
    now = datetime.now().timestamp()
    window_start = now - RATE_LIMIT_WINDOW_SECONDS
    entries = RATE_LIMITS.get(key, [])
    entries = [ts for ts in entries if ts >= window_start]
    if len(entries) >= limit:
        RATE_LIMITS[key] = entries
        return True
    entries.append(now)
    RATE_LIMITS[key] = entries
    return False


def load_recipes(path):
    return load_json_file(path, RECIPE_LOCK, default=[])


def save_recipes(recipes, path=RECIPE_FILE):
    save_json_file(recipes, path, RECIPE_LOCK)


def load_users():
    if not USERS_FILE.exists():
        return {}
    try:
        with USERS_LOCK:
            with open(USERS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        return {}

def save_users(users):
    save_json_file(users, USERS_FILE, USERS_LOCK)


def load_json_file(path, lock, default=None):
    if default is None:
        default = []
    if not path.exists():
        return default
    with lock:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return default


def save_json_file(data, path, lock):
    tmp = pathlib.Path(str(path) + '.tmp')
    with lock:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        try:
            os.replace(str(tmp), str(path))
        except Exception:
            tmp.rename(path)


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password, hashed):
    return hash_password(password) == hashed


def setup_logging():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
        handlers=[
            logging.FileHandler(LOG_FILE, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )


def parse_json_body(body_bytes):
    try:
        return json.loads(body_bytes.decode('utf-8'))
    except Exception:
        return {}


def valid_data_url(value):
    return isinstance(value, str) and len(value) <= MAX_IMAGE_DATA_URL_LENGTH and any(value.startswith(prefix) for prefix in ALLOWED_IMAGE_PREFIXES)


def validate_recipe_payload(recipe):
    if not isinstance(recipe, dict):
        return False, 'Invalid recipe payload'
    if len(str(recipe.get('title', '') or '')) > MAX_RECIPE_TITLE_LENGTH:
        return False, 'Recipe title is too long'
    if len(str(recipe.get('description', '') or '')) > MAX_RECIPE_DESC_LENGTH:
        return False, 'Recipe description is too long'
    images = []
    for key in ('image', 'extra_image'):
        if recipe.get(key):
            images.append(recipe.get(key))
    for key in ('images', 'extra_images'):
        if isinstance(recipe.get(key), list):
            images.extend(recipe.get(key))
    if len(images) > MAX_IMAGES_PER_RECIPE:
        return False, f'Recipe may contain at most {MAX_IMAGES_PER_RECIPE} images'
    for image_value in images:
        if not valid_data_url(image_value):
            return False, 'Invalid or unsupported image payload'
    return True, None


def get_csrf_token_for_user(username):
    user = get_user(username)
    if user and user.get('csrf_token'):
        return user['csrf_token']
    token = uuid.uuid4().hex
    if user:
        user['csrf_token'] = token
        save_user(user)
    return token


def verify_csrf_token(username, headers):
    if not username:
        return False
    token = headers.get(CSRF_HEADER, '')
    user = get_user(username)
    return bool(user and token and token == user.get('csrf_token'))

# Global state for simplicity in http.server
recipes_data = []
collection_mgr = None
search_mgr = None
users_data = {}
RATE_LIMITS = {}
RATE_LIMIT_WINDOW_SECONDS = 60

class CookbookHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path == "/" or path == "":
            path = "/index.html"
        # Parse query params out of the path if any
        parsed = urllib.parse.urlparse(path)
        path = urllib.parse.unquote(parsed.path.lstrip("/"))
        local_path = STATIC_DIR / path
        if local_path.exists():
            return str(local_path)
        alt_path = BASE_DIR / path
        if alt_path.exists():
            return str(alt_path)
        return str(local_path)

    def parse_cookies(self):
        raw = self.headers.get('Cookie', '')
        cookies = {}
        for part in raw.split(';'):
            if '=' in part:
                name, value = part.split('=', 1)
                cookies[name.strip()] = value.strip()
        return cookies

    def get_session_token(self):
        cookies = self.parse_cookies()
        return cookies.get('session', '')

    def get_user_name(self, params=None):
        global users_data
        users_data = load_users()
        session_token = self.get_session_token()
        if session_token:
            for username, info in users_data.items():
                if info.get('session_token') == session_token:
                    return username
        return ''

    def set_session_cookie(self, token=None, delete=False):
        if delete:
            self.send_header('Set-Cookie', 'session=; Max-Age=0; Path=/; SameSite=Lax')
        elif token:
            self.send_header('Set-Cookie', f'session={token}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax')

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        
        if path == "/favicon.ico":
            favicon_svg = b"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><circle cx=\"32\" cy=\"32\" r=\"24\" fill=\"#e62222\"/></svg>"
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(favicon_svg)
            return
        if path.startswith("/api/"):
            self.handle_api(path, parsed.query)
        else:
            super().do_GET()

    def handle_api(self, path, query_string):
        self.send_response(200)
        self.send_header("Content-type", "application/json")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.end_headers()
        
        params = urllib.parse.parse_qs(query_string)
        
        if path == "/api/recipes":
            q = params.get("q", [""])[0]
            if q:
                results = search_mgr.search(q) if hasattr(search_mgr, 'search') else recipes_data
            else:
                results = recipes_data
            self.wfile.write(json.dumps(results).encode("utf-8"))
            
        elif path == "/api/world_recipes":
            try:
                with open(WORLD_RECIPES_FILE, 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode("utf-8"))
            except Exception:
                self.wfile.write(b"[]")
                
        elif path == "/api/world_journey":
            try:
                with open(WORLD_JOURNEY_FILE, 'r', encoding='utf-8') as f:
                    journey = json.load(f)
            except Exception:
                journey = []
            owner = params.get("owner", [""])[0].strip()
            user = self.get_user_name(params)
            if owner == "all":
                visible_journey = journey
            elif owner:
                if owner == user:
                    visible_journey = [entry for entry in journey if str(entry.get("owner", "")).strip() == user]
                else:
                    visible_journey = [entry for entry in journey if str(entry.get("owner", "")).strip() == owner]
            else:
                if user:
                    visible_journey = [entry for entry in journey if str(entry.get("owner", "")).strip() == user]
                else:
                    visible_journey = [entry for entry in journey if not entry.get("owner")]
            self.wfile.write(json.dumps(visible_journey).encode("utf-8"))
        elif path == "/api/auth/status":
            user = self.get_user_name(params)
            self.wfile.write(json.dumps({"user": user}).encode("utf-8"))
        elif path == "/api/favorites":
            # return recipes favorited by the authenticated user only
            try:
                all_recipes = load_recipes(RECIPE_FILE)
            except Exception:
                all_recipes = []
            owner = (params.get("user", [""])[0] or "").strip() or self.get_user_name(params)
            if not owner:
                self.wfile.write(json.dumps([]).encode("utf-8"))
                return
            favs = [r for r in all_recipes if isinstance(r.get('favorited_by'), list) and owner in r.get('favorited_by')]
            self.wfile.write(json.dumps(favs).encode("utf-8"))
        
        elif path == "/api/collections":
            collections = collection_mgr.collection_names() if hasattr(collection_mgr, 'collection_names') else []
            self.wfile.write(json.dumps(collections).encode("utf-8"))
        elif path == "/api/groentenkalender":
            try:
                with open(BASE_DIR / "data" / "groentenkalender.json", "r", encoding="utf-8") as f:
                    self.wfile.write(f.read().encode("utf-8"))
            except Exception:
                self.wfile.write(json.dumps({"error": "Kan groentenkalender niet laden"}).encode("utf-8"))
        elif path == "/api/achievements":
            from logic.achievements import get_all_achievements, get_user_stats, ACHIEVEMENTS
            user = self.get_user_name(params)
            if not user:
                self.wfile.write(json.dumps({"error": "Not logged in"}).encode("utf-8"))
                return
            global users_data
            users_data = load_users()
            user_data = users_data.get(user, {})
            achievements = get_all_achievements(user_data)
            stats = get_user_stats(user_data)
            total_achievements = len(ACHIEVEMENTS)
            earned_count = len([a for a in achievements if a.get('earned')])
            self.wfile.write(json.dumps({
                "achievements": achievements,
                "stats": stats,
                "progress": {
                    "earned": earned_count,
                    "total": total_achievements,
                    "percentage": int((earned_count / total_achievements) * 100) if total_achievements > 0 else 0
                }
            }).encode("utf-8"))
        else:
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b''
        try:
            body = json.loads(post_data.decode('utf-8'))
        except Exception:
            body = {}

        global users_data, recipes_data, collection_mgr, search_mgr
        params = urllib.parse.parse_qs(parsed.query)
        user = self.get_user_name(params)
        recipes_data = load_recipes(RECIPE_FILE)
        if collection_mgr is None or search_mgr is None:
            collection_mgr = RecipeCollection(recipes_data)
            search_mgr = RecipeSearch(recipes_data)
        client_ip = self.client_address[0] if hasattr(self, 'client_address') else 'unknown'
        auth_paths = ("/api/auth", "/api/logout", "/api/delete_user")
        if path in auth_paths:
            auth_user = (body.get('username') or '').strip() or user
            ip_key = f"auth:ip:{client_ip}"
            user_key = f"auth:user:{auth_user}" if auth_user else None
            if is_rate_limited(ip_key, limit=10) or (user_key and is_rate_limited(user_key, limit=5)):
                self.send_response(429)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Te veel verzoeken, probeer het later opnieuw.'}).encode('utf-8'))
                return

        def send_json(status, payload, set_cookie=None, delete_cookie=False):
            self.send_response(status)
            self.send_header('Content-type', 'application/json')
            if delete_cookie:
                self.send_header('Set-Cookie', 'session=; Max-Age=0; Path=/; SameSite=Lax')
            elif set_cookie:
                self.send_header('Set-Cookie', f'session={set_cookie}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax')
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode('utf-8'))

        if path == "/api/auth":
            username = (body.get('username') or '').strip()
            password = (body.get('password') or '').strip()
            action = body.get('action') or 'login'
            if not username or not password:
                send_json(400, {'error': 'Username and password required'})
                return
            users_data = load_users()
            if action == 'register':
                if username in users_data:
                    send_json(400, {'error': 'User already exists'})
                    return
                from logic.achievements import check_and_award_achievements
                token = uuid.uuid4().hex
                users_data[username] = {
                    'password': hash_password(password),
                    'created': datetime.now().isoformat(),
                    'session_token': token
                }
                # Award account_created achievement
                check_and_award_achievements(users_data[username], 'account_created')
                save_users(users_data)
                send_json(200, {'status': 'registered', 'username': username}, set_cookie=token)
            else:
                if username not in users_data:
                    send_json(404, {'error': 'User not found'})
                    return
                if not verify_password(password, users_data[username].get('password', '')):
                    send_json(401, {'error': 'Invalid password'})
                    return
                token = uuid.uuid4().hex
                users_data[username]['session_token'] = token
                save_users(users_data)
                send_json(200, {'status': 'ok', 'username': username}, set_cookie=token)
            return

        if path == "/api/logout":
            if user and user in users_data:
                users_data = load_users()
                if users_data.get(user):
                    users_data[user].pop('session_token', None)
                    save_users(users_data)
            send_json(200, {'status': 'ok'}, delete_cookie=True)
            return

        if path == "/api/import":
            from logic.parser import extract_recipe_from_text
            text = body.get('text', '')
            recipe = extract_recipe_from_text(text)
            send_json(200, recipe)
            return

        if path == "/api/gc_images":
            # Garbage-collect local image files not referenced by any recipe.
            # POST JSON: { "confirm": true } to actually delete, or { "dry": true } for dry-run.
            # Authorization: requires logged-in user with users_data[user].is_admin == True
            # or an environment variable HTMEAL_ADMIN_TOKEN provided in request body as admin_token.
            import os
            user = self.get_user_name(params)
            admin_token_env = os.environ.get('HTMEAL_ADMIN_TOKEN')
            provided_token = body.get('admin_token')

            is_admin_user = False
            try:
                users_data = load_users()
                if user and users_data.get(user, {}).get('is_admin'):
                    is_admin_user = True
            except Exception:
                is_admin_user = False

            if not is_admin_user and admin_token_env:
                if not provided_token or provided_token != admin_token_env:
                    send_json(401, {'error': 'Not authorized - invalid admin token'})
                    return
            elif not is_admin_user and not admin_token_env:
                send_json(401, {'error': 'Not authorized - admin only'})
                return

            # collect referenced paths from recipes
            try:
                all_recipes = load_recipes(RECIPE_FILE)
            except Exception:
                all_recipes = []

            referenced = set()
            def add_if_local(val):
                if not val or not isinstance(val, str):
                    return
                s = val.strip()
                # only consider local asset paths (assets/, static/, or relative without http)
                if s.startswith('http://') or s.startswith('https://') or s.startswith('data:'):
                    return
                s = s.lstrip('/')
                referenced.add(os.path.normpath(s).replace('\\','/'))

            for r in all_recipes:
                add_if_local(r.get('image'))
                add_if_local(r.get('extra_image'))
                for k in ('images', 'extra_images'):
                    for v in (r.get(k) or []):
                        add_if_local(v)

            # target directories to scan
            targets = [BASE_DIR / 'assets' / 'img', BASE_DIR / 'static' / 'img']
            found_files = []
            for t in targets:
                try:
                    if not t.exists():
                        continue
                    for p in t.rglob('*'):
                        if p.is_file():
                            rel = os.path.relpath(p, BASE_DIR).replace('\\','/')
                            found_files.append((p, rel))
                except Exception:
                    continue

            orphans = []
            for p, rel in found_files:
                if rel not in referenced:
                    orphans.append({'path': rel, 'abs': str(p)})

            dry = bool(body.get('dry')) or (not bool(body.get('confirm')))
            deleted = []
            errors = []
            if not dry and orphans:
                for o in orphans:
                    try:
                        os.remove(o['abs'])
                        deleted.append(o['path'])
                    except Exception as e:
                        errors.append({'path': o['path'], 'error': str(e)})

            response = {
                'scanned_dirs': [str(t) for t in targets],
                'found_files_count': len(found_files),
                'referenced_count': len(referenced),
                'orphans_count': len(orphans),
                'orphans': orphans[:200],
                'deleted': deleted,
                'errors': errors,
                'dry_run': dry
            }
            send_json(200, response)
            return

        if path == "/api/world_journey":
            journey = load_json_file(WORLD_JOURNEY_FILE, WORLD_LOCK, default=[])
            if body.get('remove') and body.get('id'):
                existing_idx = next((i for i, e in enumerate(journey) if str(e.get('id')) == str(body.get('id'))), -1)
                if existing_idx < 0:
                    send_json(404, {'error': 'Entry not found'})
                    return
                existing = journey[existing_idx]
                if existing.get('owner') and existing.get('owner') != user:
                    send_json(401, {'error': 'Not authorized'})
                    return
                journey.pop(existing_idx)
                save_json_file(journey, WORLD_JOURNEY_FILE, WORLD_LOCK)
                send_json(200, {'status': 'removed'})
                return
            entry = body.get('entry')
            if entry:
                existing_idx = next((i for i, e in enumerate(journey) if str(e.get('id')) == str(entry.get('id'))), -1)
                is_new_entry = existing_idx < 0
                if existing_idx >= 0:
                    existing = journey[existing_idx]
                    if existing.get('owner') and existing.get('owner') != user:
                        send_json(401, {'error': 'Not authorized'})
                        return
                    entry['owner'] = existing.get('owner', user)
                    journey[existing_idx] = entry
                else:
                    entry['owner'] = user
                    journey.append(entry)
                save_json_file(journey, WORLD_JOURNEY_FILE, WORLD_LOCK)
                
                # Check achievements if new entry
                awarded_achievements = []
                if is_new_entry and user in users_data:
                    from logic.achievements import check_and_award_achievements
                    awarded_achievements = check_and_award_achievements(users_data[user], 'world_journey_entry')
                    save_users(users_data)
                
                response_data = {'status': 'success'}
                if awarded_achievements:
                    response_data['awarded_achievements'] = awarded_achievements
                send_json(200, response_data)
                return
            send_json(400, {'error': 'No entry provided'})
            return

        if path == "/api/recipe":
            if not user:
                send_json(401, {'error': 'Gebruikersnaam vereist'})
                return
            new_recipe = body.get('recipe')
            if not new_recipe:
                send_json(400, {'error': 'No recipe provided'})
                return
            if body.get('action') == 'delete':
                recipe_id = str(new_recipe.get('id', '')).strip()
                if not recipe_id:
                    send_json(400, {'error': 'Recipe id required'})
                    return
                existing = next((r for r in recipes_data if str(r.get('id')) == recipe_id), None)
                if existing is None:
                    send_json(404, {'error': 'Recipe not found'})
                    return
                if existing.get('owner') and existing.get('owner') != user:
                    send_json(401, {'error': 'Not authorized'})
                    return
                # remove the recipe and try to cleanup any local image files referenced
                removed = [r for r in recipes_data if str(r.get('id')) == recipe_id]
                recipes_data = [r for r in recipes_data if str(r.get('id')) != recipe_id]
                # attempt to remove file-based images referenced in the recipe
                try:
                    for r in removed:
                        for key in ('image', 'extra_image'):
                            val = r.get(key)
                            if val and isinstance(val, str) and val.startswith('/') or val.startswith('assets/') or val.startswith('static/'):
                                try:
                                    p = (BASE_DIR / val.lstrip('/'))
                                    if p.exists() and p.is_file():
                                        p.unlink()
                                except Exception:
                                    pass
                        # arrays of images
                        for arrk in ('images', 'extra_images'):
                            for val in (r.get(arrk) or []):
                                if val and isinstance(val, str) and (val.startswith('/') or val.startswith('assets/') or val.startswith('static/')):
                                    try:
                                        p = (BASE_DIR / val.lstrip('/'))
                                        if p.exists() and p.is_file():
                                            p.unlink()
                                    except Exception:
                                        pass
                except Exception:
                    pass
                save_recipes(recipes_data, RECIPE_FILE)
                collection_mgr = RecipeCollection(recipes_data)
                search_mgr = RecipeSearch(recipes_data)
                send_json(200, {'status': 'deleted', 'id': recipe_id})
                return
            if not new_recipe.get('id'):
                new_recipe['id'] = str(uuid.uuid4())
            existing_idx = next((i for i, r in enumerate(recipes_data) if r.get('id') == new_recipe.get('id')),-1)
            is_new_recipe = existing_idx < 0
            if existing_idx >= 0:
                existing = recipes_data[existing_idx]
                if existing.get('owner') and existing.get('owner') != user:
                    send_json(401, {'error': 'Not authorized'})
                    return
                new_recipe['owner'] = existing.get('owner', user)
                if 'favorited_by' not in new_recipe:
                    new_recipe['favorited_by'] = existing.get('favorited_by', [])
            else:
                new_recipe['owner'] = new_recipe.get('owner') or user
            owner_tag = str(new_recipe.get('owner', user)).strip()
            tags = [t for t in new_recipe.get('tags', []) if isinstance(t, str)]
            if owner_tag and not any(t.strip().lower() == owner_tag.lower() for t in tags):
                tags.append(owner_tag)
            new_recipe['tags'] = tags
            recipes_data[existing_idx] = new_recipe if existing_idx >= 0 else new_recipe
            if existing_idx < 0:
                recipes_data.append(new_recipe)
            save_recipes(recipes_data, RECIPE_FILE)
            collection_mgr = RecipeCollection(recipes_data)
            search_mgr = RecipeSearch(recipes_data)
            
            # Check achievements if new recipe
            awarded_achievements = []
            if is_new_recipe:
                from logic.achievements import check_and_award_achievements
                awarded_achievements = check_and_award_achievements(users_data[user], 'recipe_created')
                save_users(users_data)
            
            response_data = {'status': 'success', 'recipe': new_recipe}
            if awarded_achievements:
                response_data['awarded_achievements'] = awarded_achievements
            send_json(200, response_data)
            return

        if path == "/api/favorite":
            request_user = user or self.get_user_name(params)
            if not request_user:
                send_json(401, {'error': 'Gebruikersnaam vereist'})
                return
            recipe_id = body.get('recipeId') or body.get('id')
            action = body.get('action')
            if not recipe_id or action not in ('add', 'remove'):
                send_json(400, {'error': 'Invalid parameters'})
                return
            found = next((r for r in recipes_data if str(r.get('id')) == str(recipe_id)), None)
            if not found:
                send_json(404, {'error': 'Recipe not found'})
                return
            favs = found.get('favorited_by') or []
            if action == 'add':
                if request_user not in favs:
                    favs.append(request_user)
            else:
                favs = [u for u in favs if u != request_user]
            found['favorited_by'] = favs
            try:
                save_recipes(recipes_data, RECIPE_FILE)
            except Exception:
                pass
            
            # Check achievements if adding favorite
            awarded_achievements = []
            if action == 'add' and request_user in users_data:
                from logic.achievements import check_and_award_achievements
                awarded_achievements = check_and_award_achievements(users_data[request_user], 'recipe_favorited')
                save_users(users_data)
            
            response_data = {'status': 'ok', 'recipe': found}
            if awarded_achievements:
                response_data['awarded_achievements'] = awarded_achievements
            send_json(200, response_data)
            return

        if path == "/api/delete_user":
            target = body.get('user') or ''
            if not target:
                send_json(400, {'error': 'No user specified'})
                return
            if user != target:
                send_json(401, {'error': 'Not authorized to delete other users'})
                return
            users_data = load_users()
            if target in users_data:
                users_data.pop(target, None)
                save_users(users_data)
            for r in recipes_data:
                favs = r.get('favorited_by') or []
                if target in favs:
                    r['favorited_by'] = [u for u in favs if u != target]
                if r.get('owner') and str(r.get('owner')) == target:
                    r['owner'] = ''
            try:
                save_recipes(recipes_data, RECIPE_FILE)
            except Exception:
                pass
            journey = load_json_file(WORLD_JOURNEY_FILE, WORLD_LOCK, default=[])
            changed = False
            for e in journey:
                if e.get('owner') and str(e.get('owner')) == target:
                    e['owner'] = ''
                    changed = True
            if changed:
                try:
                    save_json_file(journey, WORLD_JOURNEY_FILE, WORLD_LOCK)
                except Exception:
                    pass
            collection_mgr = RecipeCollection(recipes_data)
            search_mgr = RecipeSearch(recipes_data)
            send_json(200, {'status': 'deleted', 'user': target}, delete_cookie=True)
            return

        send_json(404, {'error': 'Not found'})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)
        user = self.get_user_name(params)

        if path.startswith("/api/world_journey/"):
            entry_id = path[len("/api/world_journey/"):]
            journey = load_json_file(WORLD_JOURNEY_FILE, WORLD_LOCK, default=[])

            existing_idx = next((i for i, e in enumerate(journey) if str(e.get("id")) == entry_id), -1)
            if existing_idx < 0:
                self.send_response(404)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Entry not found"}).encode("utf-8"))
                return

            existing = journey[existing_idx]
            if existing.get("owner") and existing.get("owner") != user:
                self.send_response(401)
                self.send_header("Content-type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Not authorized"}).encode("utf-8"))
                return

            journey.pop(existing_idx)
            save_json_file(journey, WORLD_JOURNEY_FILE, WORLD_LOCK)

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "deleted"}).encode("utf-8"))
            return

        self.send_response(404)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))


def open_browser_in_chrome(url):
    try:
        subprocess.Popen(['cmd', '/c', 'start', '', 'chrome', url], shell=False)
    except Exception:
        try:
            webbrowser.open(url)
        except Exception:
            pass


def run_server(port=8000):
    handler = CookbookHandler
    try:
        server = ThreadingHTTPServer(("", port), handler)
    except Exception:
        server = HTTPServer(("", port), handler)
    url = f"http://localhost:{port}"
    print(f"Serving quiet cookbook at {url}")
    open_browser_in_chrome(url)
    server.serve_forever()

def main():
    global recipes_data, collection_mgr, search_mgr
    recipes_data = load_recipes(RECIPE_FILE)
    
    collection_mgr = RecipeCollection(recipes_data)
    search_mgr = RecipeSearch(recipes_data)

    print("Cookbook application initialized.")
    print(f"Loaded {len(recipes_data)} recipes.")
    
    run_server()

if __name__ == "__main__":
    main()
