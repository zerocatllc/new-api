#!/bin/bash
# Run each test file in its own bun process.
#
# Upstream's component tests each construct their own happy-dom Window at
# module scope and close it in after(). In a single shared `bun test src`
# process the first file to close its Window strands the process-cached
# react-dom/scheduler on dead globals (requestAnimationFrame, document),
# so later suites hang or error ("drawer did not finish initializing",
# "Unhandled error between tests") even though every file passes alone.
# Upstream does not gate on `bun test src`, so the leak is invisible there.
# Per-file processes remove the whole class without editing upstream files.
set -uo pipefail

cd "$(dirname "$0")/.."

files="$(find src \( -name '*.test.ts' -o -name '*.test.tsx' \) | sort)"
if [ -z "$files" ]; then
  echo "error: no test files found under src/" >&2
  exit 1
fi

failed=()
while IFS= read -r file; do
  if ! bun test "$file"; then
    failed+=("$file")
  fi
done <<< "$files"

echo
if [ ${#failed[@]} -gt 0 ]; then
  echo "failed test files (${#failed[@]}):"
  printf ' - %s\n' "${failed[@]}"
  exit 1
fi
echo "all test files passed in isolation"
