import json
import os
import pathlib
import sqlite3
import uuid
from datetime import datetime
import re

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    psycopg2_err = None
except ImportError as e:
    psycopg2 = None
    psycopg2_err = str(e)

BASE_DIR = pathlib.Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "cookbook.db"
RECIPES_JSON = BASE_DIR / "data" / "recipes.json"
USERS_JSON = BASE_DIR / "data" / "users.json"
WORLD_JOURNEY_JSON = BASE_DIR / "data" / "world_journey.json"
DB_URL = os.environ.get("DATABASE_URL")

ALLOWED_IMAGE_MIME = {'image/jpeg', 'image/jpg', 'image/png', 'image/webp'}

def get_connection():
    if DB_URL:
        if not psycopg2:
            raise RuntimeError(f"psycopg2-binary is not installed but DATABASE_URL is set. Import Error: {psycopg2_err}")
        conn = psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)
        return conn
    else:
        os.makedirs(DB_PATH.parent, exist_ok=True)
        conn = sqlite3.connect(str(DB_PATH), timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

def execute_query(conn, query, params=None):
    if params is None:
        params = ()
        
    is_pg = bool(DB_URL)
    
    if is_pg:
        query = query.replace('?', '%s')
        
        # Replace :name with %(name)s using regex but safely
        def replace_named_param(match):
            return '%(' + match.group(1) + ')s'
        query = re.sub(r':([a-zA-Z_]\w*)', replace_named_param, query)
        
        if 'INSERT OR REPLACE INTO users' in query:
            query = query.replace('INSERT OR REPLACE INTO users', 'INSERT INTO users')
            query += " ON CONFLICT (username) DO UPDATE SET password=EXCLUDED.password, session_token=EXCLUDED.session_token, csrf_token=EXCLUDED.csrf_token, created_at=EXCLUDED.created_at, is_admin=EXCLUDED.is_admin, meta=EXCLUDED.meta"
        elif 'INSERT OR REPLACE INTO recipes' in query:
            query = query.replace('INSERT OR REPLACE INTO recipes', 'INSERT INTO recipes')
            query += " ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description, source=EXCLUDED.source, owner=EXCLUDED.owner, image=EXCLUDED.image, extra_image=EXCLUDED.extra_image, images=EXCLUDED.images, extra_images=EXCLUDED.extra_images, tags=EXCLUDED.tags, ingredients=EXCLUDED.ingredients, instructions=EXCLUDED.instructions, notes=EXCLUDED.notes, favorited_by=EXCLUDED.favorited_by, servings=EXCLUDED.servings, cooking_time=EXCLUDED.cooking_time, created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at, meta=EXCLUDED.meta"
        elif 'INSERT OR REPLACE INTO world_journey' in query:
            query = query.replace('INSERT OR REPLACE INTO world_journey', 'INSERT INTO world_journey')
            query += " ON CONFLICT (id) DO UPDATE SET owner=EXCLUDED.owner, data=EXCLUDED.data, created_at=EXCLUDED.created_at, updated_at=EXCLUDED.updated_at"
                
    cur = conn.cursor()
    cur.execute(query, params)
    return cur

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
    conn = get_connection()
    with conn:
        execute_query(conn,
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
        execute_query(conn,
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
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner)")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title)")
        execute_query(conn, "CREATE INDEX IF NOT EXISTS idx_recipes_tags ON recipes(tags)")
        execute_query(conn,
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

def _row_to_dict(row):
    if row is None:
        return None
    return dict(row)

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
    with conn:
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
    conn.close()

def ensure_db():
    if not DB_PATH.exists() and not DB_URL:
        migrate_from_json()
    else:
        init_db()

def get_all_recipes():
    conn = get_connection()
    cur = execute_query(conn, "SELECT * FROM recipes")
    rows = [ _recipe_from_row(row) for row in cur.fetchall() ]
    conn.close()
    return rows

def get_recipe(recipe_id):
    conn = get_connection()
    cur = execute_query(conn, "SELECT * FROM recipes WHERE id = ?", (str(recipe_id),))
    row = cur.fetchone()
    recipe = _recipe_from_row(row) if row else None
    conn.close()
    return recipe

def search_recipes(query):
    query_text = f"%{query.lower()}%"
    conn = get_connection()
    cur = execute_query(conn, 
        "SELECT * FROM recipes WHERE lower(title) LIKE ? OR lower(description) LIKE ? OR lower(source) LIKE ? OR lower(tags) LIKE ? OR lower(ingredients) LIKE ? OR lower(instructions) LIKE ?",
        (query_text, query_text, query_text, query_text, query_text, query_text)
    )
    rows = [ _recipe_from_row(row) for row in cur.fetchall() ]
    conn.close()
    return rows

def get_favorites(owner):
    conn = get_connection()
    pattern = f"%\"{owner}\"%"
    cur = execute_query(conn, "SELECT * FROM recipes WHERE favorited_by LIKE ?", (pattern,))
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
    conn = connection or get_connection()
    with conn:
        execute_query(conn, 
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
    conn = connection or get_connection()
    with conn:
        execute_query(conn, "DELETE FROM recipes WHERE id = ?", (str(recipe_id),))
    if connection is None:
        conn.close()
    return True

def get_user(username):
    conn = get_connection()
    cur = execute_query(conn, "SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    user = _user_from_row(row) if row else None
    conn.close()
    return user

def get_all_users():
    conn = get_connection()
    cur = execute_query(conn, "SELECT * FROM users")
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
    conn = connection or get_connection()
    with conn:
        execute_query(conn, 
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
    conn = connection or get_connection()
    with conn:
        execute_query(conn, "DELETE FROM users WHERE username = ?", (username,))
    if connection is None:
        conn.close()
    return True

def get_journey_entries(owner=None, all_entries=False):
    conn = get_connection()
    if all_entries:
        cur = execute_query(conn, "SELECT * FROM world_journey")
    elif owner is None:
        cur = execute_query(conn, "SELECT * FROM world_journey WHERE owner = '' OR owner IS NULL")
    else:
        cur = execute_query(conn, "SELECT * FROM world_journey WHERE owner = ?", (owner,))
    entries = [ _journey_from_row(row) for row in cur.fetchall() ]
    conn.close()
    return entries

def get_journey_entry(entry_id):
    conn = get_connection()
    cur = execute_query(conn, "SELECT * FROM world_journey WHERE id = ?", (str(entry_id),))
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
    conn = connection or get_connection()
    with conn:
        execute_query(conn, 
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
    conn = connection or get_connection()
    with conn:
        execute_query(conn, "DELETE FROM world_journey WHERE id = ?", (str(entry_id),))
    if connection is None:
        conn.close()
    return True
