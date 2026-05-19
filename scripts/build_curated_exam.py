#!/usr/bin/env python3
"""Rebuild exam module vocabulary from docx nouns + curated verbs/adjectives/phrases with synonyms."""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from import_exam_modules import (  # noqa: E402
    MODULE_META,
    normalize_german,
    parse_nouns,
    split_sections,
    strip_header,
    article_from_gender,
)

NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
DOCX = [
    (1, r"c:\Users\alexa\Desktop\HF Enkeltfag\Tysk 2026\Eksamen\Ordforråd - Modul 1 - Verbrechen und Strafe.docx"),
    (2, r"c:\Users\alexa\Desktop\HF Enkeltfag\Tysk 2026\Eksamen\Ordforråd - Modul 2 - Das Leben in der Grossstadt.docx"),
    (3, r"c:\Users\alexa\Desktop\HF Enkeltfag\Tysk 2026\Eksamen\Ordforråd - Modul 3 - Kindheit und Jugend in der NS-Zeit.docx"),
    (4, r"c:\Users\alexa\Desktop\HF Enkeltfag\Tysk 2026\Eksamen\Ordforråd - Modul 4 - Nachkriegszeit.docx"),
    (5, r"c:\Users\alexa\Desktop\HF Enkeltfag\Tysk 2026\Eksamen\Ordforråd - Modul 5 - Reisefreiheit.docx"),
    (6, r"c:\Users\alexa\Desktop\HF Enkeltfag\Tysk 2026\Eksamen\Ordforråd - Modul 6 - Familienleben.docx"),
]

# Curated non-noun entries (English + synonyms) — from HF word lists
CURATED_EXTRA = json.loads((ROOT / "exam-word-pairs.json").read_text(encoding="utf-8"))

# Manual fixes / overrides by German headword (lowercase)
OVERRIDES = {
    "alibi": ("alibi", ["alibis"]),
    "angeklagte": ("the accused", ["defendant"]),
    "anwalt": ("lawyer", ["attorney", "solicitor"]),
    "anzeige": ("report", ["charge", "complaint"]),
    "beweis": ("evidence", ["proof"]),
    "detektiv": ("detective", ["investigator"]),
    "dieb": ("thief", ["robber"]),
    "diebstahl": ("theft", ["stealing"]),
    "einbrecher": ("burglar", ["break-in thief"]),
    "entlassung": ("release", ["parole"]),
    "ermittlung": ("investigation", ["inquiry"]),
    "fall": ("case", ["matter"]),
    "festnahme": ("arrest", ["detention"]),
    "gefängnis": ("prison", ["jail"]),
    "gericht": ("court", ["tribunal"]),
    "geständnis": ("confession", ["admission"]),
    "gewalt": ("violence", ["force"]),
    "grund": ("reason", ["cause", "motive"]),
    "leiche": ("corpse", ["body", "dead body"]),
    "mandant": ("client", ["customer"]),
    "mörder": ("murderer", ["killer"]),
    "motiv": ("motive", ["reason"]),
    "opfer": ("victim", ["casualty"]),
    "polizist": ("police officer", ["cop", "policeman"]),
    "raub": ("robbery", ["hold-up"]),
    "richter": ("judge", ["magistrate"]),
    "schuld": ("guilt", ["fault"]),
    "strafe": ("punishment", ["penalty", "sentence"]),
    "straftat": ("criminal offence", ["crime"]),
    "täter": ("perpetrator", ["offender", "culprit"]),
    "tatort": ("crime scene", ["scene of the crime"]),
    "überfall": ("mugging", ["assault", "raid"]),
    "urteil": ("verdict", ["judgment", "sentence"]),
    "verbrechen": ("crime", ["offence", "felony"]),
    "verdacht": ("suspicion", ["doubt"]),
    "verhör": ("interrogation", ["questioning"]),
    "vernehmung": ("hearing", ["interrogation"]),
    "verteidiger": ("defence lawyer", ["defender", "counsel"]),
    "wahrheit": ("truth", ["fact"]),
    "waffe": ("weapon", ["gun", "arms"]),
    "zeuge": ("witness", ["eyewitness"]),
    "entlassen": ("release", ["free", "discharge"]),
    "grausam": ("cruel", ["brutal", "vicious"]),
    "brutal": ("brutal", ["violent", "savage"]),
    "gehorsam": ("obedient", ["submissive", "compliant"]),
    "arm": ("poor", ["poverty-stricken", "needy"]),
    "bahnhof": ("train station", ["station", "railway station"]),
    "café": ("café", ["coffee house"]),
    "hakenkreuz": ("swastika", ["Nazi symbol"]),
    "herrenvolk": ("master race", ["Herrenvolk"]),
    "lebensraum": ("living space", ["Lebensraum"]),
    "ostalgie": ("nostalgia for East Germany", ["Ostalgie"]),
    "anzeige": ("report", ["charge"]),
    "stasi": ("Stasi", ["secret police"]),
    "sed": ("SED party", ["Socialist Unity Party"]),
}

