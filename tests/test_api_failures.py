import json
import unittest
from io import BytesIO
from unittest.mock import patch


class ApiFailureResponseTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()