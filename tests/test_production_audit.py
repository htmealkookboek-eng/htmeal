import http.cookiejar
import json
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE_URL = "http://localhost:8010"


class HTMealProductionAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.username = f"AuditUser{uuid.uuid4().hex[:8]}"
        cls.password = "AuditPass123!"
        cls.cj = http.cookiejar.CookieJar()
        cls.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cls.cj))
        cls._register_user(cls.username, cls.password)

    @classmethod
    def tearDownClass(cls):
        try:
            cls._delete_account(cls.username, cls.password)
        except Exception:
            pass

    def setUp(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        status, payload = self._request(
            "/api/auth",
            method="POST",
            data={"username": self.username, "password": self.password, "action": "login"},
            opener=self.opener,
        )
        self.assertEqual(status, 200, payload)

    def tearDown(self):
        try:
            self._request("/api/logout", method="POST", opener=self.opener)
        except Exception:
            pass

    @staticmethod
    def _request(path, method="GET", data=None, headers=None, opener=None):
        opener = opener or urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        body = None
        req_headers = dict(headers or {})
        if data is not None:
            if isinstance(data, (dict, list)):
                body = json.dumps(data).encode("utf-8")
                req_headers.setdefault("Content-Type", "application/json")
            else:
                body = data
        request = urllib.request.Request(f"{BASE_URL}{path}", data=body, headers=req_headers, method=method)
        try:
            with opener.open(request) as response:
                response_text = response.read().decode("utf-8")
                return response.status, json.loads(response_text) if response_text else {}
        except urllib.error.HTTPError as exc:
            body_text = exc.read().decode("utf-8")
            return exc.code, json.loads(body_text) if body_text else {}

    @classmethod
    def _register_user(cls, username, password):
        status, payload = cls._request(
            "/api/auth",
            method="POST",
            data={"username": username, "password": password, "action": "register"},
            opener=cls.opener,
        )
        if status != 200:
            raise AssertionError(f"Register failed: {payload}")

    @classmethod
    def _delete_account(cls, username, password):
        status, payload = cls._request(
            "/api/delete_user",
            method="POST",
            data={"user": username},
            opener=cls.opener,
        )
        if status != 200:
            return

    def test_auth_session_round_trip(self):
        status_status, status_payload = self._request("/api/auth/status", opener=self.opener)
        self.assertEqual(status_status, 200)
        self.assertEqual(status_payload.get("user"), self.username)

        logout_status, logout_payload = self._request("/api/logout", method="POST", opener=self.opener)
        self.assertEqual(logout_status, 200, logout_payload)

        status_after_logout_status, status_after_logout_payload = self._request("/api/auth/status", opener=self.opener)
        self.assertEqual(status_after_logout_status, 200)
        self.assertEqual(status_after_logout_payload.get("user"), "")

    def test_session_token_header_restores_identity(self):
        login_status, login_payload = self._request(
            "/api/auth",
            method="POST",
            data={"username": self.username, "password": self.password, "action": "login"},
            opener=self.opener,
        )
        self.assertEqual(login_status, 200, login_payload)
        session_token = login_payload.get("session_token")
        self.assertTrue(session_token, login_payload)

        restore_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        restore_status, restore_payload = self._request(
            "/api/auth/status",
            headers={"X-Session-Token": session_token},
            opener=restore_opener,
        )
        self.assertEqual(restore_status, 200, restore_payload)
        self.assertEqual(restore_payload.get("user"), self.username)

    def test_recipe_crud_persists_server_side(self):
        recipe_id = str(uuid.uuid4())
        recipe_payload = {
            "recipe": {
                "id": recipe_id,
                "title": f"Audit Recipe {uuid.uuid4().hex[:8]}",
                "description": "Persistent audit recipe",
                "owner": self.username,
                "source": "audit-test",
                "tags": ["audit"],
                "servings": 2,
                "cooking_time": 30,
                "ingredients": ["1 test ingredient"],
                "instructions": ["Run the audit test"],
                "image": "",
                "images": [],
                "notes": []
            }
        }

        save_status, save_payload = self._request(
            "/api/recipe",
            method="POST",
            data=recipe_payload,
            opener=self.opener,
        )
        self.assertEqual(save_status, 200, save_payload)

        recipes_status, recipes_payload = self._request("/api/recipes", opener=self.opener)
        self.assertEqual(recipes_status, 200)
        recipe_exists = any(str(item.get("id")) == recipe_id for item in recipes_payload)
        self.assertTrue(recipe_exists)

        updated_payload = {
            "recipe": {
                **recipe_payload["recipe"],
                "description": "Persistent audit recipe updated",
                "notes": [{"text": "Saved by audit test", "author": self.username, "timestamp": "2026-07-11T00:00:00Z"}]
            }
        }
        update_status, update_payload = self._request(
            "/api/recipe",
            method="POST",
            data=updated_payload,
            opener=self.opener,
        )
        self.assertEqual(update_status, 200, update_payload)

        delete_status, delete_payload = self._request(
            "/api/recipe",
            method="POST",
            data={"action": "delete", "recipe": recipe_payload["recipe"]},
            opener=self.opener,
        )
        self.assertEqual(delete_status, 200, delete_payload)

        recipes_after_delete_status, recipes_after_delete_payload = self._request("/api/recipes", opener=self.opener)
        self.assertEqual(recipes_after_delete_status, 200)
        recipe_still_exists = any(str(item.get("id")) == recipe_id for item in recipes_after_delete_payload)
        self.assertFalse(recipe_still_exists)

    def test_username_matching_is_case_insensitive_and_unique(self):
        base_username = f"CaseUser{uuid.uuid4().hex[:8]}"
        first_password = "CasePass123!"
        second_password = "CasePass456!"

        first_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        second_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

        first_status, first_payload = self._request(
            "/api/auth",
            method="POST",
            data={"username": base_username, "password": first_password, "action": "register"},
            opener=first_opener,
        )
        self.assertEqual(first_status, 200, first_payload)

        duplicate_status, duplicate_payload = self._request(
            "/api/auth",
            method="POST",
            data={"username": base_username.lower(), "password": second_password, "action": "register"},
            opener=second_opener,
        )
        self.assertEqual(duplicate_status, 400, duplicate_payload)

        login_status, login_payload = self._request(
            "/api/auth",
            method="POST",
            data={"username": base_username.upper(), "password": first_password, "action": "login"},
            opener=second_opener,
        )
        self.assertEqual(login_status, 200, login_payload)
        self.assertEqual(login_payload.get("username"), base_username)

    def test_any_authenticated_user_can_modify_any_recipe(self):
        attacker_user = f"AuditUserAttacker{uuid.uuid4().hex[:8]}"
        owner_user = f"AuditUserOwner{uuid.uuid4().hex[:8]}"
        owner_password = "OwnerPass123!"
        attacker_password = "AttackerPass123!"

        owner_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        attacker_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

        self._request(
            "/api/auth",
            method="POST",
            data={"username": owner_user, "password": owner_password, "action": "register"},
            opener=owner_opener,
        )
        self._request(
            "/api/auth",
            method="POST",
            data={"username": attacker_user, "password": attacker_password, "action": "register"},
            opener=attacker_opener,
        )

        recipe_id = str(uuid.uuid4())
        create_payload = {
            "recipe": {
                "id": recipe_id,
                "title": f"Owner Recipe {uuid.uuid4().hex[:8]}",
                "description": "Owner-owned record",
                "owner": owner_user,
                "source": "audit-test",
                "tags": ["owner"],
                "servings": 2,
                "cooking_time": 20,
                "ingredients": ["1 owner ingredient"],
                "instructions": ["Owned by owner user"],
                "image": "",
                "images": [],
                "notes": []
            }
        }
        save_status, save_payload = self._request(
            "/api/recipe",
            method="POST",
            data=create_payload,
            opener=owner_opener,
        )
        self.assertEqual(save_status, 200, save_payload)

        forged_payload = {
            "recipe": {
                **create_payload["recipe"],
                "title": "Attacker modified owner recipe"
            }
        }
        attack_status, attack_payload = self._request(
            "/api/recipe",
            method="POST",
            data=forged_payload,
            opener=attacker_opener,
        )
        self.assertEqual(attack_status, 200, attack_payload)

        delete_status, delete_payload = self._request(
            "/api/recipe",
            method="POST",
            data={"action": "delete", "recipe": create_payload["recipe"]},
            opener=attacker_opener,
        )
        self.assertEqual(delete_status, 200, delete_payload)

        self._request(
            "/api/delete_user",
            method="POST",
            data={"user": owner_user},
            opener=owner_opener,
        )
        self._request(
            "/api/delete_user",
            method="POST",
            data={"user": attacker_user},
            opener=attacker_opener,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
