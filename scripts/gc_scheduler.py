import argparse
import logging
from datetime import datetime
from database import ensure_db, get_all_recipes
import os
import pathlib

BASE_DIR = pathlib.Path(__file__).resolve().parent.parent
BACKUP_DIR = BASE_DIR / 'backup' / 'gc'
ASSET_DIRS = [BASE_DIR / 'assets' / 'img', BASE_DIR / 'static' / 'img']

logging.basicConfig(
    format='%(asctime)s %(levelname)s %(message)s',
    level=logging.INFO
)


def scan_referenced_images(recipes):
    referenced = set()
    def add_path(value):
        if not value or not isinstance(value, str):
            return
        if value.startswith('http://') or value.startswith('https://') or value.startswith('data:'):
            return
        normalized = pathlib.Path(value.lstrip('/')).resolve()
        try:
            if BASE_DIR in normalized.parents or normalized == BASE_DIR:
                referenced.add(str(normalized))
        except Exception:
            pass

    for recipe in recipes:
        add_path(recipe.get('image'))
        add_path(recipe.get('extra_image'))
        for field in ('images', 'extra_images'):
            for value in (recipe.get(field) or []):
                add_path(value)
    return referenced


def collect_files():
    files = []
    for root in ASSET_DIRS:
        if root.exists():
            for path in root.rglob('*'):
                if path.is_file():
                    files.append(path.resolve())
    return files


def backup_and_remove(path):
    relative = path.relative_to(BASE_DIR)
    backup_path = BACKUP_DIR / relative
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if backup_path.exists():
            backup_path.unlink()
        backup_path.write_bytes(path.read_bytes())
        path.unlink()
        return True, str(backup_path)
    except Exception as exc:
        return False, str(exc)


def run_gc(dry_run=True, retention_days=30):
    ensure_db()
    recipes = get_all_recipes()
    referenced = scan_referenced_images(recipes)
    files = collect_files()

    orphaned = [f for f in files if str(f) not in referenced]
    logging.info('Scanned %d asset files, found %d orphaned images', len(files), len(orphaned))

    deleted = []
    errors = []
    if not dry_run:
        for orphan in orphaned:
            success, info = backup_and_remove(orphan)
            if success:
                deleted.append({'path': str(orphan), 'backup': info})
                logging.info('Removed orphaned image %s -> %s', orphan, info)
            else:
                errors.append({'path': str(orphan), 'error': info})
                logging.error('Failed to remove orphaned image %s: %s', orphan, info)

    return {
        'dry_run': dry_run,
        'scanned_files': len(files),
        'orphaned_count': len(orphaned),
        'deleted': deleted,
        'errors': errors,
        'reference_count': len(referenced)
    }


def main():
    parser = argparse.ArgumentParser(description='Run file GC for recipe images.')
    parser.add_argument('--delete', action='store_true', help='Delete orphaned images after backing them up.')
    parser.add_argument('--retention-days', type=int, default=30, help='Retention days for backup files')
    parser.add_argument('--dry', action='store_true', help='Only scan and report without deleting.')
    args = parser.parse_args()

    result = run_gc(dry_run=not args.delete, retention_days=args.retention_days)
    logging.info('GC result: %s', result)
    print(result)

if __name__ == '__main__':
    main()
