#!/usr/bin/env python3
"""Parse exam docx word lists and generate exam-modules.json + vocabulary additions."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTRACTED = ROOT / "_docx_extracted.json"
PAIRS_PATH = ROOT / "exam-word-pairs.json"
VOCAB_PATH = ROOT / "vocabulary.json"
OUT_MODULES = ROOT / "exam-modules.json"
OUT_WORDS = ROOT / "exam-vocabulary-additions.json"

MODULE_META = [
    (1, "modul-1", "Modul 1 – Verbrechen und Strafe"),
    (2, "modul-2", "Modul 2 – Das Leben in der Großstadt"),
    (3, "modul-3", "Modul 3 – Kindheit und Jugend in der NS-Zeit"),
    (4, "modul-4", "Modul 4 – Nachkriegszeit"),
    (5, "modul-5", "Modul 5 – Reisefreiheit"),
    (6, "modul-6", "Modul 6 – Familienleben"),
]

DA_CHARS = set("æøåÆØÅ")


def strip_header(text: str) -> str:
    for marker in ("1.Substantive", "Substantive", "Ordforråd", "Wortschatz"):
        idx = text.find(marker)
        if idx != -1 and "Substantive" in marker:
            return text[idx:]
    return text


def split_sections(text: str) -> dict:
    markers = [
        ("substantive", r"(?:1\.)?Substantive"),
        ("verben", r"(?:2\.)?Verben"),
        ("adjektive", r"(?:3\.)?Adjektive"),
        ("phrases", r"(?:4\.)?(?:Weitere?|Weitete)\s+Vokabel"),
    ]
    positions = []
    for key, pat in markers:
        m = re.search(pat, text, re.I)
        if m:
            positions.append((m.start(), key))
    positions.sort()
    sections = {}
    for i, (start, key) in enumerate(positions):
        end = positions[i + 1][0] if i + 1 < len(positions) else len(text)
        sections[key] = text[start:end]
    return sections


def article_from_gender(g: str) -> str:
    g = g.lower()
    if g.startswith("m") and "f" not in g[:3]:
        return "der"
    if g.startswith("f"):
        return "die"
    if g.startswith("n") or "plural" in g:
        return "das"
    return ""


def parse_nouns(section: str) -> list:
    body = re.sub(r"^(?:1\.)?Substantive", "", section, flags=re.I).strip()
    entries = []
    # Multi-word German nouns with (gender)
    pattern = re.compile(
        r"([A-ZÄÖÜ][\wäöüÄÖÜß\-]+(?:\s+(?:der|die|das|Weiße|kalte|schwarze|soziale|öffentlicher|eiserne|Berliner|Freie|politischer)?[\wäöüÄÖÜß\-]*)*)\s*\(([^)]+)\)\s*",
        re.UNICODE,
    )
    matches = list(pattern.finditer(body))
    for i, m in enumerate(matches):
        german = m.group(1).strip()
        gender = m.group(2).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        danish = body[start:end].strip()
        danish = re.sub(r"(Fortsæt selv|fortsæt selv).*$", "", danish, flags=re.I).strip()
        danish = re.sub(r"https?://\S+", "", danish).strip()
        if not danish or len(danish) < 2:
            continue
        # Trim long explanations – keep first sentence/clause
        if len(danish) > 120:
            danish = re.split(r"[.]\s+(?=[A-ZÆØÅ])", danish)[0]
            if len(danish) > 120:
                danish = danish[:120].rsplit(",", 1)[0]
        entries.append({
            "german": german,
            "english": danish,
            "article": article_from_gender(gender),
            "type": "noun",
        })
    return entries


VERB_STEM = (
    r"en|ieren|eln|schen|igen|nehmen|stehen|sprechen|töten|führen|lassen|brechen|"
    r"fallen|geben|morde|halten|finden|hören|forschen|dächtigen|haften|urteilen"
)
ADJ_STEM = r"lich|sam|ig|al|tätig|bar|haft|los|isch|end|frei|reich|fältig|eben"


def split_german_danish_pair(s: str) -> tuple:
    s = s.strip()
    if not s:
        return None, None
    if " *" in s:
        parts = s.split(" *", 1)
        return parts[0].strip(), parts[1].strip()
    for i in range(3, len(s)):
        if s[i].islower() or s[i] in DA_CHARS:
            left, right = s[:i].strip(), s[i:].strip()
            if len(left) >= 3 and len(right) >= 2:
                if re.match(r"^[\wäöüÄÖÜß\-]+$", left):
                    return left, right
    return s, ""


def parse_concat_pairs(body: str, stem_pattern: str) -> list:
    """Parse long concatenated german+danish+german+danish strings."""
    pat = re.compile(
        rf"([a-zäöüß]+(?:{stem_pattern}))"
        rf"([\wæøåÆØÅäöüÄÖÜß\-,\s\(\)]+?)"
        rf"(?=[a-zäöüß]+(?:{stem_pattern})|$)",
        re.UNICODE,
    )
    entries = []
    for m in pat.finditer(body):
        german = m.group(1).strip()
        danish = m.group(2).strip()
        danish = re.sub(r"\s*\*+\s*", "", danish).strip()
        danish = danish.split("(")[0].strip().rstrip("*/")
        if len(danish) < 2:
            continue
        entries.append({"german": german, "english": danish, "article": "", "type": "word"})
    return entries


def parse_verbs_adj(section: str, word_type: str) -> list:
    body = re.sub(r"^(?:[23]\.)?(?:Verben|Adjektive)", "", section, flags=re.I).strip()
    body = re.sub(r"\*=\s*uregelmæssigt\s+verb[^\w]*", "", body, flags=re.I)
    stem = VERB_STEM if word_type == "verb" else ADJ_STEM
    entries = parse_concat_pairs(body, stem)
    if entries:
        for e in entries:
            e["type"] = word_type
        return entries
    # Fallback: split on *
    for chunk in re.split(r"\s*\*\s*", body):
        chunk = chunk.strip()
        if not chunk or chunk.lower().startswith("uregelm"):
            continue
        german, danish = split_german_danish_pair(chunk)
        if german and danish:
            entries.append({
                "german": german,
                "english": danish.split("(")[0].strip().rstrip("*/"),
                "article": "",
                "type": word_type,
            })
    return entries


def parse_phrases(section: str) -> list:
    body = re.sub(r"^(?:4\.)?(?:Weitere?\s+Vokabel\w*)", "", section, flags=re.I).strip()
    body = re.sub(r"(Fortsæt selv|fortsæt selv).*$", "", body, flags=re.I)
    entries = []
    # Phrases often start with ein/einen/ins/jemanden/vor
    phrase_starts = re.compile(
        r"(ein |einen |eine |ins |im |vor |jemanden |Gewalt |Bewältigung |Aufarbeitung )",
        re.I,
    )
    parts = phrase_starts.split(body)
    if len(parts) <= 1:
        # fallback: split on * 
        for chunk in re.split(r"\s*\*\s*", body):
            g, d = split_german_danish_pair(chunk.strip())
            if g and d:
                entries.append({"german": g, "english": d, "article": "", "type": "phrase"})
        return entries
    i = 1
    while i < len(parts):
        prefix = parts[i] if i < len(parts) else ""
        rest = parts[i + 1] if i + 1 < len(parts) else ""
        chunk = (prefix + rest).strip()
        i += 2
        if not chunk:
            continue
        g, d = split_german_danish_pair(chunk)
        if g and d:
            entries.append({"german": g.strip(), "english": d.strip(), "article": "", "type": "phrase"})
    return entries


def parse_modul_6(text: str) -> list:
    """Module 6 uses Danish: German format."""
    entries = []
    text = re.sub(r"^Ordforråd[^S]*", "", text)
    section_markers = [
        ("substantive", "Substantive"),
        ("verben", "Verben"),
        ("adjektive", "Adjektive"),
        ("phrase", "Udtryk"),
    ]
    positions = []
    for key, label in section_markers:
        m = re.search(label, text, re.I)
        if m:
            positions.append((m.start(), m.end(), key))
    positions.sort()
    for i, (start, end, key) in enumerate(positions):
        body_start = end
        body_end = positions[i + 1][0] if i + 1 < len(positions) else len(text)
        body = text[body_start:body_end]
        # Split on Danish word before colon (lowercase start)
        chunks = re.split(r"(?=[a-zæøå][\wæøåÆØÅ]*\s*:)", body)
        for chunk in chunks:
            chunk = chunk.strip()
            if ":" not in chunk:
                continue
            danish_part, german_part = chunk.split(":", 1)
            danish_part = danish_part.strip()
            german_part = german_part.strip()
            gm = re.match(r"^(.+?)\s*\(([^)]+)\)", german_part)
            if gm:
                german = gm.group(1).strip()
                article = article_from_gender(gm.group(2))
            else:
                german = re.split(r",|\s+-\s+", german_part)[0].strip()
                article = ""
            if german and danish_part:
                entries.append({
                    "german": german,
                    "english": danish_part,
                    "article": article,
                    "type": key,
                })
    return entries


def load_supplement_pairs(mod_id: str) -> list:
    if not PAIRS_PATH.exists():
        return []
    data = json.loads(PAIRS_PATH.read_text(encoding="utf-8"))
    return data.get(mod_id, [])


def parse_module(key: str, text: str, mod_id: str) -> list:
    if key == "modul_6":
        words = parse_modul_6(text)
    else:
        text = strip_header(text)
        sections = split_sections(text)
        words = []
        if "substantive" in sections:
            words.extend(parse_nouns(sections["substantive"]))
        if "verben" in sections:
            words.extend(parse_verbs_adj(sections["verben"], "verb"))
        if "adjektive" in sections:
            words.extend(parse_verbs_adj(sections["adjektive"], "adjective"))
        if "phrases" in sections:
            words.extend(parse_phrases(sections["phrases"]))
    for w in load_supplement_pairs(mod_id):
        words.append({
            "german": w["german"],
            "english": w["english"],
            "article": w.get("article", ""),
            "type": "supplement",
        })
    return words


def normalize_german(g: str) -> str:
    g = g.strip()
    g = re.sub(r"^(der|die|das)\s+", "", g, flags=re.I)
    return g


def main():
    extracted = json.loads(EXTRACTED.read_text(encoding="utf-8"))
    vocab = json.loads(VOCAB_PATH.read_text(encoding="utf-8"))
    existing = {w["german"].lower(): w for w in vocab["words"]}

    modules_out = []
    new_words = []
    stats = {}

    for num, mod_id, mod_name in MODULE_META:
        key = f"modul_{num}"
        parsed = parse_module(key, extracted[key]["text"], mod_id)
        # Dedupe by german
        seen = set()
        unique = []
        for w in parsed:
            g = normalize_german(w["german"])
            if not g or g.lower() in seen:
                continue
            seen.add(g.lower())
            w["german"] = g
            unique.append(w)

        word_ids = []
        matched = 0
        added = 0
        for w in unique:
            gl = w["german"].lower()
            if gl in existing:
                wid = existing[gl]["id"]
                matched += 1
            else:
                wid = f"exam_{mod_id}_{len(new_words):04d}"
                entry = {
                    "id": wid,
                    "german": w["german"],
                    "english": w["english"],
                    "category": "exam",
                    "module": mod_id,
                    "difficulty": "intermediate",
                    "article": w.get("article", ""),
                    "exampleSentence": "",
                }
                new_words.append(entry)
                existing[gl] = entry
                added += 1
            word_ids.append(wid)

        modules_out.append({
            "id": mod_id,
            "name": mod_name,
            "wordIds": word_ids,
        })
        stats[mod_id] = {"total": len(word_ids), "matched": matched, "added": added, "parsed": len(parsed)}

    OUT_MODULES.write_text(
        json.dumps({"modules": modules_out}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    OUT_WORDS.write_text(json.dumps({"words": new_words}, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(stats, indent=2))
    print(f"New words: {len(new_words)}")
    print(f"Written: {OUT_MODULES}, {OUT_WORDS}")


if __name__ == "__main__":
    main()
