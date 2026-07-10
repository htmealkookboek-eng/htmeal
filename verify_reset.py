import json
import pathlib

for path in [pathlib.Path('data/recipes.json'), pathlib.Path('backup/data/recipes.json')]:
    data = json.loads(path.read_text(encoding='utf-8'))
    nonempty = sum(1 for r in data if isinstance(r, dict) and isinstance(r.get('favorited_by'), list) and r.get('favorited_by'))
    print(f'{path}: nonempty_favorites={nonempty}')

for path in [pathlib.Path('data/users.json'), pathlib.Path('backup/data/users.json')]:
    data = json.loads(path.read_text(encoding='utf-8'))
    for name, user in data.items():
        if isinstance(user, dict):
            stats = user.get('stats', {})
            achievements = user.get('achievements', {})
            print(f'{path}: {name} favorites_count={stats.get("favorites_count")}, favorite_lover={"favorite_lover" in achievements}, favorite_collector={"favorite_collector" in achievements}')
