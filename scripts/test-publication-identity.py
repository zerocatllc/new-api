"""Regression checks for public author, committer, trailer and tag privacy."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

GUARD = Path(__file__).with_name("check-publication-identity.py")


class PublicationIdentityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="publication-identity-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        self.env.update(GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1")
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "ZeroCat Project")
        self.git("config", "user.email", "opensource@zerocat.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "tag.gpgsign", "false")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, env=self.env, check=True, capture_output=True, text=True)

    def guard(self, *args, extra_env=None):
        return subprocess.run([sys.executable, str(GUARD), *args], cwd=self.root,
                              env={**self.env, **(extra_env or {})}, capture_output=True, text=True)

    def test_pending_checks_both_author_and_committer(self):
        self.assertEqual(self.guard("--pending").returncode, 0)
        for role in ("AUTHOR", "COMMITTER"):
            with self.subTest(role=role):
                result = self.guard("--pending", extra_env={f"GIT_{role}_EMAIL": "personal@example.invalid"})
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("personal@example.invalid", result.stderr)

    def test_history_rejects_personal_author(self):
        self.git("commit", "-q", "--allow-empty", "-m", "Public snapshot")
        self.assertEqual(self.guard("--history").returncode, 0)
        self.git("commit", "-q", "--allow-empty", "--author", "Personal Example <personal@example.invalid>", "-m", "Invalid snapshot")
        self.assertNotEqual(self.guard("--history").returncode, 0)

    def test_trailers_cannot_add_personal_account(self):
        message = self.root / "message.txt"
        message.write_text("Snapshot\n\nCo-authored-by: ZeroCat Project <opensource@zerocat.invalid>\n")
        self.assertEqual(self.guard("--message-file", str(message)).returncode, 0)
        message.write_text("Snapshot\n\nCo-authored-by: Personal Example <personal@example.invalid>\n")
        self.assertNotEqual(self.guard("--message-file", str(message)).returncode, 0)

    def test_annotated_tag_and_push_destination(self):
        self.git("commit", "-q", "--allow-empty", "-m", "Snapshot")
        self.git("tag", "-a", "good", "-m", "Public version")
        self.assertEqual(self.guard("--history", "--remote-url", "https://github.com/zerocatllc/new-api.git").returncode, 0)
        self.assertNotEqual(self.guard("--history", "--remote-url", "https://github.com/example/unapproved.git").returncode, 0)
        self.git("-c", "user.email=personal@example.invalid", "tag", "-a", "bad", "-m", "Invalid tagger")
        self.assertNotEqual(self.guard("--history").returncode, 0)

    def test_public_push_requires_official_ancestry(self):
        self.git("commit", "-q", "--allow-empty", "-m", "Unbased snapshot")
        self.assertNotEqual(self.guard("--history", "--require-upstream").returncode, 0)

    def test_only_trusted_upstream_ancestors_are_exempt(self):
        self.git("-c", "user.name=Upstream Author", "-c", "user.email=upstream@example.invalid",
                 "commit", "-q", "--allow-empty", "-m", "Official fixture")
        base = self.git("rev-parse", "HEAD").stdout.strip()
        guard = self.root / "fixture-guard.py"
        guard.write_text(GUARD.read_text().replace(
            'UPSTREAM_BASE = "385d2dfd10d821b25c8a6766bd16eea248cb1652"',
            f'UPSTREAM_BASE = "{base}"',
        ))
        self.git("commit", "-q", "--allow-empty", "-m", "Project change")
        result = subprocess.run([sys.executable, str(guard), "--history", "--require-upstream"],
                                cwd=self.root, env=self.env, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.git("commit", "-q", "--allow-empty", "--author", "Personal Example <personal@example.invalid>",
                 "-m", "Unexpected downstream identity")
        result = subprocess.run([sys.executable, str(guard), "--history", "--require-upstream"],
                                cwd=self.root, env=self.env, capture_output=True)
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
