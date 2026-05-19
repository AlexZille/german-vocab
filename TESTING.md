# German Vocab Trainer – Test Guide

## Download & use on your phone (recommended)

**Live app (works anywhere, no computer needed):**

### https://alexzille.github.io/german-vocab/

1. Open the link in **Chrome** (Android) or **Safari** (iPhone)
2. Allow **microphone** access when asked
3. **Install as app:**
   - **iPhone:** Share → **Add to Home Screen** → open from icon **German Vocab**
   - **Android:** Menu (⋮) → **Install app** (or use the Install button in the app)
4. On **Practice**, choose an **Exam module** (Modul 1–6) or leave “All words”
5. Tap **Start Practice** → hear German → say the **English** translation

---

## Test on your computer

### Option A: Double-click `start_server.bat`

Then open: http://localhost:8000

### Option B: Command line

```bash
python start_server.py
```

---

## Quick test checklist

- [ ] Page loads, title shows **German Vocab Trainer**
- [ ] Microphone permission granted
- [ ] **Start Practice** plays a German word
- [ ] Say the English answer (e.g. *house* for *Haus*)
- [ ] App shows correct / incorrect feedback
- [ ] **Exam module** dropdown lists Modul 1–6
- [ ] Selecting a module only practices words from that module
- [ ] **Statistics** shows progress after a few correct answers
- [ ] **Settings** → exam modules visible with word counts

---

## Exam modules included

| Module | Topic |
|--------|--------|
| Modul 1 | Verbrechen und Strafe |
| Modul 2 | Das Leben in der Großstadt |
| Modul 3 | Kindheit und Jugend in der NS-Zeit |
| Modul 4 | Nachkriegszeit |
| Modul 5 | Reisefreiheit |
| Modul 6 | Familienleben |

---

## Troubleshooting

### Microphone not working
- Use **Chrome** or **Edge** on desktop
- On phone, use the **HTTPS** live link (not `file://`)
- Check browser site settings → Microphone → Allow

### “No words available”
- You may have marked all words as known → Statistics → review mastered list
- Or try another exam module

### Old version / wrong language on phone
- Close the app completely and reopen https://alexzille.github.io/german-vocab/
- Clear browser cache for the site if needed

### Speech not recognized
- Speak clearly in **English**
- Reduce background noise
- Optional: Settings → enable **OpenAI Whisper** (requires API key)

---

## Browser support

| Browser | Speech | Install as app |
|---------|--------|----------------|
| Chrome (Android) | ✅ | ✅ |
| Safari (iPhone) | ✅ | ✅ (Add to Home Screen) |
| Chrome / Edge (PC) | ✅ | ✅ |
| Firefox | ⚠️ Limited | ⚠️ |

---

## Local HTTPS (optional, for phone on same Wi-Fi)

```bash
python start_server_https.py
```

Open on phone: `https://YOUR-PC-IP:8443` (accept security warning once)
