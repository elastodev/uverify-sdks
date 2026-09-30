"""The real API, in sandbox (free). Runs only with UVERIFY_TEST_KEY=uvk_test_... set."""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from uverify import UVerify, UVerifyError  # noqa: E402

KEY = os.environ.get("UVERIFY_TEST_KEY", "")
JPEG = bytes.fromhex("ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001400010000000000000000000000000000000affc40014100100000000000000000000000000000000ffda0008010100003f002a9fffd9")


@unittest.skipUnless(KEY.startswith("uvk_test_"), "set UVERIFY_TEST_KEY to run against the sandbox")
class Sandbox(unittest.TestCase):
    def setUp(self):
        self.u = UVerify(KEY, base_url=os.environ.get("UVERIFY_BASE_URL"))

    def test_nin(self):
        self.assertEqual(self.u.identity.nin(id_number="12345678942")["status"], "verified")
        self.assertEqual(self.u.identity.nin(id_number="12345678900")["status"], "not_found")

    def test_liveness_face_match(self):
        s = self.u.liveness.create_session()
        self.u.liveness.simulate(s["id"], outcome="passed")
        v = self.u.identity.nin_face_match(id_number="12345678942", liveness_session_id=s["id"])
        self.assertEqual((v["face_match"]["status"], v["face_match"]["liveness"]), ("matched", "passed"))

    def test_the_rest(self):
        self.assertEqual(self.u.documents.verify(front_image=JPEG, document_type="nin_card")["status"], "verified")
        self.assertEqual(self.u.aml.screen(name="Adaeze Okafor")["status"], "clear")
        link = self.u.kyc.create_link(customer_name="SDK Test")
        self.assertEqual(self.u.kyc.get_link(link["id"])["status"], "pending")
        self.assertIsInstance(self.u.account.balance()["balance"], (int, float))

    def test_validation_error(self):
        with self.assertRaises(UVerifyError) as cm:
            self.u.identity.nin(id_number="abc")
        self.assertEqual(cm.exception.code, "validation_error")


if __name__ == "__main__":
    unittest.main()
