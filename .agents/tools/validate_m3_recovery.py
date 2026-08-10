#!/usr/bin/env python3
"""Fail-closed validation for the Module 3 secure recovery.

Run from the repository root after sanitize_m3_legacy.py on branch
restore/m3-verbatim. This script does not modify files.
"""
from pathlib import Path
import hashlib
import subprocess

SOURCE_COMMIT = "2d70267535c431a622cdde415dfb0c273d35b6a5"
GUIDE = Path("module3-guide.html")
LAUNCHER = Path("module3-secure.html")


def fail(message):
    raise SystemExit(f"M3 VALIDATION FAILED: {message}")


def extract_block(src, start, end):
    try:
        a = src.index(start)
        b = src.index(end, a) + len(end)
    except ValueError as exc:
        fail(f"clinical block marker missing: {exc}")
    return src[a:b]


def git_show(spec):
    try:
        return subprocess.check_output(
            ["git", "show", spec], text=True, encoding="utf-8"
        )
    except subprocess.CalledProcessError as exc:
        fail(f"could not read historical source with git show: {exc}")


if not GUIDE.exists() or not LAUNCHER.exists():
    fail("module3-guide.html and module3-secure.html must both exist")

current = GUIDE.read_text(encoding="utf-8")
launcher = LAUNCHER.read_text(encoding="utf-8")
historical = git_show(f"{SOURCE_COMMIT}:module3-guide.html")

# Privacy/security cleanup must be complete in the source itself.
for forbidden in (
    "Alyssa Dababneh",
    "alyssadababneh@yahoo.com",
    "mailto:",
    "quiz_results",
    'href="alyssa-hub.html"',
    'href="module2-guide.html"',
    'href="module4-guide.html"',
):
    if forbidden in current:
        fail(f"legacy source marker still present: {forbidden}")

# Direct opening of the recovered source must fail back to the current dashboard
# rather than silently using a legacy result path.
required_source = (
    "window.parent.saveM3Result",
    "student-dashboard.html",
    "Open Module 3 from My Study Plan to save your results securely.",
    "💾 Save My Results",
)
for marker in required_source:
    if marker not in current:
        fail(f"expected sanitized source marker missing: {marker}")

# The supported launcher must enforce current identity and assignment checks.
required_launcher = (
    "db.auth.getSession()",
    ".eq('auth_user_id',session.user.id)",
    ".eq('module_key','m3')",
    "if(!access?.enabled)",
    "db.from('module_results').insert",
    "module_key:'m3'",
    "frame.src='module3-guide.html'",
    "student-login.html",
)
for marker in required_launcher:
    if marker not in launcher:
        fail(f"secure launcher marker missing: {marker}")

# No anonymous/public fallback or internal question-bank route should be introduced.
for forbidden in ("question-bank.html", "student_pin", "localStorage.getItem('pin"):
    if forbidden in launcher:
        fail(f"unsafe launcher marker present: {forbidden}")

# Clinical question banks must remain byte-for-byte identical to the verified
# historical recovery source. Technical cleanup is not clinical-edit authority.
pq_start, pq_end = "const PQ=[", "];\n\nlet pqCurrent"
qq_start, qq_end = "const QQ=[", "];\n\nlet qqIdx"
current_pq = extract_block(current, pq_start, pq_end)
historical_pq = extract_block(historical, pq_start, pq_end)
current_qq = extract_block(current, qq_start, qq_end)
historical_qq = extract_block(historical, qq_start, qq_end)

if current_pq != historical_pq:
    fail("25-question PQ clinical bank differs from verified historical source")
if current_qq != historical_qq:
    fail("Quick Quiz clinical bank differs from verified historical source")

print("M3 recovery validation PASSED")
print("PQ sha256:", hashlib.sha256(current_pq.encode()).hexdigest())
print("QQ sha256:", hashlib.sha256(current_qq.encode()).hexdigest())
print("Legacy identifiers/result-email wiring absent from source")
print("Secure launcher Auth + M3 assignment + module_results checks present")
