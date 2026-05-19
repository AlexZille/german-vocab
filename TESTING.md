# German Vocab Trainer – Test Guide

## Download & use on your phone (recommended)

**Live app (works anywhere, no computer needed):**

### https://alexzille.github.io/german-vocab/

---

## Install as app on your phone

### iPhone (Safari)

1. Open **https://alexzille.github.io/german-vocab/** in **Safari** (not Chrome)
2. Tap **Share** (square with arrow) at the bottom
3. Scroll down → **Add to Home Screen** → **Add**
4. Open **German Vocab** from your home screen
5. Allow **microphone** when asked

### Android (Chrome)

1. Open the link in **Chrome**
2. Tap **Install** in the banner, or menu **⋮** → **Install app** / **Add to Home screen**
3. Open the app from your home screen
4. Allow **microphone** when asked

---

## Get the newest version on your phone

If you already installed the app and want the latest fixes:

### All phones (easiest)

1. Open the app (or the link in the browser)
2. Go to **Settings** (bottom right)
3. Scroll down to **App on your phone**
4. Tap **Check for updates**
5. If you see a green **New version available** banner → tap **Update**

### iPhone extra tip

If something still looks old:

1. Close the app completely (swipe it away)
2. Open **Safari** → go to **https://alexzille.github.io/german-vocab/**
3. Pull down to **refresh** the page
4. Open the app again from the home screen icon

### Android extra tip

1. Chrome → **Settings** → **Site settings** → find the site → **Clear & reset**
2. Open the link again and reinstall if needed

**Current app version:** 11 (shown in Settings under “App on your phone”)

---

## Quick test checklist

- [ ] Page loads, title shows **German Vocab Trainer**
- [ ] Settings shows **Version 11**
- [ ] Microphone permission granted
- [ ] **Start Practice** plays a German word
- [ ] Say the English answer (e.g. *house* for *Haus*)
- [ ] **Exam module** dropdown lists Modul 1–6
- [ ] **Settings** → mastery threshold stays at your value after reload

---

## Test on your computer

### Option A: Double-click `start_server.bat`

Then open: http://localhost:8000

### Option B: Command line

```bash
python start_server.py
```

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

### Settings not saved
- Use version **11** or newer
- Change a setting, close the app fully, reopen — value should stay

### Old version / wrong language on phone
- Settings → **Check for updates**
- Or follow **Get the newest version** above

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
