#!/usr/bin/env python3
"""Remove corrupt exam entries and insert clean replacements."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / "vocabulary.json"
MODULES = ROOT / "exam-modules.json"

# id -> (german, english, article) — replaces corrupt entry
FIXES = {
    "exam_modul-2_0079": ("Bahnhof", "train station", "der"),
    "exam_modul-5_0205": ("Aufbauhilfe", "Marshall Plan aid", "die"),
    "exam_modul-6_0248": ("sich gut aufgehoben fühlen", "to feel safe and cared for", ""),
    "exam_modul-6_0252": ("einmal die Woche", "once a week", ""),
    "exam_modul-6_0261": ("wie es ihnen geht", "how they are doing", ""),
}

# Long phrase — keep but shorten english for display
PHRASE_FIX = {
    "exam_modul-1_0032": (
        "jemanden unter dem Verdacht des Mordes verhaften",
        "arrest someone on suspicion of murder",
    ),
}


def main():
    vocab = json.loads(VOCAB.read_text(encoding="utf-8"))
    by_id = {w["id"]: w for w in vocab["words"]}

    for wid, (g, e, art) in FIXES.items():
        if wid in by_id:
            w = by_id[wid]
            w["german"] = g
            w["english"] = e
            w["article"] = art
            print("fixed", wid, g, "->", e)

    for wid, (g, e) in PHRASE_FIX.items():
        if wid in by_id:
            w = by_id[wid]
            w["german"] = g
            w["english"] = e
            print("fixed phrase", wid)

    VOCAB.write_text(json.dumps(vocab, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Done.")


if __name__ == "__main__":
    main()
