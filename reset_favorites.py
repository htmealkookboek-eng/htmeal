import json
from pathlib import Path

files = [Path('data/recipes.json'), Path('backup/data/recipes.json')]
for path in files:
    if not path.exists():
        continue
    data = json.loads(path.read_text(encoding='utf-8'))
    for recipe in data:
        if isinstance(recipe, dict):
            if isinstance(recipe.get('favorited_by'), list):
                recipe['favorited_by'] = []
            recipe.pop('notes', None)
            recipe.pop('note', None)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

user_files = [Path('data/users.json'), Path('backup/data/users.json')]
for path in user_files:
    if not path.exists():
        continue
    data = json.loads(path.read_text(encoding='utf-8'))
    for user in data.values():
        if isinstance(user, dict):
            achievements = user.get('achievements')
            if isinstance(achievements, dict):
                achievements.pop('favorite_lover', None)
                achievements.pop('favorite_collector', None)
            stats = user.get('stats')
            if isinstance(stats, dict):
                stats['favorites_count'] = 0
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
