#!/usr/bin/env python3
"""Fail if templates/workloads.yaml carries any Helm hole outside the allowed
set declared in cue/holes.cue. The generated manifest is meant to be almost
entirely concrete; only these substitutions survive to render time."""
import re
import sys

ALLOWED = [
    r"\{\{ \.Values\.web\.replicaCount \}\}",
    r"\{\{ \.Values\.workers\.replicaCount \}\}",
    r"\{\{ \.Values\.image\.repository \}\}",
    r"\{\{ \.Values\.image\.tag \}\}",
    r"\{\{ \.Values\.marketing\.enabled \}\}",
    r'\{\{ include "opendealbook\.fullname" \. \}\}',
    r'\{\{- include "opendealbook\.labels" \. \| nindent \d+ \}\}',
    r'\{\{- include "opendealbook\.selectorLabels" \. \| nindent \d+ \}\}',
]
ALLOWED_RE = [re.compile(p) for p in ALLOWED]
HOLE_RE = re.compile(r"\{\{-?.*?\}\}")

def main(path):
    text = open(path).read()
    bad = []
    for m in HOLE_RE.finditer(text):
        hole = m.group(0)
        if not any(r.fullmatch(hole) for r in ALLOWED_RE):
            line = text.count("\n", 0, m.start()) + 1
            bad.append((line, hole))
    if bad:
        print(f"hole-scan FAILED: {len(bad)} disallowed hole(s) in {path}:")
        for line, hole in bad:
            print(f"  line {line}: {hole}")
        return 1
    count = len(HOLE_RE.findall(text))
    print(f"hole-scan OK: {count} hole(s), all in the allowed set")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
