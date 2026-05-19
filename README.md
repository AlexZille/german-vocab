# German Vocab Trainer

Practice **German → English** vocabulary with voice. Includes six exam modules for HF German exam preparation.

## Use on your phone

### [https://alexzille.github.io/german-vocab/](https://alexzille.github.io/german-vocab/)

1. Open in Chrome or Safari  
2. Allow microphone  
3. Install to home screen (see **Settings → Install app** in the app)  
4. Choose an exam module → **Start Practice**  
5. Hear German → say the English answer  

No computer required after install.

## Features

- Voice practice (German TTS, English speech recognition)
- Six pre-loaded **exam modules** (Modul 1–6)
- Progress tracking, statistics, mastered words
- Works offline after first load (PWA)
- Optional OpenAI Whisper for better recognition

## Local development

```bash
python start_server.py
# → http://localhost:8000
```

See [TESTING.md](TESTING.md) for full test instructions.

## Exam modules

1. Verbrechen und Strafe  
2. Das Leben in der Großstadt  
3. Kindheit und Jugend in der NS-Zeit  
4. Nachkriegszeit  
5. Reisefreiheit  
6. Familienleben  

## Tech

- Static HTML / CSS / JavaScript  
- Web Speech API  
- GitHub Pages hosting  
- Data stored in browser `localStorage`
