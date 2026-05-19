#!/usr/bin/env python3
"""Apply manual English + synonyms; remove corrupt exam entries."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / "vocabulary.json"
MODULES = ROOT / "exam-modules.json"
OVERRIDES = json.loads((Path(__file__).parent / "exam_en_overrides.json").read_text(encoding="utf-8"))

REMOVE_GERMAN = re.compile(
    r"(caféscafé|scaféchaos|öffentlicher|halvbror|onkelsøn|omasforældre|"
    r"söhnesøskende|geschwistersøster)",
    re.I,
)

# Default synonyms by part of speech (lightweight)
DEFAULT_SYNONYMS = {
    "der": ["the"],
    "die": ["the"],
    "das": ["the"],
}


def main():
    vocab = json.loads(VOCAB.read_text(encoding="utf-8"))
    modules = json.loads(MODULES.read_text(encoding="utf-8"))
    module_ids = set()
    for m in modules.get("modules", []):
        module_ids.update(m.get("wordIds", []))

    removed = []
    kept = []
    for w in vocab["words"]:
        g = (w.get("german") or "").strip()
        wid = w.get("id", "")
        if wid in module_ids or w.get("module", "").startswith("modul"):
            if REMOVE_GERMAN.search(g) or len(g) > 55:
                removed.append(wid)
                continue
        kept.append(w)
    vocab["words"] = kept

  # reindex by_id
    by_id = {w["id"]: w for w in vocab["words"]}
    for m in modules.get("modules", []):
        m["wordIds"] = [wid for wid in m.get("wordIds", []) if wid in by_id and wid not in removed]

    updated = 0
    for w in vocab["words"]:
        if w["id"] not in module_ids and not w.get("module", "").startswith("modul"):
            continue
        key = (w.get("german") or "").strip().lower()
        if key in OVERRIDES:
            o = OVERRIDES[key]
            w["english"] = o["english"]
            if o.get("synonyms"):
                w["synonyms"] = o["synonyms"]
            updated += 1
        elif not w.get("synonyms") and w.get("english"):
            # Add at least one related synonym from english if missing
            en = w["english"].strip()
            if en and len(en) < 40 and not re.search(r"[æøå]", en, re.I):
                w["synonyms"] = []

    # Generic synonym pass for short exam words without synonyms
    for w in vocab["words"]:
        if w["id"] not in module_ids and not str(w.get("module", "")).startswith("modul"):
            continue
        if w.get("synonyms"):
            continue
        en = (w.get("english") or "").strip()
        g = (w.get("german") or "").strip()
        if not en or len(en) > 50 or re.search(r"[æøåÆØÅ]", en):
            continue
        # Simple plural / variant
        syns = []
        if en.endswith("y"):
            syns.append(en[:-1] + "ies")
        elif not en.endswith("s"):
            syns.append(en + "s")
        if syns:
            w["synonyms"] = syns[:3]

    VOCAB.write_text(json.dumps(vocab, ensure_ascii=False, indent=2), encoding="utf-8")
    MODULES.write_text(json.dumps(modules, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Removed {len(removed)} corrupt entries")
    print(f"Applied {updated} manual overrides")


if __name__ == "__main__":
    main()
