import json
import os
import pathlib
import sqlite3
import uuid
from datetime import datetime

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None

BASE_DIR = pathlib.Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "cookbook.db"
RECIPES_JSON = BASE_DIR / "data" / "recipes.json"
USERS_JSON = BASE_DIR / "data" / "users.json"
WORLD_JOURNEY_JSON = BASE_DIR / "data" / "world_journey.json"

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase_client = None
supabase_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
if SUPABASE_URL and supabase_key:
    if not create_client:
        raise RuntimeError("supabase package is not installed but SUPABASE_URL is set")
    supabase_client = create_client(SUPABASE_URL, supabase_key)

ALLOWED_IMAGE_MIME = {'image/jpeg', 'image/jpg', 'image/png', 'image/webp'}

def get_connection():
    if supabase_client:
        return None
    os.makedirs(DB_PATH.parent, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def _to_json(value):
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)

def _from_json(value, default):
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default

def init_db():
    if supabase_client:
        # Supabase tables should be created via dashboard or migrations, 
        # but we don't need to do it here.
        return
        
    conn = get_connection()
    with conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                session_token TEXT,
                csrf_token TEXT,
                created_at TEXT,
                is_admin INTEGER DEFAULT 0,
                meta TEXT
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS recipes (
                id TEXT PRIMARY KEY,
                title TEXT,
                description TEXT,
                source TEXT,
                owner TEXT,
                image TEXT,
                extra_image TEXT,
                images TEXT,
                extra_images TEXT,
                tags TEXT,
                ingredients TEXT,
                instructions TEXT,
                notes TEXT,
                favorited_by TEXT,
                servings INTEGER,
                cooking_time TEXT,
                created_at TEXT,
                updated_at TEXT,
                meta TEXT
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recipes_tags ON recipes(tags)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS world_journey (
                id TEXT PRIMARY KEY,
                owner TEXT,
                data TEXT,
                created_at TEXT,
                updated_at TEXT
            )
            """
        )
    conn.close()

def _recipe_from_row(row):
    if row is None:
        return None
    recipe = dict(row)
    recipe['images'] = _from_json(recipe.get('images'), [])
    recipe['extra_images'] = _from_json(recipe.get('extra_images'), [])
    recipe['tags'] = _from_json(recipe.get('tags'), [])
    recipe['ingredients'] = _from_json(recipe.get('ingredients'), [])
    recipe['instructions'] = _from_json(recipe.get('instructions'), [])
    recipe['notes'] = _from_json(recipe.get('notes'), [])
    recipe['favorited_by'] = _from_json(recipe.get('favorited_by'), [])
    recipe['meta'] = _from_json(recipe.get('meta'), {})
    return recipe

def _user_from_row(row):
    if row is None:
        return None
    user = dict(row)
    user['is_admin'] = bool(user.get('is_admin'))
    user['meta'] = _from_json(user.get('meta'), {})
    return user

def _journey_from_row(row):
    if row is None:
        return None
    journey = dict(row)
    journey['data'] = _from_json(journey.get('data'), {})
    return journey

def migrate_from_json():
    init_db()
    conn = get_connection()
    if RECIPES_JSON.exists():
        try:
            with open(RECIPES_JSON, 'r', encoding='utf-8') as f:
                recipes = json.load(f)
            for recipe in recipes:
                save_recipe(recipe, connection=conn)
        except Exception:
            pass
    if USERS_JSON.exists():
        try:
            with open(USERS_JSON, 'r', encoding='utf-8') as f:
                users = json.load(f)
            for username, user in (users or {}).items():
                save_user({
                    'username': username,
                    'password': user.get('password', ''),
                    'session_token': user.get('session_token'),
                    'csrf_token': user.get('csrf_token'),
                    'created_at': user.get('created'),
                    'is_admin': int(bool(user.get('is_admin'))),
                    'meta': {k: v for k, v in user.items() if k not in ('password', 'session_token', 'csrf_token', 'created', 'is_admin')}
                }, connection=conn)
        except Exception:
            pass
    if WORLD_JOURNEY_JSON.exists():
        try:
            with open(WORLD_JOURNEY_JSON, 'r', encoding='utf-8') as f:
                journey = json.load(f)
            for entry in journey:
                save_journey_entry(entry, connection=conn)
        except Exception:
            pass
    if conn:
        conn.close()

def ensure_db():
    if supabase_client:
        try:
            remote_users = get_all_users()
            remote_recipes = get_all_recipes()
            remote_journey = get_journey_entries()
            if not remote_users and not remote_recipes and not remote_journey:
                migrate_from_json()
        except Exception:
            pass
        return

    if not DB_PATH.exists():
        migrate_from_json()
    else:
        init_db()

def get_all_recipes():
    if supabase_client:
        res = supabase_client.table('recipes').select('*').execute()
        return [_recipe_from_row(row) for row in res.data]

    conn = get_connection()
    cur = conn.execute("SELECT * FROM recipes")
    rows = [ _recipe_from_row(row) for row in cur.fetchall() ]
    conn.close()
    return rows

def get_recipe(recipe_id):
    if supabase_client:
        res = supabase_client.table('recipes').select('*').eq('id', str(recipe_id)).execute()
        return _recipe_from_row(res.data[0]) if res.data else None

    conn = get_connection()
    cur = conn.execute("SELECT * FROM recipes WHERE id = ?", (str(recipe_id),))
    row = cur.fetchone()
    recipe = _recipe_from_row(row) if row else None
    conn.close()
    return recipe

def search_recipes(query):
    query_text = f"%{query.lower()}%"
    if supabase_client:
        or_filter = f"title.ilike.{query_text},description.ilike.{query_text},source.ilike.{query_text},tags.ilike.{query_text},ingredients.ilike.{query_text},instructions.ilike.{query_text}"
        res = supabase_client.table('recipes').select('*').or_(or_filter).execute()
        return [_recipe_from_row(row) for row in res.data]

    conn = get_connection()
    cur = conn.execute(
        "SELECT * FROM recipes WHERE lower(title) LIKE ? OR lower(description) LIKE ? OR lower(source) LIKE ? OR lower(tags) LIKE ? OR lower(ingredients) LIKE ? OR lower(instructions) LIKE ?",
        (query_text, query_text, query_text, query_text, query_text, query_text)
    )
    rows = [ _recipe_from_row(row) for row in cur.fetchall() ]
    conn.close()
    return rows

def get_favorites(owner):
    pattern = f"%\"{owner}\"%"
    if supabase_client:
        res = supabase_client.table('recipes').select('*').like('favorited_by', pattern).execute()
        return [_recipe_from_row(row) for row in res.data]

    conn = get_connection()
    cur = conn.execute("SELECT * FROM recipes WHERE favorited_by LIKE ?", (pattern,))
    rows = [ _recipe_from_row(row) for row in cur.fetchall() ]
    conn.close()
    return rows

def save_recipe(recipe, connection=None):
    now = datetime.utcnow().isoformat()
    data = {
        'id': str(recipe.get('id') or uuid.uuid4()),
        'title': recipe.get('title', ''),
        'description': recipe.get('description', ''),
        'source': recipe.get('source', ''),
        'owner': recipe.get('owner', ''),
        'image': recipe.get('image', ''),
        'extra_image': recipe.get('extra_image', ''),
        'images': _to_json(recipe.get('images', [])),
        'extra_images': _to_json(recipe.get('extra_images', [])),
        'tags': _to_json(recipe.get('tags', [])),
        'ingredients': _to_json(recipe.get('ingredients', [])),
        'instructions': _to_json(recipe.get('instructions', [])),
        'notes': _to_json(recipe.get('notes', [])),
        'favorited_by': _to_json(recipe.get('favorited_by', [])),
        'servings': int(recipe.get('servings') or 0),
        'cooking_time': str(recipe.get('cooking_time') or ''),
        'created_at': recipe.get('created_at') or now,
        'updated_at': now,
        'meta': _to_json(recipe.get('meta', {}))
    }
    
    if supabase_client:
        res = supabase_client.table('recipes').upsert(data).execute()
        return _recipe_from_row(res.data[0]) if res.data else None

    conn = connection or get_connection()
    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO recipes (
                id, title, description, source, owner, image, extra_image,
                images, extra_images, tags, ingredients, instructions, notes,
                favorited_by, servings, cooking_time, created_at, updated_at, meta
            ) VALUES (
                :id, :title, :description, :source, :owner, :image, :extra_image,
                :images, :extra_images, :tags, :ingredients, :instructions, :notes,
                :favorited_by, :servings, :cooking_time, :created_at, :updated_at, :meta
            )
            """,
            data
        )
    if connection is None:
        conn.close()
    return get_recipe(data['id'])

