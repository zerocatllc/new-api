#!/usr/bin/env python3
"""Keep the public branch limited to rc.37, ZeroCat web, and tickets."""

import subprocess
import sys
import re
from typing import Optional

UPSTREAM_BASE = "385d2dfd10d821b25c8a6766bd16eea248cb1652"
EXACT_PATHS = {
    "go.mod", "go.sum", "main.go",
    "common/gin.go", "common/json.go", "common/secret_encryption.go", "common/ssrf_protection.go",
    "controller/ticket.go", "controller/ticket_admin.go", "controller/ticket_attachment.go",
    "controller/ticket_batch.go", "controller/ticket_settings.go", "controller/ticket_tags.go",
    "controller/ticket_test.go", "controller/ticket_admin_test.go", "controller/ticket_attachment_test.go",
    "controller/ticket_batch_test.go", "controller/ticket_tags_test.go",
    "dto/ticket.go", "dto/ticket_batch.go",
    "model/main.go", "model/option.go", "model/option_storage.go", "model/option_ticket.go", "model/user.go",
    "router/api-router.go", "router/ticket-router.go", "router/ticket_router_test.go", "router/ticket_upload_gate_test.go",
    "service/authz/authz_test.go", "service/authz/resources_ticket.go", "service/authz/resources_ticket_test.go",
    "setting/storage_setting/config.go", "setting/storage_setting/config_test.go", "setting/ticket_setting/config.go",
    "web/src/features/security/__tests__/account-security.test.tsx",
    "web/src/features/security/__tests__/enrollment.test.tsx",
    "web/src/hooks/__tests__/sidebar-config.test.tsx",
}
PREFIXES = (
    ".githooks/", "web/", "scripts/check-public", "scripts/test-public",
    "model/ticket", "service/ticket", "service/storage",
)
ALLOWED_NEW_ROUTE_PATHS = {
    "web/src/routes/-__root.test.tsx",
    "web/src/routes/_authenticated/ticket-management/index.tsx",
    "web/src/routes/_authenticated/tickets/index.tsx",
}
API_LITERAL = re.compile(r'''["'`](/api/[^"'`$\\\s]+)''')


def allowed_path(path: str) -> bool:
    return path in EXACT_PATHS or path.startswith(PREFIXES)


def allowed_new_api(path: str) -> bool:
    return (
        path == "/api/tickets"
        or path.startswith("/api/tickets/")
        or path == "/api/admin/tickets"
        or path.startswith("/api/admin/tickets/")
        or path.startswith("/api/admin/ticket/")
    )


def git_output(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True)


def git_show(spec: str) -> Optional[str]:
    result = subprocess.run(
        ["git", "show", spec], text=True, capture_output=True
    )
    return result.stdout if result.returncode == 0 else None


def upstream_api_literals() -> set[str]:
    markers: set[str] = set()
    paths = git_output("ls-tree", "-r", "--name-only", UPSTREAM_BASE, "--", "web/src").splitlines()
    for path in paths:
        if not path.endswith((".ts", ".tsx", ".js", ".mjs")):
            continue
        content = git_output("show", f"{UPSTREAM_BASE}:{path}")
        markers.update(API_LITERAL.findall(content))
    return markers


def main() -> int:
    if subprocess.run(["git", "merge-base", "--is-ancestor", UPSTREAM_BASE, "HEAD"]).returncode:
        print("public surface check failed: official rc.37 is not an ancestor", file=sys.stderr)
        return 1
    changed = git_output("diff", "--name-only", f"{UPSTREAM_BASE}..HEAD").splitlines()
    unexpected = [path for path in changed if not allowed_path(path)]
    if unexpected:
        print("public surface check failed: unexpected paths", file=sys.stderr)
        print("\n".join(unexpected), file=sys.stderr)
        return 1
    added = git_output(
        "diff", "--diff-filter=A", "--name-only", f"{UPSTREAM_BASE}..HEAD"
    ).splitlines()
    unexpected_routes = [
        path for path in added
        if path.startswith("web/src/routes/") and path not in ALLOWED_NEW_ROUTE_PATHS
    ]
    if unexpected_routes:
        print("public surface check failed: unexpected new routes", file=sys.stderr)
        print("\n".join(unexpected_routes), file=sys.stderr)
        return 1

    upstream_features = {
        path.split("/", 4)[3]
        for path in git_output(
            "ls-tree", "-r", "--name-only", UPSTREAM_BASE, "--", "web/src/features"
        ).splitlines()
        if path.count("/") >= 4
    }
    allowed_features = upstream_features | {"tickets", "ticket-management"}
    unexpected_features = [
        path for path in added
        if path.startswith("web/src/features/")
        and path.split("/", 4)[3] not in allowed_features
    ]
    if unexpected_features:
        print("public surface check failed: unexpected new feature areas", file=sys.stderr)
        print("\n".join(unexpected_features), file=sys.stderr)
        return 1

    baseline_api = upstream_api_literals()
    current_api: set[str] = set()
    for path in changed:
        if not path.startswith("web/src/") or not path.endswith((".ts", ".tsx", ".js", ".mjs")):
            continue
        content = git_show(f"HEAD:{path}")
        if content is None:
            continue
        current_api.update(API_LITERAL.findall(content))
    unexpected_api = sorted(
        path for path in current_api - baseline_api if not allowed_new_api(path)
    )
    if unexpected_api:
        print("public surface check failed: unexpected frontend API paths", file=sys.stderr)
        print("\n".join(unexpected_api), file=sys.stderr)
        return 1
    print("Public surface check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
