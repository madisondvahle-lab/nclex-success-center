#!/usr/bin/env python3
"""Surgically remove legacy student-specific M4 wiring without editing clinical content.

Run from repo root on branch restore/m4-verbatim. The script fails closed on
partial/mixed legacy state or if question-bank boundaries are missing.
"""
from pathlib import Path
import hashlib
import re

PATH = Path("module4-guide.html")
text = PATH.read_text(encoding="utf-8")


def array_block(src, start, next_decl):
    """Return an embedded JS array through its closing ];, allowing blank lines before the next declaration."""
    a = src.index(start)
    match = re.search(r"\n\];\s*\n+" + re.escape(next_decl), src[a:])
    if not match:
        raise SystemExit(f"Refusing to edit: clinical block boundary missing before {next_decl}")
    return src[a : a + match.start() + 3]


pq_before = array_block(text, "const PQ=[", "let pqCurrent")
qq_before = array_block(text, "const QQ=[", "let qqIdx")
legacy_markers = ("Alyssa Dababneh", "alyssadababneh@yahoo.com", "mailto:", "quiz_results")
secure_markers = ("window.parent.saveM4Result", "Open Module 4 from My Study Plan to save your results securely.", "💾 Save My Results")
present = [marker in text for marker in legacy_markers]

if not any(present):
    missing = [marker for marker in secure_markers if marker not in text]
    if missing:
        raise SystemExit(f"Refusing to continue: legacy markers are gone but secure wiring is incomplete: {missing}")
    print("M4 source already sanitized; no changes required")
    print("PQ sha256:", hashlib.sha256(pq_before.encode()).hexdigest())
    print("QQ sha256:", hashlib.sha256(qq_before.encode()).hexdigest())
    raise SystemExit(0)
if not all(present):
    remaining = [marker for marker, is_present in zip(legacy_markers, present) if is_present]
    raise SystemExit(f"Refusing to edit: mixed legacy state detected; remaining markers: {remaining}")

# Navigation only. Historical personal/module navigation is not authoritative.
text = text.replace('href="alyssa-hub.html"', 'href="student-dashboard.html"')
text = text.replace('href="module3-guide.html"', 'href="student-dashboard.html"')
text = text.replace('href="module5-guide.html"', 'href="student-dashboard.html"')

old_fn = re.compile(
    r"const SB_URL='https://pmjwwktwlsqpetwfvolb\.supabase\.co';const SB_KEY='[^']+';\n"
    r"async function emailResults\(mod\)\{.*?\}\nrenderPQ\(\);",
    re.S,
)
match = old_fn.search(text)
if not match:
    raise SystemExit("Refusing to edit: legacy emailResults block not found")

replacement = '''async function emailResults(mod){
  if(window.parent!==window && typeof window.parent.saveM4Result==='function'){
    const result=await window.parent.saveM4Result(pqScore,PQ.length,pqHistory);
    const button=document.querySelector('button[onclick*="emailResults"]');
    if(button){
      button.textContent=result.ok?'✅ Results Saved':'⚠️ Save Failed';
      if(result.ok)setTimeout(()=>{button.textContent='💾 Save My Results';},2500);
    }
    if(!result.ok)alert(result.message||'Your score could not be saved yet.');
    return;
  }
  alert('Open Module 4 from My Study Plan to save your results securely.');
  location.href='student-dashboard.html';
}
renderPQ();'''
text = old_fn.sub(replacement, text, count=1)
text = text.replace('>📧 Email My Results</button>', '>💾 Save My Results</button>', 1)

for marker in legacy_markers:
    if marker in text:
        raise SystemExit(f"Refusing to write: legacy marker still present: {marker}")

pq_after = array_block(text, "const PQ=[", "let pqCurrent")
qq_after = array_block(text, "const QQ=[", "let qqIdx")
if pq_before != pq_after or qq_before != qq_after:
    raise SystemExit("Refusing to write: clinical question bank changed")

PATH.write_text(text, encoding="utf-8")
print("M4 legacy wiring sanitized safely")
print("PQ sha256:", hashlib.sha256(pq_after.encode()).hexdigest())
print("QQ sha256:", hashlib.sha256(qq_after.encode()).hexdigest())