MODUL_6 = [
    ("Enkelkind", "grandchild", "das", ["grandchildren"]),
    ("Bruder", "brother", "der", ["brothers"]),
    ("Tochter", "daughter", "die", ["daughters"]),
    ("Einzelkind", "only child", "das", []),
    ("Vater", "father", "der", ["dad"]),
    ("Opa", "grandpa", "der", ["grandfather"]),
    ("Oma", "grandma", "die", ["grandmother"]),
    ("Eltern", "parents", "die", []),
    ("Halbbruder", "half-brother", "der", []),
    ("Mutter", "mother", "die", ["mom"]),
    ("Uropa", "great-grandfather", "der", []),
    ("Uroma", "great-grandmother", "die", []),
    ("Onkel", "uncle", "der", []),
    ("Sohn", "son", "der", ["sons"]),
    ("Geschwister", "siblings", "die", ["brothers and sisters"]),
    ("Schwester", "sister", "die", ["sisters"]),
    ("Tante", "aunt", "die", []),
    ("Zwilling", "twin", "der", ["twins"]),
    ("Freund", "friend", "der", ["friends"]),
    ("Abhängigkeit", "dependence", "die", ["dependency"]),
    ("Beziehung", "relationship", "die", ["relation"]),
    ("Fürsorge", "care", "die", ["looking after"]),
    ("Hass", "hatred", "der", ["hate"]),
    ("Liebe", "love", "die", []),
    ("Unabhängigkeit", "independence", "die", []),
    ("Verhältnis", "relationship", "das", ["relation"]),
    ("Wurzel", "root", "die", ["roots"]),
    ("helfen", "help", "", ["assist", "aid"]),
    ("lachen", "laugh", "", ["smile"]),
    ("sich kümmern", "take care of", "", ["look after"]),
    ("unterstützen", "support", "", ["help", "assist"]),
    ("weinen", "cry", "", ["weep"]),
    ("anrufen", "call", "", ["phone", "ring"]),
    ("abhängig", "dependent", "", []),
    ("bedingungslos", "unconditional", "", []),
    ("geborgen", "safe", "", ["secure", "protected"]),
    ("sich gut aufgehoben fühlen", "feel cared for", "", ["feel safe"]),
    ("unabhängig", "independent", "", []),
    ("alle drei Tage", "every three days", "", []),
    ("einmal die Woche", "once a week", "", ["weekly"]),
    ("fast jeden Tag", "almost every day", "", []),
    ("häufig", "often", "", ["frequently"]),
    ("ich rufe meine Mutter an", "I call my mother", "", []),
    ("zweimal wöchentlich", "twice a week", "", []),
    ("allgemeine Dinge", "everyday things", "", ["general things"]),
    ("die Großstadt", "the big city", "", ["the city"]),
    ("Klatsch und Tratsch", "gossip", "", ["small talk"]),
    ("über Gott und die Welt", "about everything", "", ["about this and that"]),
    ("über meine Arbeit", "about my work", "", []),
    ("wie es ihnen geht", "how they are", "", ["how they are doing"]),
    ("abhängig sein", "be dependent", "", []),
    ("unabhängig sein", "be independent", "", []),
    ("einmischen", "interfere", "", ["meddle"]),
    ("Konflikt", "conflict", "der", ["dispute"]),
]


