#!/usr/bin/env python3
"""Fail-closed validation for the Module 4 secure recovery."""
from pathlib import Path
import hashlib
import subprocess

SOURCE_COMMIT="2d70267535c431a622cdde415dfb0c273d35b6a5"
GUIDE=Path("module4-guide.html")
LAUNCHER=Path("module4-secure.html")

def fail(msg): raise SystemExit(f"M4 VALIDATION FAILED: {msg}")
def block(src,start,end):
    try:
        a=src.index(start); b=src.index(end,a)+len(end); return src[a:b]
    except ValueError as e: fail(f"clinical block marker missing: {e}")
def git_show(spec):
    try: return subprocess.check_output(["git","show",spec],text=True,encoding="utf-8")
    except subprocess.CalledProcessError as e: fail(f"could not read historical source: {e}")

if not GUIDE.exists() or not LAUNCHER.exists(): fail("guide and secure launcher must both exist")
current=GUIDE.read_text(encoding="utf-8")
launcher=LAUNCHER.read_text(encoding="utf-8")
historical=git_show(f"{SOURCE_COMMIT}:module4-guide.html")

for marker in ("Alyssa Dababneh","alyssadababneh@yahoo.com","mailto:","quiz_results",'href="alyssa-hub.html"','href="module3-guide.html"','href="module5-guide.html"'):
    if marker in current: fail(f"legacy source marker still present: {marker}")
for marker in ("window.parent.saveM4Result","student-dashboard.html","Open Module 4 from My Study Plan to save your results securely.","💾 Save My Results"):
    if marker not in current: fail(f"sanitized source marker missing: {marker}")
for marker in ("db.auth.getSession()",".eq('auth_user_id',session.user.id)",".eq('module_key','m4')","if(!access?.enabled)","db.from('module_results').insert","module_key:'m4'","frame.src='module4-guide.html'","student-login.html"):
    if marker not in launcher: fail(f"secure launcher marker missing: {marker}")
for marker in ("question-bank.html","student_pin","localStorage.getItem('pin"):
    if marker in launcher: fail(f"unsafe launcher marker present: {marker}")

pq_start,pq_end="const PQ=[","];\nlet pqCurrent"
qq_start,qq_end="const QQ=[","];\nlet qqIdx"
cpq,hpq=block(current,pq_start,pq_end),block(historical,pq_start,pq_end)
cqq,hqq=block(current,qq_start,qq_end),block(historical,qq_start,qq_end)
if cpq!=hpq: fail("PQ clinical bank differs from verified historical source")
if cqq!=hqq: fail("Quick Quiz clinical bank differs from verified historical source")
print("M4 recovery validation PASSED")
print("PQ sha256:",hashlib.sha256(cpq.encode()).hexdigest())
print("QQ sha256:",hashlib.sha256(cqq.encode()).hexdigest())
