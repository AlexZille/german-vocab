#!/usr/bin/env python3
"""Set English translations for exam module words (DE->EN) from German headwords."""
import json
import re
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parent.parent
VOCAB_PATH = ROOT / "vocabulary.json"
MODULES_PATH = ROOT / "exam-modules.json"
PAIRS_PATH = ROOT / "exam-word-pairs.json"

DA_PATTERN = re.compile(r"[æøåÆØÅ]")
translator = GoogleTranslator(source="de", target="en")


def needs_english_update(word: dict) -> bool:
    wid = word.get("id", "")
    eng = word.get("english", "") or ""
    if wid.startswith("exam_"):
        return True
    if word.get("category") == "exam":
        return True
    if word.get("module", "").startswith("modul"):
        return True
    if DA_PATTERN.search(eng):
        return True
    # Common Danish-only fragments
    da_markers = (" og ", " til ", " det ", " en ", " der ", " ikke ", " med ", " af ", " på ")
    low = f" {eng.lower()} "
    if any(m in low for m in da_markers):
        return True
    return False


def translate_text(text: str, retries: int = 3) -> str:
    text = text.strip()
    if not text:
        return text
    for attempt in range(retries):
        try:
            return translator.translate(text)
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    return text


def translate_german_word(word: dict) -> str:
    german = (word.get("german") or "").strip()
    if not german:
        return word.get("english", "")
    # Phrases: translate whole German phrase
    result = translate_text(german)
    time.sleep(0.15)
    return result


def main():
    vocab = json.loads(VOCAB_PATH.read_text(encoding="utf-8"))
    modules = json.loads(MODULES_PATH.read_text(encoding="utf-8"))
    module_ids = set()
    for m in modules.get("modules", []):
        module_ids.update(m.get("wordIds", []))

    by_id = {w["id"]: w for w in vocab["words"]}
    updated = 0
    skipped = 0

    for wid in module_ids:
        w = by_id.get(wid)
        if not w:
            continue
        if not needs_english_update(w):
            skipped += 1
            continue
        new_en = translate_german_word(w)
        if new_en and new_en != w.get("english"):
            w["english"] = new_en
            if w.get("synonyms"):
                w["synonyms"] = [translate_text(s) for s in w["synonyms"][:5]]
            updated += 1
            print(f"  {w['german'][:40]:40} -> {new_en[:50]}")

    # Also update any remaining exam_* words not in module list
    for w in vocab["words"]:
        if w["id"] in module_ids:
            continue
        if not needs_english_update(w):
            continue
        new_en = translate_german_word(w)
        if new_en and new_en != w.get("english"):
            w["english"] = new_en
            updated += 1
            print(f"  {w['german'][:40]:40} -> {new_en[:50]}")

    VOCAB_PATH.write_text(json.dumps(vocab, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nUpdated {updated} words, skipped {skipped} (already English).")

    # Refresh exam-word-pairs.json supplements
    if PAIRS_PATH.exists():
        pairs = json.loads(PAIRS_PATH.read_text(encoding="utf-8"))
        for mod_id, entries in pairs.items():
            for entry in entries:
                g = entry.get("german", "").strip()
                if g:
                    entry["english"] = translate_text(g)
                    time.sleep(0.15)
        PAIRS_PATH.write_text(json.dumps(pairs, ensure_ascii=False, indent=2), encoding="utf-8")
        print("Updated exam-word-pairs.json")


if __name__ == "__main__":
    main()
