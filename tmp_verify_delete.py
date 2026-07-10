import json
import urllib.request
from pathlib import Path

base = 'http://127.0.0.1:8123'
recipe = {
    'id': 'verify-delete-123',
    'title': 'Temporary delete test',
    'description': 'temp',
    'ingredients': ['x'],
    'instructions': ['y'],
    'owner': 'Tim',
    'favorited_by': ['Tim'],
    'notes': [{'text': 'note', 'author': 'Tim', 'created_at': 'now'}],
    'tags': ['temp']
}
req = urllib.request.Request(
    base + '/api/recipe',
    data=json.dumps({'recipe': recipe}).encode(),
    headers={'Content-Type': 'application/json', 'Cookie': 'session=17ce492332104b95974ef308b9f88ae5'},
    method='POST'
)
with urllib.request.urlopen(req) as r:
    print('created', json.loads(r.read().decode())['status'])

req = urllib.request.Request(
    base + '/api/recipe',
    data=json.dumps({'action': 'delete', 'recipe': recipe}).encode(),
    headers={'Content-Type': 'application/json', 'Cookie': 'session=17ce492332104b95974ef308b9f88ae5'},
    method='POST'
)
with urllib.request.urlopen(req) as r:
    print('deleted', json.loads(r.read().decode()))

recipes = json.loads(Path('data/recipes.json').read_text(encoding='utf-8'))
print('remaining', any(str(item.get('id')) == 'verify-delete-123' for item in recipes))
