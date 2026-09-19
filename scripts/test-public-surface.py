import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("public_surface", Path(__file__).with_name("check-public-surface.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicSurfaceTest(unittest.TestCase):
    def test_allows_public_web_and_ticket_paths(self):
        self.assertTrue(module.allowed_path("web/src/features/tickets/index.tsx"))
        self.assertTrue(module.allowed_path("controller/ticket.go"))
        self.assertTrue(module.allowed_path("service/storage_object_store.go"))

    def test_rejects_files_outside_the_public_scope(self):
        self.assertFalse(module.allowed_path("controller/internal_extension.go"))
        self.assertFalse(module.allowed_path("service/product_extension.go"))
        self.assertFalse(module.allowed_path("extensions/secret.ts"))

    def test_allows_only_ticket_specific_new_api_paths(self):
        self.assertTrue(module.allowed_new_api("/api/tickets"))
        self.assertTrue(module.allowed_new_api("/api/admin/tickets/42"))
        self.assertTrue(module.allowed_new_api("/api/admin/ticket/settings/"))
        self.assertFalse(module.allowed_new_api("/api/internal/metrics"))


if __name__ == "__main__":
    unittest.main()