def delete_recipe(recipe_id, connection=None):
    if supabase_client:
        supabase_client.table('recipes').delete().eq('id', str(recipe_id)).execute()
        return True

    conn = connection or get_connection()
    with conn:
        conn.execute("DELETE FROM recipes WHERE id = ?", (str(recipe_id),))
    if connection is None:
        conn.close()
    return True

def get_user(username):
    if supabase_client:
        res = supabase_client.table('users').select('*').eq('username', str(username)).execute()
        return _user_from_row(res.data[0]) if res.data else None

    conn = get_connection()
    cur = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    user = _user_from_row(row) if row else None
    conn.close()
    return user

def get_all_users():
    if supabase_client:
        res = supabase_client.table('users').select('*').execute()
        return { row['username']: _user_from_row(row) for row in res.data }

    conn = get_connection()
    cur = conn.execute("SELECT * FROM users")
    rows = cur.fetchall()
    users = { row['username']: _user_from_row(row) for row in rows }
    conn.close()
    return users

def save_user(user, connection=None):
    data = {
        'username': user['username'],
        'password': user.get('password', ''),
        'session_token': user.get('session_token'),
        'csrf_token': user.get('csrf_token'),
        'created_at': user.get('created_at') or datetime.utcnow().isoformat(),
        'is_admin': int(bool(user.get('is_admin'))),
        'meta': _to_json(user.get('meta', {}))
    }
    
    if supabase_client:
        res = supabase_client.table('users').upsert(data).execute()
        return get_user(data['username'])

    conn = connection or get_connection()
    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO users (
                username, password, session_token, csrf_token, created_at, is_admin, meta
            ) VALUES (
                :username, :password, :session_token, :csrf_token, :created_at, :is_admin, :meta
            )
            """,
            data
        )
    if connection is None:
        conn.close()
    return get_user(data['username'])

def delete_user(username, connection=None):
    if supabase_client:
        supabase_client.table('users').delete().eq('username', str(username)).execute()
        return True

    conn = connection or get_connection()
    with conn:
        conn.execute("DELETE FROM users WHERE username = ?", (username,))
    if connection is None:
        conn.close()
    return True

def get_journey_entries(owner=None, all_entries=False):
    if supabase_client:
        if all_entries:
            res = supabase_client.table('world_journey').select('*').execute()
        elif owner is None:
            res = supabase_client.table('world_journey').select('*').is_('owner', 'null').execute()
            # Also fetch owner = ''
            res2 = supabase_client.table('world_journey').select('*').eq('owner', '').execute()
            res.data.extend(res2.data)
        else:
            res = supabase_client.table('world_journey').select('*').eq('owner', str(owner)).execute()
        return [_journey_from_row(row) for row in res.data]

    conn = get_connection()
    if all_entries:
        cur = conn.execute("SELECT * FROM world_journey")
    elif owner is None:
        cur = conn.execute("SELECT * FROM world_journey WHERE owner = '' OR owner IS NULL")
    else:
        cur = conn.execute("SELECT * FROM world_journey WHERE owner = ?", (owner,))
    entries = [ _journey_from_row(row) for row in cur.fetchall() ]
    conn.close()
    return entries

def get_journey_entry(entry_id):
    if supabase_client:
        res = supabase_client.table('world_journey').select('*').eq('id', str(entry_id)).execute()
        return _journey_from_row(res.data[0]) if res.data else None

    conn = get_connection()
    cur = conn.execute("SELECT * FROM world_journey WHERE id = ?", (str(entry_id),))
    row = cur.fetchone()
    entry = _journey_from_row(row) if row else None
    conn.close()
    return entry

def save_journey_entry(entry, connection=None):
    now = datetime.utcnow().isoformat()
    data = {
        'id': str(entry.get('id') or uuid.uuid4()),
        'owner': entry.get('owner', ''),
        'data': _to_json(entry),
        'created_at': entry.get('created_at') or now,
        'updated_at': now
    }
    
    if supabase_client:
        res = supabase_client.table('world_journey').upsert(data).execute()
        return get_journey_entry(data['id'])

    conn = connection or get_connection()
    with conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO world_journey (
                id, owner, data, created_at, updated_at
            ) VALUES (
                :id, :owner, :data, :created_at, :updated_at
            )
            """,
            data
        )
    if connection is None:
        conn.close()
    return get_journey_entry(data['id'])

def delete_journey_entry(entry_id, connection=None):
    if supabase_client:
        supabase_client.table('world_journey').delete().eq('id', str(entry_id)).execute()
        return True

    conn = connection or get_connection()
    with conn:
        conn.execute("DELETE FROM world_journey WHERE id = ?", (str(entry_id),))
    if connection is None:
        conn.close()
    return True
