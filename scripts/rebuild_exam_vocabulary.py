#!/usr/bin/env python3
"""Rebuild exam_* vocabulary entries with clean German + English translations."""
import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from import_exam_modules import parse_module, MODULE_META, normalize_german  # noqa: E402

VOCAB_PATH = ROOT / "vocabulary.json"
EXTRACTED = ROOT / "_docx_extracted.json"
PAIRS_PATH = ROOT / "exam-word-pairs.json"
MODULES_PATH = ROOT / "exam-modules.json"

translator = GoogleTranslator(source="de", target="en")

# Manual fixes for parser glitches (German -> English)
MANUAL_FIXES = {
    "Hakenkreuz": ("Hakenkreuz", "swastika", "das"),
    "Herrenvolk": ("Herrenvolk", "master race", "das"),
    "Lebensraum": ("Lebensraum", "living space", "der"),
    "Ostalgie": ("Ostalgie", "nostalgia for East Germany", "die"),
    "Anzeige": ("Anzeige", "report, charge", "die"),
    "Ermittlung": ("Ermittlung", "investigation", "die"),
    "Holocaust": ("Holocaust", "Holocaust", "der"),
    "Humanismus": ("Humanismus", "humanism", "der"),
    "Manipulation": ("Manipulation", "manipulation", "die"),
    "Mitglied": ("Mitglied", "member", "das"),
    "Stolperstein": ("Stolperstein", "stumbling stone", "der"),
    "Sündenbock": ("Sündenbock", "scapegoat", "der"),
    "Kontrolle": ("Kontrolle", "control", "die"),
    "Die Weiße Rose": ("Die Weiße Rose", "the White Rose", "die"),
    "Der kalte Krieg": ("Der kalte Krieg", "the Cold War", "der"),
    "Der schwarze Markt": ("Der schwarze Markt", "the black market", "der"),
    "Die Berliner Mauer": ("Die Berliner Mauer", "the Berlin Wall", "die"),
    "Fall der Berliner Mauer": ("Fall der Berliner Mauer", "fall of the Berlin Wall", "der"),
    "Wir sind das Volk": ("Wir sind das Volk", "we are the people", ""),
    "Die Mauer im Kopf": ("Die Mauer im Kopf", "the wall in the head", "die"),
    "Freie Deutsche Jugend": ("Freie Deutsche Jugend", "Free German Youth", "die"),
    "SED - Sozialistische Einheitspartei Deutschland": (
        "SED",
        "Socialist Unity Party of Germany",
        "die",
    ),
    "Marshall-hjælp": ("Aufbauhilfe", "Marshall Plan aid", "die"),
    "Bewältigung der Vergangenheit": (
        "Bewältigung der Vergangenheit",
        "coming to terms with the past",
        "die",
    ),
    "Aufarbeitung der Vergangenheit": (
        "Aufarbeitung der Vergangenheit",
        "processing the past",
        "die",
    ),
}


def translate_de(text: str) -> str:
    time.sleep(0.12)
    return translator.translate(text.strip())


def is_garbage_german(g: str) -> bool:
    if len(g) > 45:
        return True
    if re.search(r"[a-z]{4,}[A-ZÄÖÜ]", g):
        return True
    if re.search(r"(truende|kontrolle|overfalde|voldelig|henrette|mistever)", g, re.I):
        return True
    return False


def word_entry(german: str, english: str, article: str, mod_id: str, idx: int) -> dict:
    return {
        "id": f"exam_{mod_id}_{idx:04d}",
        "german": german,
        "english": english,
        "category": "exam",
        "module": mod_id,
        "difficulty": "intermediate",
        "article": article or "",
        "exampleSentence": "",
    }


def collect_words_for_module(key: str, mod_id: str) -> list:
    entries = []
    seen = set()

    if PAIRS_PATH.exists():
        pairs = json.loads(PAIRS_PATH.read_text(encoding="utf-8")).get(mod_id, [])
        for p in pairs:
            g = normalize_german(p["german"])
            if not g or g.lower() in seen:
                continue
            seen.add(g.lower())
            eng = p.get("english") or translate_de(g)
            entries.append((g, eng, p.get("article", "")))

    if EXTRACTED.exists():
        data = json.loads(EXTRACTED.read_text(encoding="utf-8"))
        for w in parse_module(key, data[key]["text"], mod_id):
            g = normalize_german(w["german"])
            if not g or is_garbage_german(g) or g.lower() in seen:
                continue
            seen.add(g.lower())
            if g in MANUAL_FIXES:
                g, eng, art = MANUAL_FIXES[g]
            else:
                eng = w.get("english") or ""
                if re.search(r"[æøåÆØÅ]", eng) or len(eng) > 80:
                    eng = translate_de(g)
                art = w.get("article", "")
            entries.append((g, eng, art))

    for g, (fixed_g, eng, art) in MANUAL_FIXES.items():
        if fixed_g.lower() not in seen and mod_id in ("modul-3", "modul-4", "modul-5"):
            if g in ("Marshall-hjælp",) and mod_id != "modul-4":
                continue
            seen.add(fixed_g.lower())
            entries.append((fixed_g, eng, art))

    return entries


def main():
    if not EXTRACTED.exists():
        print("Missing _docx_extracted.json – run docx extract first or restore file.")
        sys.exit(1)

    vocab = json.loads(VOCAB_PATH.read_text(encoding="utf-8"))
    vocab["words"] = [w for w in vocab["words"] if not str(w.get("id", "")).startswith("exam_")]

    existing = {w["german"].lower(): w for w in vocab["words"]}
    modules_out = []
    idx_counter = 0

    for num, mod_id, mod_name in MODULE_META:
        key = f"modul_{num}"
        entries = collect_words_for_module(key, mod_id)
        word_ids = []

        for g, eng, art in entries:
            gl = g.lower()
            if gl in existing:
                wid = existing[gl]["id"]
                # Update English if exam word had Danish
                ex = existing[gl]
                if ex.get("category") != "exam" and re.search(r"[æøåÆØÅ]", ex.get("english", "")):
                    ex["english"] = eng
            else:
                wid = f"exam_{mod_id}_{idx_counter:04d}"
                idx_counter += 1
                new_w = word_entry(g, eng, art, mod_id, idx_counter)
                vocab["words"].append(new_w)
                existing[gl] = new_w
            word_ids.append(wid)

        modules_out.append({"id": mod_id, "name": mod_name, "wordIds": word_ids})
        print(f"{mod_name}: {len(word_ids)} words")

    vocab["modules"] = modules_out
    VOCAB_PATH.write_text(json.dumps(vocab, ensure_ascii=False, indent=2), encoding="utf-8")
    MODULES_PATH.write_text(
        json.dumps({"modules": modules_out}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Done. Total vocabulary: {len(vocab['words'])} words")


if __name__ == "__main__":
    main()
