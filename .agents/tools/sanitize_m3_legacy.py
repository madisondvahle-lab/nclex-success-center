#!/usr/bin/env python3
"""Surgically remove legacy student-specific M3 wiring without editing clinical content.

Run from repo root on branch restore/m3-verbatim. The script is intentionally
fail-closed: it aborts unless the expected historical markers are present exactly.
"""
from pathlib import Path
import hashlib
import re

PATH = Path("module3-guide.html")
text = PATH.read_text(encoding="utf-8")

# Preserve the two clinical question banks byte-for-byte.
def block(src, start, end):
    a = src.index(start)
    b = src.index(end, a) + len(end)
    return src[a:b]

pq_before = block(text, "const PQ=[", "];\n\nlet pqCurrent")
qq_before = block(text, "const QQ=[", "];\n\nlet qqIdx")

# Navigation only. Require exact counts so unexpected source drift stops the run.
repls = {
    'href="alyssa-hub.html"': 'href="student-dashboard.html"',
    'href="module2-guide.html"': 'href="student-dashboard.html"',
    'href="module4-guide.html"': 'href="student-dashboard.html"',
}
expected = {
    'href="alyssa-hub.html"': 2,
    'href="module2-guide.html"': 2,
    'href="module4-guide.html"': 2,
}
for old, new in repls.items():
    count = text.count(old)
    if count != expected[old]:
        raise SystemExit(f"Refusing to edit: expected {expected[old]} occurrences of {old!r}, found {count}")
    text = text.replace(old, new)

old_fn = re.compile(
    r"const SB_URL='https://pmjwwktwlsqpetwfvolb\.supabase\.co';const SB_KEY='[^']+';\n"
    r"async function emailResults\(mod\)\{.*?\}\n\nrenderPQ\(\);",
    re.S,
)
match = old_fn.search(text)
if not match:
    raise SystemExit("Refusing to edit: legacy emailResults block not found")
legacy = match.group(0)
for forbidden in ("Alyssa Dababneh", "alyssadababneh@yahoo.com", "mailto:", "quiz_results"):
    if forbidden not in legacy:
        raise SystemExit(f"Refusing to edit: expected legacy marker missing: {forbidden}")

replacement = '''async function emailResults(mod){
  if(window.parent!==window && typeof window.parent.saveM3Result==='function'){
    const result=await window.parent.saveM3Result(pqScore,PQ.length,pqHistory);
    const button=document.querySelector('button[onclick*="emailResults"]');
    if(button){
      button.textContent=result.ok?'✅ Results Saved':'⚠️ Save Failed';
      if(result.ok)setTimeout(()=>{button.textContent='💾 Save My Results';},2500);
    }
    if(!result.ok)alert(result.message||'Your score could not be saved yet.');
    return;
  }
  alert('Open Module 3 from My Study Plan to save your results securely.');
  location.href='student-dashboard.html';
}

renderPQ();'''
text = old_fn.sub(replacement, text, count=1)
text = text.replace('>📧 Email My Results</button>', '>💾 Save My Results</button>', 1)

# Hard privacy guard.
for forbidden in ("Alyssa Dababneh", "alyssadababneh@yahoo.com", "mailto:", "quiz_results"):
    if forbidden in text:
        raise SystemExit(f"Refusing to write: legacy marker still present: {forbidden}")

# Clinical/question blocks must be identical.
pq_after = block(text, "const PQ=[", "];\n\nlet pqCurrent")
qq_after = block(text, "const QQ=[", "];\n\nlet qqIdx")
if pq_before != pq_after or qq_before != qq_after:
    raise SystemExit("Refusing to write: clinical question bank changed")

PATH.write_text(text, encoding="utf-8")
print("M3 legacy wiring sanitized safely")
print("PQ sha256:", hashlib.sha256(pq_after.encode()).hexdigest())
print("QQ sha256:", hashlib.sha256(qq_after.encode()).hexdigest())
