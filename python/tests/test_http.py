"""The real urllib transport, against a local HTTP server (no network)."""
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from uverify import UVerify, UVerifyError  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get("authorization") != "Bearer uvk_test_local":
            return self._send(401, {"success": False, "error": {"code": "invalid_api_key", "message": "Bad key"}, "request_id": "req_401"})
        self._send(200, {"success": True, "data": {"balance": 1234.5, "currency": "NGN"}, "request_id": "req_ok"})

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        if body.get("id_number") == "bad":
            return self._send(400, {"success": False, "error": {"code": "validation_error", "message": "Invalid", "details": ["id_number must be the 11-digit NIN"]}, "request_id": "req_400"})
        self._send(200, {"success": True, "data": {"id": "v1", "status": "verified", "echo": body}, "request_id": "req_ok"})


class RealHttp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}/v1"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_get_and_post(self):
        u = UVerify("uvk_test_local", base_url=self.base)
        self.assertEqual(u.account.balance()["balance"], 1234.5)
        v = u.identity.nin(id_number="12345678901")
        self.assertEqual(v["status"], "verified")
        self.assertTrue(v["echo"]["reference"].startswith("sdk_"))

    def test_error_bodies_are_read(self):
        with self.assertRaises(UVerifyError) as cm:
            UVerify("uvk_test_local", base_url=self.base).identity.nin(id_number="bad")
        self.assertEqual((cm.exception.code, cm.exception.status, cm.exception.request_id), ("validation_error", 400, "req_400"))
        with self.assertRaises(UVerifyError) as cm:
            UVerify("uvk_test_wrong", base_url=self.base).account.balance()
        self.assertEqual(cm.exception.code, "invalid_api_key")


if __name__ == "__main__":
    unittest.main()
