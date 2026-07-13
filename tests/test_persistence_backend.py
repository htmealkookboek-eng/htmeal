import importlib
import os
import unittest
from unittest.mock import patch


class PersistenceBackendSelectionTests(unittest.TestCase):
    def test_render_mode_must_not_silently_fallback_to_local_sqlite(self):
        import database

        with patch.dict(os.environ, {
            'RENDER': 'true',
            'SUPABASE_URL': '',
            'SUPABASE_KEY': '',
            'SUPABASE_SERVICE_ROLE_KEY': '',
        }, clear=False):
            importlib.reload(database)
            with self.assertRaises(RuntimeError):
                database.ensure_db()


if __name__ == '__main__':
    unittest.main()
