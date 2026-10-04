import json
import unittest
from io import BytesIO
from unittest.mock import Mock, patch


class ApiFailureResponseTests(unittest.TestCase):
    def test_static_files_are_revalidated_after_deploys(self):
        import app

        handler = object.__new__(app.CookbookHandler)
        handler.path = "/scripts/main.js"
        send_header = Mock()

        with patch.object(app.SimpleHTTPRequestHandler, "end_headers") as finish_headers:
            handler.send_header = send_header
            handler.end_headers()

        send_header.assert_called_once_with(
            "Cache-Control", "no-cache, max-age=0, must-revalidate"
        )
        finish_headers.assert_called_once_with()

    def test_recipe_database_error_returns_json_503(self):
        import app

        handler = object.__new__(app.CookbookHandler)
        handler.wfile = BytesIO()

        with (
            patch.object(handler, "send_response") as send_response,
            patch.object(handler, "send_header"),
            patch.object(handler, "end_headers"),
            patch("app.get_all_recipes", side_effect=RuntimeError("database offline")),
            patch("app.logging.exception"),
        ):
            handler.handle_api("/api/recipes", "")

        self.assertEqual(send_response.call_args.args[0], 503)
        self.assertEqual(
            json.loads(handler.wfile.getvalue()),
            {"error": "Service temporarily unavailable"},
        )


class PasswordRecoveryTests(unittest.TestCase):
    def test_public_invite_code_is_not_a_reset_token(self):
        import app

        user = {
            'username': 'RecoveryUser',
            'password': app.hash_password('old-password'),
            'session_token': 'existing-session',
            'csrf_token': 'existing-csrf',
            'meta': {'invite_code': 'public-invite'},
        }
        old_hash = user['password']
        with patch.object(app, 'PASSWORD_RESET_TOKEN', 'server-reset-token'), \
             patch('app.get_user', return_value=user), patch('app.save_user') as save_user:
            result = app.reset_user_password('RecoveryUser', 'public-invite', 'new-password')

        self.assertIsNone(result)
        self.assertEqual(user['password'], old_hash)
        save_user.assert_not_called()

    def test_valid_reset_token_changes_password_and_rotates_sessions(self):
        import app

        user = {
            'username': 'RecoveryUser',
            'password': app.hash_password('old-password'),
            'session_token': 'existing-session',
            'csrf_token': 'existing-csrf',
            'meta': {},
        }
        with patch.object(app, 'PASSWORD_RESET_TOKEN', 'server-reset-token'), \
             patch('app.get_user', return_value=user), patch('app.save_user') as save_user:
            result = app.reset_user_password('RecoveryUser', 'server-reset-token', 'new-password')

        self.assertEqual(result['username'], 'RecoveryUser')
        self.assertTrue(app.verify_password('new-password', user['password']))
        self.assertNotEqual(result['session_token'], 'existing-session')
        self.assertEqual(user['session_token'], result['session_token'])
        self.assertIsNone(user['csrf_token'])
        save_user.assert_called_once_with(user)


if __name__ == "__main__":
    unittest.main()