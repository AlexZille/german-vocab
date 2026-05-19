# Testing the German Vocab Trainer

## Quick Start (Easiest Method)

### Option 1: Python HTTP Server (Recommended)

1. **Open a terminal/command prompt** in this directory
2. **Run the server script:**
   ```bash
   python start_server.py
   ```
   Or if you have Python 3:
   ```bash
   python3 start_server.py
   ```

3. **Open your browser** and go to: `http://localhost:8000`

The script will automatically try to open your browser. If it doesn't, manually navigate to the URL.

**To stop the server:** Press `Ctrl+C` in the terminal

---

### Option 2: Python Built-in Server

If the script doesn't work, use Python's built-in server:

```bash
# Python 3
python -m http.server 8000

# Or Python 2 (if Python 3 not available)
python -m SimpleHTTPServer 8000
```

Then open: `http://localhost:8000`

---

### Option 3: Node.js HTTP Server

If you have Node.js installed:

```bash
# Install http-server globally (one time)
npm install -g http-server

# Run the server
http-server -p 8000
```

Then open: `http://localhost:8000`

---

### Option 4: VS Code Live Server Extension

If you're using VS Code:

1. Install the "Live Server" extension
2. Right-click on `index.html`
3. Select "Open with Live Server"

---

## Why Do We Need a Server?

The app uses the `fetch()` API to load `vocabulary.json`. Browsers block this when opening files directly (`file://` protocol) due to security restrictions. A local web server solves this.

## Testing Checklist

Once the server is running:

- [ ] **Page loads** - You see the German Vocab Trainer interface
- [ ] **Microphone permission** - Browser asks for microphone access (click "Allow")
- [ ] **Start Practice** - Click "Start Practice" button
- [ ] **Hear German word** - App speaks a German word
- [ ] **Speech recognition** - Status shows "Listening..."
- [ ] **Speak Danish translation** - Say the Danish word (e.g., "hus" for "Haus")
- [ ] **Get feedback** - App tells you if correct/incorrect
- [ ] **Statistics** - Check Statistics tab to see progress
- [ ] **Settings** - Adjust mastery threshold, TTS speed, etc.

## Troubleshooting

### "Vocabulary not loaded yet"
- Make sure the server is running
- Check browser console (F12) for errors
- Verify `vocabulary.json` is in the same directory

### "Speech recognition not supported"
- Use Chrome or Edge browser (best support)
- Make sure you're using `http://localhost:8000` (not `file://`)

### "No speech detected"
- Check microphone permissions in browser settings
- Speak clearly and wait for "Listening..." status
- Try speaking louder or closer to microphone

### Port Already in Use
- Change the port number in `start_server.py` (line 10)
- Or close the application using that port

## Browser Compatibility

- ✅ **Chrome/Edge**: Full support (recommended)
- ✅ **Firefox**: Should work (may need HTTPS for some features)
- ⚠️ **Safari**: Limited speech recognition support

## Testing Speech Recognition

1. Start practice session
2. Wait for "Listening..." status
3. Speak clearly: "hus" (for Haus), "vand" (for Wasser), etc.
4. The app should recognize your Danish answer

## Testing Statistics

1. Practice a few words correctly
2. Go to Statistics tab
3. You should see:
   - Words mastered count increasing
   - Mastery percentage updating
   - Words learned today
   - List of mastered words

## Need Help?

- Check browser console (F12 → Console tab) for errors
- Make sure all files are in the same directory:
  - index.html
  - styles.css
  - app.js
  - vocabulary.json
  - start_server.py