def extract_docx(path: str) -> str:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    parts = []
    for t in root.iter(NS + "t"):
        if t.text:
            parts.append(t.text)
        if t.tail:
            parts.append(t.tail)
    return "".join(parts)


def parse_modul_nouns(text: str) -> list:
    text = strip_header(text)
    sections = split_sections(text)
    if "substantive" not in sections:
        return []
    return parse_nouns(sections["substantive"])


def enrich_word(german: str, english: str, article: str = "") -> dict:
    g = normalize_german(german)
    key = g.lower()
    if key in OVERRIDES:
        english, syns = OVERRIDES[key]
    else:
        syns = []
        if "," in english:
            parts = [p.strip() for p in english.split(",")]
            english = parts[0]
            syns = parts[1:]
    entry = {"german": g, "english": english.strip(), "article": article or ""}
    if syns:
        entry["synonyms"] = syns
    return entry


def collect_module(mod_num: int, mod_id: str, text: str) -> list:
    seen = set()
    words = []

    def add(german, english, article="", synonyms=None):
        g = normalize_german(german)
        if not g or len(g) > 50 or is_garbage(g):
            return
        key = g.lower()
        if key in seen:
            return
        seen.add(key)
        w = enrich_word(g, english, article)
        if synonyms:
            w["synonyms"] = synonyms
        words.append(w)

    for w in parse_modul_nouns(text):
        add(w["german"], w["english"], w.get("article", ""))

    for p in CURATED_EXTRA.get(mod_id, []):
        add(p["german"], p["english"], p.get("article", ""))

    if mod_num == 6:
        for g, e, a, syns in MODUL_6:
            add(g, e, a, syns)

    return words


def is_garbage(g: str) -> bool:
    if re.search(r"[æøåÆØÅ]", g):
        return True
    if re.search(r"[a-z]{4,}[A-ZÄÖÜ]", g):
        return True
    if re.search(r"(truende|kontrolle|overfalde|voldelig|henrette|mistever|banegård)", g, re.I):
        return True
    return False


def main():
    vocab = json.loads((ROOT / "vocabulary.json").read_text(encoding="utf-8"))
    vocab["words"] = [w for w in vocab["words"] if not str(w.get("id", "")).startswith("exam_")]

    existing = {w["german"].lower(): w for w in vocab["words"]}
    modules_out = []
    idx = 0

    for num, mod_id, mod_name in MODULE_META:
        path = DOCX[num - 1][1]
        if not Path(path).exists():
            print("Missing", path)
            continue
        text = extract_docx(path)
        entries = collect_module(num, mod_id, text)
        word_ids = []

        for w in entries:
            gl = w["german"].lower()
            if gl in existing:
                wid = existing[gl]["id"]
                ex = existing[gl]
                ex["english"] = w["english"]
                if w.get("synonyms"):
                    ex["synonyms"] = w["synonyms"]
                ex["module"] = mod_id
            else:
                wid = f"exam_{mod_id}_{idx:04d}"
                idx += 1
                new_w = {
                    "id": wid,
                    "german": w["german"],
                    "english": w["english"],
                    "category": "exam",
                    "module": mod_id,
                    "difficulty": "intermediate",
                    "article": w.get("article", ""),
                    "exampleSentence": "",
                }
                if w.get("synonyms"):
                    new_w["synonyms"] = w["synonyms"]
                vocab["words"].append(new_w)
                existing[gl] = new_w
            word_ids.append(wid)

        modules_out.append({"id": mod_id, "name": mod_name, "wordIds": word_ids})
        print(f"{mod_name}: {len(word_ids)} words")

    vocab["modules"] = modules_out
    (ROOT / "vocabulary.json").write_text(json.dumps(vocab, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "exam-modules.json").write_text(
        json.dumps({"modules": modules_out}, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    print("Done. Total words:", len(vocab["words"]))


if __name__ == "__main__":
    main()
