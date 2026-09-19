#!/usr/bin/env python3
"""Reject personal identities before a public snapshot is committed or pushed."""

import argparse
import re
import subprocess
import sys
from pathlib import Path

PROJECT_IDENTITY = "ZeroCat Project <opensource@zerocat.invalid>"
UPSTREAM_BASE = "385d2dfd10d821b25c8a6766bd16eea248cb1652"
PUBLIC_REMOTES = {
    "https://github.com/zerocatllc/new-api.git",
    "git@github.com:zerocatllc/new-api.git",
}


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def check_identity(value, label):
    if value.rsplit(">", 1)[0] + ">" != PROJECT_IDENTITY:
        raise ValueError(f"{label}: use the approved project identity; personal identity blocked")


def check_trailers(message, label):
    for line in message.splitlines():
        if re.match(r"(?i)^(co-authored-by|signed-off-by):", line):
            check_identity(line.split(":", 1)[1].strip(), label)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pending", action="store_true")
    parser.add_argument("--history", action="store_true")
    parser.add_argument("--message-file")
    parser.add_argument("--remote-url")
    parser.add_argument("--require-upstream", action="store_true")
    args = parser.parse_args()
    if not any((args.pending, args.history, args.message_file)):
        parser.error("select --pending, --history or --message-file")
    try:
        if args.remote_url is not None and args.remote_url not in PUBLIC_REMOTES:
            raise ValueError("push destination is not the approved public repository")
        if args.pending:
            for role in ("AUTHOR", "COMMITTER"):
                check_identity(git("var", f"GIT_{role}_IDENT"), role.lower())
        if args.message_file:
            check_trailers(Path(args.message_file).read_text(), "commit trailer")
        if args.history:
            has_upstream = subprocess.run(
                ["git", "cat-file", "-e", f"{UPSTREAM_BASE}^{{commit}}"],
                capture_output=True,
            ).returncode == 0
            if args.require_upstream:
                if not has_upstream or subprocess.run(
                    ["git", "merge-base", "--is-ancestor", UPSTREAM_BASE, "HEAD"],
                    capture_output=True,
                ).returncode != 0:
                    raise ValueError("official rc.37 must be an ancestor of the public branch")
            # Exempt only the immutable official history, never arbitrary authors
            # or branches. All downstream and unrelated commits remain checked.
            revisions = ["--all"]
            if has_upstream:
                revisions.append(f"^{UPSTREAM_BASE}")
            commits = git("rev-list", *revisions).splitlines()
            for commit in commits:
                author, committer, message = git(
                    "show", "-s", "--format=%an <%ae>%x00%cn <%ce>%x00%B", commit
                ).split("\0", 2)
                check_identity(author, f"commit {commit[:12]} author")
                check_identity(committer, f"commit {commit[:12]} committer")
                check_trailers(message, f"commit {commit[:12]} trailer")
            for ref in git("for-each-ref", "--format=%(refname)", "refs/tags").splitlines():
                if git("cat-file", "-t", ref) == "tag":
                    content = git("cat-file", "-p", ref)
                    tagger = next((s[7:] for s in content.splitlines() if s.startswith("tagger ")), "")
                    check_identity(tagger, "annotated tag")
        print("Publication identity check passed.")
        return 0
    except (ValueError, subprocess.CalledProcessError, OSError) as error:
        print(f"Publication blocked: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
