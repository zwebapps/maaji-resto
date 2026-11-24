"""Check mobile/store/LISTING.md against each field's store limit.

Every '### Field (max N...)' heading is followed by a ```text block; the
block's character count must be <= N. Exit 1 on any overflow.
"""
import re, sys, pathlib

text = pathlib.Path(__file__).with_name("LISTING.md").read_text(encoding="utf-8")
pat = re.compile(r"^### (.+?) \(max (\d+)[^)]*\)\n```text\n(.*?)\n```", re.M | re.S)
bad = 0
for chunk in re.split(r"^## ", text, flags=re.M)[1:]:
    title = chunk.splitlines()[0]
    for m in pat.finditer("\n" + chunk):
        field, limit, body = m.group(1), int(m.group(2)), m.group(3)
        n = len(body)
        flag = "OK " if n <= limit else "TOO LONG"
        if n > limit:
            bad += 1
        if field.startswith("Keywords") and ", " in body:
            flag, bad = "SPACES", bad + 1
        print(f"{flag:8} {n:5}/{limit:<5} {title} · {field}")
sys.exit(1 if bad else 0)
