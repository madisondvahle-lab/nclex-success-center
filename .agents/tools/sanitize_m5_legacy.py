#!/usr/bin/env python3
"""Surgically remove legacy student-specific M5 wiring without editing clinical content.

Run from repo root on branch restore/m5-verbatim. The script fails closed if
expected legacy markers or question-bank boundaries are missing.
"""
from pathlib import Path
import hashlib
import re

PATH = Path("module5-guide.html")
text = PATH.read_text(encoding="utf-8")


def block(src, start, end):
    a = src.index(start)
    b = src.index(end, a) + len(end)
    return src[a:b]


pq_before = block(text, "const PQ=[", "];\nlet pqCurrent")
qq_before = block(text, "const QQ=[", "];\nlet qqIdx")

legacy_markers = ("Alyssa Dababneh", "alyssadababneh@yahoo.com", "mailto:", "quiz_results")
for marker in legacy_markers:
    if marker not in text:
        raise SystemExit(f"Refusing to edit: expected legacy marker missing: {marker}")

text = text.replace('href="alyssa-hub.html"', 'href="student-dashboard.html"')
text = text.replace('href="module4-guide.html"', 'href="student-dashboard.html"')
text = text.replace('href="module6-guide.html"', 'href="student-dashboard.html"')

old_fn = re.compile(
    r"const SB_URL='https://pmjwwktwlsqpetwfvolb\.supabase\.co';const SB_KEY='[^']+';\n"
    r"async function emailResults\(mod\)\{.*?\}\nrenderPQ\(\);",
    re.S,
)
match = old_fn.search(text)
if not match:
    raise SystemExit("Refusing to edit: legacy emailResults block not found")

replacement = '''async function emailResults(mod){
  if(window.parent!==window && typeof window.parent.saveM5Result==='function'){
    const result=await window.parent.saveM5Result(pqScore,PQ.length,pqHistory);
    const button=document.querySelector('button[onclick*="emailResults"]');
    if(button){
      button.textContent=result.ok?'✅ Results Saved':'⚠️ Save Failed';
      if(result.ok)setTimeout(()=>{button.textContent='💾 Save My Results';},2500);
    }
    if(!result.ok)alert(result.message||'Your score could not be saved yet.');
    return;
  }
  alert('Open Module 5 from My Study Plan to save your results securely.');
  location.href='student-dashboard.html';
}
renderPQ();'''
text = old_fn.sub(replacement, text, count=1)
text = text.replace('>📧 Email My Results</button>', '>💾 Save My Results</button>', 1)

for marker in legacy_markers:
    if marker in text:
        raise SystemExit(f"Refusing to write: legacy marker still present: {marker}")

pq_after = block(text, "const PQ=[", "];\nlet pqCurrent")
qq_after = block(text, "const QQ=[", "];\nlet qqIdx")
if pq_before != pq_after or qq_before != qq_after:
    raise SystemExit("Refusing to write: clinical question bank changed")

PATH.write_text(text, encoding="utf-8")
print("M5 legacy wiring sanitized safely")
print("PQ sha256:", hashlib.sha256(pq_after.encode()).hexdigest())
print("QQ sha256:", hashlib.sha256(qq_after.encode()).hexdigest())
