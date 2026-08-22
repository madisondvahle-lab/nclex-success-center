#!/usr/bin/env python3
"""Fail-closed validation for the Module 5 secure recovery."""
from pathlib import Path
import hashlib
import re
import subprocess

SOURCE_COMMIT="2d70267535c431a622cdde415dfb0c273d35b6a5"
GUIDE=Path("module5-guide.html")
LAUNCHER=Path("module5-secure.html")

def fail(msg): raise SystemExit(f"M5 VALIDATION FAILED: {msg}")
def array_block(src,start,next_decl):
    try:
        a=src.index(start)
    except ValueError as e:
        fail(f"clinical block start missing: {e}")
    match=re.search(r"\n\];\s*\n+"+re.escape(next_decl),src[a:])
    if not match: fail(f"clinical block boundary missing before {next_decl}")
    return src[a:a+match.start()+3]
def git_show(spec):
    try: return subprocess.check_output(["git","show",spec],text=True,encoding="utf-8")
    except subprocess.CalledProcessError as e: fail(f"could not read historical source: {e}")

if not GUIDE.exists() or not LAUNCHER.exists(): fail("guide and secure launcher must both exist")
current=GUIDE.read_text(encoding="utf-8")
launcher=LAUNCHER.read_text(encoding="utf-8")
historical=git_show(f"{SOURCE_COMMIT}:module5-guide.html")

for marker in ("Alyssa Dababneh","alyssadababneh@yahoo.com","mailto:","quiz_results",'href="alyssa-hub.html"','href="module4-guide.html"','href="module6-guide.html"'):
    if marker in current: fail(f"legacy source marker still present: {marker}")
for marker in ("window.parent.saveM5Result","student-dashboard.html","Open Module 5 from My Study Plan to save your results securely.","💾 Save My Results"):
    if marker not in current: fail(f"sanitized source marker missing: {marker}")
for marker in ("db.auth.getSession()",".eq('auth_user_id',session.user.id)",".eq('module_key','m5')","if(!access?.enabled)","db.from('module_results').insert","module_key:'m5'","frame.src='module5-guide.html'","student-login.html"):
    if marker not in launcher: fail(f"secure launcher marker missing: {marker}")
for marker in ("question-bank.html","student_pin","localStorage.getItem('pin"):
    if marker in launcher: fail(f"unsafe launcher marker present: {marker}")

cpq,hpq=array_block(current,"const PQ=[","let pqCurrent"),array_block(historical,"const PQ=[","let pqCurrent")
cqq,hqq=array_block(current,"const QQ=[","let qqIdx"),array_block(historical,"const QQ=[","let qqIdx")
if cpq!=hpq: fail("PQ clinical bank differs from verified historical source")
if cqq!=hqq: fail("Quick Quiz clinical bank differs from verified historical source")
print("M5 recovery validation PASSED")
print("PQ sha256:",hashlib.sha256(cpq.encode()).hexdigest())
print("QQ sha256:",hashlib.sha256(cqq.encode()).hexdigest())
