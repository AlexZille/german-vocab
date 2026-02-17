// App State
let vocabulary = [];
let currentWord = null;
let currentWordIndex = 0;
let sessionWords = [];
let isListening = false;
let recognition = null;
let ttsQueueBusy = false;
let waitingForNextWord = false;
let chromeTtsTimer = null;
let lastInterimResult = '';
let interimTimeout = null;
let mediaRecorder = null;
let audioChunks = [];
let microphoneStream = null;
let userProgress = {
    masteredWords: [],
    statistics: {
        totalMastered: 0,
        totalAvailable: 0,
        masteryPercentage: 0,
        streakDays: 0,
        wordsLearnedToday: 0,
        wordsLearnedThisWeek: 0,
        accuracyRate: 0,
        totalCorrect: 0,
        totalAttempts: 0
    },
    categoryStats: {},
    lastPracticeDate: null
};

// Settings
let settings = {
    masteryThreshold: 3,
    ttsSpeed: 1.0,
    wordsPerSession: 20,
    openaiApiKey: '',
    useWhisper: false,
    excludedCategories: ['places', 'names'],
    enableDictionary: false
};

// Initialize App
async function init() {
    await loadVocabulary();
    loadCustomWords();
    applyWordOverrides();
    applyDeletedWords();
    loadProgress();
    loadSettings();
    
    // Load voices before setting up recognition
    if ('speechSynthesis' in window) {
        // Chrome needs this to load voices
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }
    
    setupSpeechRecognition();
    updateStatistics();
    updateUI();
    
    // Pre-warm microphone so voice-activated mics stay open
    preWarmMicrophone();
    
    // Event listeners
    document.getElementById('startBtn').addEventListener('click', startPractice);
    document.getElementById('repeatBtn').addEventListener('click', repeatWord);
    document.getElementById('stopBtn').addEventListener('click', stopPractice);
    
    document.getElementById('wordSearchInput').addEventListener('input', (e) => {
        renderWordSearch(e.target.value.trim().toLowerCase());
    });
    document.getElementById('markAllKnownBtn').addEventListener('click', markAllAsKnown);
    document.getElementById('bulkImportBtn').addEventListener('click', bulkImportKnownWords);
    document.getElementById('addSingleWordBtn').addEventListener('click', addSingleWord);
    document.getElementById('bulkAddWordsBtn').addEventListener('click', bulkAddWords);
    
    // Settings listeners
    document.getElementById('masteryThreshold').addEventListener('change', (e) => {
        settings.masteryThreshold = parseInt(e.target.value);
        saveSettings();
    });
    
    document.getElementById('ttsSpeed').addEventListener('input', (e) => {
        settings.ttsSpeed = parseFloat(e.target.value);
        document.getElementById('ttsSpeedValue').textContent = settings.ttsSpeed.toFixed(1) + 'x';
        saveSettings();
    });
    
    document.getElementById('wordsPerSession').addEventListener('change', (e) => {
        settings.wordsPerSession = parseInt(e.target.value);
        saveSettings();
    });
    
    document.getElementById('openaiApiKey').addEventListener('change', (e) => {
        settings.openaiApiKey = e.target.value.trim();
        saveSettings();
        updateWhisperStatus();
    });
    
    document.getElementById('useWhisper').addEventListener('change', (e) => {
        settings.useWhisper = e.target.checked;
        saveSettings();
        updateWhisperStatus();
        if (settings.useWhisper && settings.openaiApiKey) {
            initMicrophone();
        }
    });

    // Dictionary toggle
    var dictToggle = document.getElementById('enableDictionary');
    if (dictToggle) {
        dictToggle.addEventListener('change', (e) => {
            settings.enableDictionary = e.target.checked;
            saveSettings();
            var dictSection = document.getElementById('dictionarySection');
            if (dictSection) dictSection.style.display = e.target.checked ? 'block' : 'none';
        });
    }

    // Dictionary lookup button
    var lookupBtn = document.getElementById('dictLookupBtn');
    if (lookupBtn) lookupBtn.addEventListener('click', lookupWord);
}

// Load Vocabulary
async function loadVocabulary() {
    try {
        const response = await fetch('vocabulary.json?v=' + Date.now());
        const data = await response.json();
        vocabulary = data.words;
        userProgress.statistics.totalAvailable = vocabulary.length;
    } catch (error) {
        console.error('Error loading vocabulary:', error);
        alert('Error loading vocabulary. Please refresh the page.');
    }
}

// Load Progress from LocalStorage
function loadProgress() {
    const saved = localStorage.getItem('germanVocabProgress');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            userProgress = { ...userProgress, ...parsed };
            // Ensure all required fields exist
            if (!userProgress.statistics) userProgress.statistics = {};
            if (!userProgress.categoryStats) userProgress.categoryStats = {};
        } catch (e) {
            console.error('Error loading progress:', e);
        }
    }
    
    // Migrate old danish data to english
    userProgress.masteredWords.forEach(w => {
        if (w.danish && !w.english) {
            w.english = w.danish;
            delete w.danish;
        }
    });
    
    // Update last practice date for streak calculation
    updateStreak();
}

// Save Progress to LocalStorage
function saveProgress() {
    localStorage.setItem('germanVocabProgress', JSON.stringify(userProgress));
    updateStatistics();
    updateUI();
}

// Load Settings
function loadSettings() {
    const saved = localStorage.getItem('germanVocabSettings');
    if (saved) {
        try {
            settings = { ...settings, ...JSON.parse(saved) };
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
    
    // Update UI with settings
    document.getElementById('masteryThreshold').value = settings.masteryThreshold;
    document.getElementById('ttsSpeed').value = settings.ttsSpeed;
    document.getElementById('ttsSpeedValue').textContent = settings.ttsSpeed.toFixed(1) + 'x';
    document.getElementById('wordsPerSession').value = settings.wordsPerSession;
    document.getElementById('openaiApiKey').value = settings.openaiApiKey || '';
    document.getElementById('useWhisper').checked = settings.useWhisper || false;
    updateWhisperStatus();

    // Dictionary toggle
    var dictToggle = document.getElementById('enableDictionary');
    if (dictToggle) dictToggle.checked = settings.enableDictionary || false;
    var dictSection = document.getElementById('dictionarySection');
    if (dictSection) dictSection.style.display = settings.enableDictionary ? 'block' : 'none';
    
    // Pre-initialize microphone if Whisper is enabled
    if (settings.useWhisper && settings.openaiApiKey) {
        initMicrophone();
    }
}

// Save Settings
function saveSettings() {
    localStorage.setItem('germanVocabSettings', JSON.stringify(settings));
}

// Setup Speech Recognition with improved settings
function debugLog(msg) {
    console.log('[DEBUG]', msg);
    const fb = document.getElementById('feedback');
    if (fb) fb.textContent = msg;
}

function setupSpeechRecognition() {
    const hasSR = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
    debugLog('Speech API available: ' + hasSR);
    
    if (!hasSR) {
        alert('Speech recognition is not supported in your browser. Please use Chrome.');
        return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    
    debugLog('Recognition object created');
    
    recognition.onstart = () => {
        isListening = true;
        debugLog('Recognition started - listening');
        updateStatus('listening', 'Listening...');
        const tips = document.getElementById('audioTips');
        if (tips) tips.style.display = 'none';
        setTimeout(() => {
            if (isListening) {
                updateStatus('listening', 'Speak now!');
            }
        }, 500);
    };
    
    recognition.onresult = (event) => {
        let bestResult = '';
        let bestConfidence = 0;
        
        // Check all results and alternatives for the best transcript
        for (let i = 0; i < event.results.length; i++) {
            for (let j = 0; j < event.results[i].length; j++) {
                const alt = event.results[i][j];
                if (!bestResult || (alt.confidence && alt.confidence > bestConfidence)) {
                    bestResult = alt.transcript.trim().toLowerCase();
                    bestConfidence = alt.confidence || 0.5;
                }
            }
            
            // If we get a final result, use it immediately
            if (event.results[i].isFinal) {
                clearTimeout(interimTimeout);
                lastInterimResult = '';
                
                // Check for voice commands before treating as an answer
                if (isRepeatCommand(bestResult)) {
                    document.getElementById('answerDisplay').textContent = 'Repeating word...';
                    repeatWord();
                    return;
                }
                
                handleAnswer(bestResult);
                return;
            }
        }
        
        // Interim result: store it and show what we're hearing
        if (bestResult) {
            lastInterimResult = bestResult;
            const expected = currentWord ? (currentWord.english || currentWord.danish || '') : '';
            
            // Show repeat command detection in UI
            if (isRepeatCommand(bestResult)) {
                document.getElementById('answerDisplay').textContent = `Hearing: "${bestResult}" (repeat command)`;
            } else {
                document.getElementById('answerDisplay').textContent = `Hearing: "${bestResult}" (say: "${expected}")`;
            }
            
            // If no final result comes within 2 seconds, accept the interim result
            clearTimeout(interimTimeout);
            interimTimeout = setTimeout(() => {
                if (lastInterimResult && currentWord && !waitingForNextWord) {
                    const result = lastInterimResult;
                    lastInterimResult = '';
                    try { recognition.stop(); } catch(e) {}
                    
                    // Check for repeat command on interim timeout too
                    if (isRepeatCommand(result)) {
                        document.getElementById('answerDisplay').textContent = 'Repeating word...';
                        repeatWord();
                        return;
                    }
                    
                    handleAnswer(result);
                }
            }, 2000);
        }
    };
    
    recognition.onerror = (event) => {
        debugLog('Recognition ERROR: ' + event.error);
        isListening = false;
        
        if (event.error === 'no-speech') {
            updateStatus('ready', 'No speech detected. Try again.');
            setTimeout(() => {
                if (currentWord && !waitingForNextWord) {
                    startListening();
                }
            }, 1500);
        } else if (event.error === 'audio-capture') {
            updateStatus('error', 'No microphone found. Please check your microphone.');
        } else if (event.error === 'not-allowed') {
            updateStatus('error', 'Microphone permission denied. Please allow microphone access.');
        } else if (event.error === 'aborted') {
            // Aborted is normal when we stop recognition intentionally
        } else {
            updateStatus('error', 'Recognition error. Try again.');
            setTimeout(() => {
                if (currentWord && !waitingForNextWord) {
                    startListening();
                }
            }, 1000);
        }
    };
    
    recognition.onend = () => {
        debugLog('Recognition ended');
        isListening = false;
        const tips = document.getElementById('audioTips');
        if (tips && currentWord) tips.style.display = 'block';
        
        // If we have an unprocessed interim result, use it as the answer
        if (lastInterimResult && currentWord && !waitingForNextWord) {
            clearTimeout(interimTimeout);
            const result = lastInterimResult;
            lastInterimResult = '';
            handleAnswer(result);
            return;
        }
        
        // Only auto-restart if we're still waiting for an answer (not transitioning)
        if (currentWord && !waitingForNextWord && document.getElementById('stopBtn').disabled === false) {
            setTimeout(() => {
                if (currentWord && !isListening && !waitingForNextWord) {
                    startListening();
                }
            }, 500);
        } else if (!currentWord) {
            updateStatus('ready', 'Ready');
            if (tips) tips.style.display = 'block';
        }
    };
}

// Start Practice Session
async function startPractice() {
    if (vocabulary.length === 0) {
        alert('Vocabulary not loaded yet. Please wait and try again.');
        return;
    }
    
    // Request microphone permission explicitly (needed for PWA on Android)
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Release immediately so SpeechRecognition can use the mic
        stream.getTracks().forEach(t => t.stop());
        // Small delay to let the mic fully release
        await new Promise(r => setTimeout(r, 300));
    } catch(err) {
        alert('Microphone access is required for this app. Please allow microphone permission and try again.');
        return;
    }
    
    // Get words for session (mix new and review)
    sessionWords = getSessionWords();
    
    if (sessionWords.length === 0) {
        alert('No words available for practice. All words may be mastered! Try adjusting your settings.');
        return;
    }
    
    currentWordIndex = 0;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('repeatBtn').disabled = false;
    document.getElementById('stopBtn').disabled = false;
    
    presentNextWord();
}

// Get words for session (prioritize words due for review, then new words)
function getSessionWords() {
    const wordsToPractice = [];
    const masteredIds = new Set(userProgress.masteredWords.map(w => w.wordId));
    const now = new Date();
    
    // Categories to skip
    const excludedCats = new Set((settings.excludedCategories || []).map(c => c.toLowerCase()));

    // Get words due for review (exclude manually marked words and excluded categories)
    const reviewWords = userProgress.masteredWords
        .filter(w => {
            if (w.manuallyMarked) return false;
            if (!w.nextReviewDate) return true;
            return new Date(w.nextReviewDate) <= now;
        })
        .map(w => {
            const vocabWord = vocabulary.find(v => v.id === w.wordId);
            return vocabWord ? { ...vocabWord, isReview: true, progressData: w } : null;
        })
        .filter(w => w !== null && !excludedCats.has((w.category || '').toLowerCase()));
    
    // Get IDs of manually marked words to fully exclude them
    const manuallyMarkedIds = new Set(
        userProgress.masteredWords.filter(w => w.manuallyMarked).map(w => w.wordId)
    );
    
    // Get new words not yet mastered (exclude manually marked + excluded categories)
    const newWords = vocabulary
        .filter(w => !masteredIds.has(w.id) && !manuallyMarkedIds.has(w.id) && !excludedCats.has((w.category || '').toLowerCase()))
        .slice(0, Math.floor(settings.wordsPerSession * 0.3)); // 30% new words
    
    // Mix: 70% review, 30% new
    const reviewCount = Math.min(reviewWords.length, Math.floor(settings.wordsPerSession * 0.7));
    wordsToPractice.push(...reviewWords.slice(0, reviewCount));
    wordsToPractice.push(...newWords);
    
    // Shuffle
    return shuffleArray(wordsToPractice).slice(0, settings.wordsPerSession);
}

// Shuffle array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Present Next Word
function presentNextWord() {
    if (currentWordIndex >= sessionWords.length) {
        stopPractice();
        alert(`Session complete! You practiced ${sessionWords.length} words.`);
        return;
    }
    
    waitingForNextWord = false;
    currentWord = sessionWords[currentWordIndex];
    currentWordIndex++;
    
    // Stop any active recognition before speaking
    if (recognition && isListening) {
        try { recognition.stop(); } catch(e) {}
        isListening = false;
    }
    
    // Display word
    document.getElementById('currentWord').textContent = currentWord.german;
    document.getElementById('wordInfo').textContent = currentWord.article ? 
        `${currentWord.article} ${currentWord.german}` : currentWord.german;
    document.getElementById('answerDisplay').textContent = '';
    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';
    
    updateProgressBar();
    
    // Speak word, then start listening when speech is actually done
    speakWord(currentWord.german, () => {
        if (currentWord && !waitingForNextWord) {
            startListening();
        }
    });
}

// Get best available voice for a language
function getBestVoice(lang) {
    const voices = window.speechSynthesis.getVoices();
    // Filter voices by language
    const langVoices = voices.filter(voice => voice.lang.startsWith(lang));
    
    if (langVoices.length === 0) {
        return null; // Use default
    }
    
    // Prefer local voices over remote ones
    const localVoices = langVoices.filter(v => v.localService);
    if (localVoices.length > 0) {
        // Prefer female voices (often sound better)
        const femaleVoice = localVoices.find(v => v.name.toLowerCase().includes('female') || 
                                                   v.name.toLowerCase().includes('zira') ||
                                                   v.name.toLowerCase().includes('karen'));
        return femaleVoice || localVoices[0];
    }
    
    return langVoices[0];
}

// Test Audio - detailed diagnostics
async function testAudio() {
    const display = document.getElementById('answerDisplay');
    const status = document.getElementById('feedback');
    status.className = 'feedback';
    let results = [];
    
    // Test 1: Basic beep via AudioContext
    display.textContent = 'Test 1/3: Playing beep sound...';
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        await ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.5;
        osc.frequency.value = 440;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        await new Promise(r => setTimeout(r, 800));
        osc.stop();
        await ctx.close();
        results.push('Beep: played (did you hear it?)');
    } catch(e) {
        results.push('Beep: FAILED - ' + e.message);
    }
    await new Promise(r => setTimeout(r, 500));
    
    // Test 2: speechSynthesis
    display.textContent = 'Test 2/3: speechSynthesis...';
    try {
        window.speechSynthesis.cancel();
        await new Promise(r => setTimeout(r, 200));
        const voices = window.speechSynthesis.getVoices();
        results.push('Voices found: ' + voices.length);
        
        const u = new SpeechSynthesisUtterance('Hello test');
        u.lang = 'en-US';
        u.volume = 1;
        
        let spoke = false;
        u.onstart = () => { spoke = true; };
        u.onerror = (e) => { results.push('Speech error: ' + (e.error || 'unknown')); };
        
        window.speechSynthesis.speak(u);
        await new Promise(r => setTimeout(r, 2500));
        
        results.push('Speech started: ' + spoke);
        results.push('Speaking: ' + window.speechSynthesis.speaking);
        results.push('Pending: ' + window.speechSynthesis.pending);
        results.push('Paused: ' + window.speechSynthesis.paused);
        window.speechSynthesis.cancel();
    } catch(e) {
        results.push('speechSynthesis: FAILED - ' + e.message);
    }
    await new Promise(r => setTimeout(r, 500));
    
    // Test 3: speechSynthesis after resume (in case it's paused)
    display.textContent = 'Test 3/3: speechSynthesis with resume...';
    try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        await new Promise(r => setTimeout(r, 300));
        
        const u2 = new SpeechSynthesisUtterance('Can you hear me now?');
        u2.lang = 'en-US';
        u2.volume = 1;
        window.speechSynthesis.speak(u2);
        window.speechSynthesis.resume();
        await new Promise(r => setTimeout(r, 3000));
        window.speechSynthesis.cancel();
    } catch(e) {
        results.push('Resume test: FAILED - ' + e.message);
    }
    
    // Show all results
    display.textContent = 'Results:';
    status.textContent = results.join(' | ');
    status.style.fontSize = '12px';
    console.log('Audio test results:', results);
}

// Core TTS - uses speechSynthesis with proper cleanup
function doSpeak(text, lang, rate, onDone) {
    if (!('speechSynthesis' in window)) {
        if (onDone) onDone();
        return;
    }
    
    window.speechSynthesis.cancel();
    
    setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;
        utterance.volume = 1;
        
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            const v = getBestVoice(lang.substring(0, 2));
            if (v) utterance.voice = v;
        }
        
        let done = false;
        function finish() {
            if (done) return;
            done = true;
            clearTimeout(safetyTimeout);
            ttsQueueBusy = false;
            if (onDone) setTimeout(onDone, 150);
        }
        
        const safetyTimeout = setTimeout(finish, 5000);
        utterance.onend = () => finish();
        utterance.onerror = () => finish();
        
        ttsQueueBusy = true;
        window.speechSynthesis.speak(utterance);
    }, 150);
}

// Speak German word
function speakWord(word, onDone) {
    doSpeak(word, 'de-DE', settings.ttsSpeed, onDone);
}

// Speak English feedback (Correct / Incorrect)
function speakFeedback(text, onDone) {
    doSpeak(text, 'en-US', 1.0, onDone);
}

// Pre-warm microphone - keeps voice-activated mics from needing a "wake" word
async function preWarmMicrophone() {
    // On Android/mobile, keeping getUserMedia open blocks SpeechRecognition
    // Only pre-warm on desktop where voice-activated mics need it
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
        console.log('Mobile detected - skipping mic pre-warm (not needed)');
        return;
    }
    
    try {
        if (!microphoneStream) {
            microphoneStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true } 
            });
            console.log('Microphone pre-warmed and ready');
        }
    } catch (e) {
        console.log('Microphone pre-warm not available:', e.message);
    }
}

// Initialize microphone for Whisper recording
async function initMicrophone() {
    await preWarmMicrophone();
}

// Start Whisper-based listening (record audio, send to API)
function startWhisperListening() {
    if (!microphoneStream || waitingForNextWord) return;
    
    isListening = true;
    audioChunks = [];
    updateStatus('listening', 'Listening... Speak now');
    const tips = document.getElementById('audioTips');
    if (tips) tips.style.display = 'none';
    
    try {
        mediaRecorder = new MediaRecorder(microphoneStream, { mimeType: 'audio/webm' });
    } catch (e) {
        // Fallback mime type
        mediaRecorder = new MediaRecorder(microphoneStream);
    }
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };
    
    mediaRecorder.onstop = async () => {
        if (audioChunks.length === 0 || waitingForNextWord) {
            isListening = false;
            return;
        }
        
        updateStatus('processing', 'Processing speech...');
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        
        const transcription = await sendToWhisperAPI(audioBlob);
        isListening = false;
        
        if (transcription && currentWord && !waitingForNextWord) {
            document.getElementById('answerDisplay').textContent = `You said: "${transcription}"`;
            handleAnswer(transcription);
        } else if (currentWord && !waitingForNextWord) {
            updateStatus('ready', 'Could not understand. Try again.');
            setTimeout(() => {
                if (currentWord && !waitingForNextWord) startListening();
            }, 1000);
        }
    };
    
    mediaRecorder.start();
    
    // Record for 3 seconds (enough for a single word), then stop
    setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }, 3000);
}

// Send audio to OpenAI Whisper API
async function sendToWhisperAPI(audioBlob) {
    try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'en');
        formData.append('response_format', 'text');
        
        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.openaiApiKey}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Whisper API error:', response.status, errorText);
            if (response.status === 401) {
                updateWhisperStatus('Invalid API key');
            }
            return null;
        }
        
        const text = await response.text();
        return text.trim().toLowerCase().replace(/[.!?,]/g, '');
    } catch (e) {
        console.error('Whisper API call failed:', e);
        return null;
    }
}

// Update Whisper status indicator
function updateWhisperStatus(message) {
    const statusDiv = document.getElementById('whisperStatus');
    if (!statusDiv) return;
    
    if (settings.useWhisper && settings.openaiApiKey) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(76, 175, 80, 0.1)';
        statusDiv.style.color = '#4CAF50';
        statusDiv.textContent = message || 'Whisper enabled - enhanced recognition active';
    } else if (settings.useWhisper && !settings.openaiApiKey) {
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(255, 152, 0, 0.1)';
        statusDiv.style.color = '#FF9800';
        statusDiv.textContent = message || 'Please enter your OpenAI API key above';
    } else {
        statusDiv.style.display = 'block';
        statusDiv.style.background = 'rgba(158, 158, 158, 0.1)';
        statusDiv.style.color = '#9E9E9E';
        statusDiv.textContent = 'Using browser speech recognition';
    }
}

// Start Listening - chooses Whisper or Web Speech API
function startListening() {
    if (waitingForNextWord) return;
    
    // Brief wait if TTS is still busy (max 3 retries)
    if (ttsQueueBusy) {
        if (!startListening._retries) startListening._retries = 0;
        startListening._retries++;
        if (startListening._retries < 6) {
            setTimeout(() => startListening(), 300);
            return;
        }
        // Force reset after too many retries
        ttsQueueBusy = false;
    }
    startListening._retries = 0;
    
    // Release any open mic stream so SpeechRecognition can use it (Android fix)
    if (microphoneStream && !settings.useWhisper) {
        microphoneStream.getTracks().forEach(t => t.stop());
        microphoneStream = null;
    }
    
    // Use Whisper if enabled and configured
    if (settings.useWhisper && settings.openaiApiKey && microphoneStream) {
        startWhisperListening();
        return;
    }
    
    // Web Speech API
    if (!recognition) {
        setupSpeechRecognition();
    }
    if (!recognition || isListening) return;
    
    lastInterimResult = '';
    clearTimeout(interimTimeout);
    
    try {
        debugLog('Calling recognition.start()...');
        recognition.start();
        debugLog('recognition.start() called OK');
    } catch (e) {
        debugLog('recognition.start() FAILED: ' + e.message);
        isListening = false;
        setupSpeechRecognition();
        setTimeout(() => {
            if (currentWord && !isListening && !waitingForNextWord) {
                try { recognition.start(); } catch(e2) {
                    debugLog('Retry also failed: ' + e2.message);
                }
            }
        }, 300);
    }
}

// Repeat Word
// Check if spoken text is a repeat/replay command
function isRepeatCommand(text) {
    const cleaned = text.toLowerCase().trim();
    const repeatPhrases = [
        'repeat', 'please repeat', 'repeat please', 'repeat word',
        'say again', 'say it again', 'again', 'one more time',
        'repeat that', 'can you repeat', 'could you repeat',
        'say that again', 'come again', 'pardon', 'replay'
    ];
    return repeatPhrases.some(phrase => cleaned === phrase || cleaned === phrase + '.');
}

function repeatWord() {
    if (currentWord) {
        // Stop recognition while repeating
        if (recognition && isListening) {
            try { recognition.stop(); } catch(e) {}
            isListening = false;
        }
        speakWord(currentWord.german, () => {
            if (currentWord && !waitingForNextWord) {
                startListening();
            }
        });
    }
}

// Stop Practice
function stopPractice() {
    currentWord = null;
    currentWordIndex = 0;
    sessionWords = [];
    waitingForNextWord = false;
    
    if (recognition && isListening) {
        try { recognition.stop(); } catch(e) {}
    }
    isListening = false;
    
    // Stop Whisper recording if active
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        audioChunks = [];
        mediaRecorder.stop();
    }
    
    // Stop all TTS and clean up
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    ttsQueueBusy = false;
    lastInterimResult = '';
    clearTimeout(interimTimeout);
    if (chromeTtsTimer) {
        clearInterval(chromeTtsTimer);
        chromeTtsTimer = null;
    }
    
    document.getElementById('startBtn').disabled = false;
    document.getElementById('repeatBtn').disabled = true;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('currentWord').textContent = 'Click Start to begin';
    document.getElementById('wordInfo').textContent = '';
    document.getElementById('answerDisplay').textContent = '';
    document.getElementById('feedback').textContent = '';
    document.getElementById('feedback').className = 'feedback';
    updateStatus('ready', 'Ready');
    updateProgressBar();
}

// Handle Answer
function handleAnswer(userAnswer) {
    if (!currentWord || waitingForNextWord) return;
    
    // Stop listening while we process and give feedback
    waitingForNextWord = true;
    lastInterimResult = '';
    clearTimeout(interimTimeout);
    if (recognition && isListening) {
        try { recognition.stop(); } catch(e) {}
        isListening = false;
    }
    
    const correctAnswer = (currentWord.english || currentWord.danish || '').toLowerCase().trim();
    const synonyms = (currentWord.synonyms || []).map(s => s.toLowerCase().trim());
    const normalizedUserAnswer = userAnswer.toLowerCase().trim();
    
    document.getElementById('answerDisplay').textContent = `You said: "${userAnswer}" (expected: "${correctAnswer}")`;
    
    const isCorrect = checkAnswer(normalizedUserAnswer, correctAnswer, synonyms);
    console.log(`Recognition: "${userAnswer}" -> cleaned: "${cleanText(userAnswer)}" | expected: "${correctAnswer}" | match: ${isCorrect}`);
    
    userProgress.statistics.totalAttempts++;
    
    if (isCorrect) {
        userProgress.statistics.totalCorrect++;
        handleCorrectAnswer();
    } else {
        handleIncorrectAnswer(correctAnswer);
    }
    
    userProgress.statistics.accuracyRate = 
        userProgress.statistics.totalCorrect / userProgress.statistics.totalAttempts;
    
    saveProgress();
}

// Clean English text for comparison - strip filler words and articles
function cleanText(text) {
    let cleaned = text.toLowerCase().trim();
    cleaned = cleaned.replace(/[.!?,;:'"()]/g, '');
    
    // Remove common lead-in phrases people use to activate their mic
    const leadInPhrases = [
        'the answer is ', 'the word is ', 'my answer is ', 'i think the answer is ',
        'i think the word is ', 'i think it is ', 'i think it\'s ', 'i believe it is ',
        'i believe it\'s ', 'i believe the answer is ', 'i say ', 'i said ',
        'it is ', 'it\'s ', 'that is ', 'that\'s ', 'that would be ',
        'the translation is ', 'it means ', 'this means ', 'it should be ',
        'i would say ', 'my guess is ', 'i guess ', 'i guess it\'s ',
        'okay ', 'ok ', 'well ', 'so ', 'hmm ', 'um ', 'uh ',
        'the ', 'a ', 'an '
    ];
    
    // Try removing lead-in phrases (longest first to avoid partial matches)
    let foundPrefix = true;
    while (foundPrefix) {
        foundPrefix = false;
        for (const phrase of leadInPhrases) {
            if (cleaned.startsWith(phrase)) {
                cleaned = cleaned.slice(phrase.length);
                foundPrefix = true;
                break;
            }
        }
    }
    
    cleaned = cleaned.trim();
    return cleaned;
}

// Generate English word variants (plural, articles, common forms)
function getEnglishVariants(word) {
    const variants = [word];
    
    // Plurals
    variants.push(word + 's');
    variants.push(word + 'es');
    if (word.endsWith('y')) variants.push(word.slice(0, -1) + 'ies');
    
    // Strip plurals
    if (word.endsWith('s')) variants.push(word.slice(0, -1));
    if (word.endsWith('es')) variants.push(word.slice(0, -2));
    if (word.endsWith('ies')) variants.push(word.slice(0, -3) + 'y');
    
    // With/without articles
    variants.push('the ' + word);
    variants.push('a ' + word);
    variants.push('an ' + word);
    
    return variants;
}

// Check Answer (with smart English matching + synonyms)
function checkAnswer(userAnswer, correctAnswer, synonyms) {
    const cleanUser = cleanText(userAnswer);
    synonyms = synonyms || [];
    
    // Build all acceptable answers: correct answer + all synonyms
    const allAcceptable = [correctAnswer, ...synonyms];
    
    for (const acceptable of allAcceptable) {
        const cleanCorrect = cleanText(acceptable);
        
        // Exact match
        if (cleanUser === cleanCorrect) return true;
        
        // Check if any word the user said matches or its variants
        const userWords = cleanUser.split(/\s+/);
        const correctVariants = getEnglishVariants(cleanCorrect);
        
        for (const userWord of userWords) {
            for (const variant of correctVariants) {
                if (userWord === variant) return true;
            }
        }
        
        // Check if user's full phrase matches a variant
        for (const variant of correctVariants) {
            if (cleanUser === variant) return true;
        }
        
        // Check reverse variants
        const userVariants = userWords.flatMap(w => getEnglishVariants(w));
        if (userVariants.includes(cleanCorrect)) return true;
        
        // Fuzzy match each word
        for (const userWord of userWords) {
            const distance = levenshteinDistance(userWord, cleanCorrect);
            const maxLength = Math.max(userWord.length, cleanCorrect.length);
            const similarity = 1 - (distance / maxLength);
            if (similarity > 0.7) return true;
        }
        
        // Fuzzy match the whole cleaned input
        const wholeDistance = levenshteinDistance(cleanUser, cleanCorrect);
        const wholeMaxLength = Math.max(cleanUser.length, cleanCorrect.length);
        const wholeSimilarity = 1 - (wholeDistance / wholeMaxLength);
        if (wholeSimilarity > 0.65) return true;
    }
    
    return false;
}

// Levenshtein Distance
function levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[str2.length][str1.length];
}

// Handle Correct Answer
function handleCorrectAnswer() {
    updateStatus('success', 'Correct!');
    document.getElementById('feedback').textContent = 'Correct! ✓';
    document.getElementById('feedback').className = 'feedback correct';
    
    updateWordProgress(true);
    
    // Speak feedback, then move to next word when speech is done
    speakFeedback('Correct', () => {
        setTimeout(() => presentNextWord(), 800);
    });
}

// Handle Incorrect Answer
function handleIncorrectAnswer(correctAnswer) {
    updateStatus('error', 'Incorrect');
    document.getElementById('feedback').textContent = `Incorrect. Correct answer: "${correctAnswer}"`;
    document.getElementById('feedback').className = 'feedback incorrect';
    
    updateWordProgress(false);
    
    // Say "Incorrect", then say the correct answer, then move to next word
    speakFeedback('Incorrect. The answer is ' + correctAnswer, () => {
        setTimeout(() => presentNextWord(), 1000);
    });
}

// Update Word Progress
function updateWordProgress(isCorrect) {
    const wordId = currentWord.id;
    let wordProgress = userProgress.masteredWords.find(w => w.wordId === wordId);
    
    if (!wordProgress) {
        // New word
        wordProgress = {
            wordId: wordId,
            german: currentWord.german,
            english: currentWord.english || currentWord.danish || '',
            category: currentWord.category,
            correctCount: 0,
            incorrectCount: 0,
            lastPracticed: new Date().toISOString(),
            timesReviewed: 0
        };
        userProgress.masteredWords.push(wordProgress);
    }
    
    if (isCorrect) {
        wordProgress.correctCount++;
        wordProgress.lastPracticed = new Date().toISOString();
        wordProgress.timesReviewed++;
        
        // Check if mastered
        if (wordProgress.correctCount >= settings.masteryThreshold && 
            !wordProgress.masteredDate) {
            wordProgress.masteredDate = new Date().toISOString();
            wordProgress.nextReviewDate = calculateNextReviewDate(1);
            userProgress.statistics.wordsLearnedToday++;
            updateStreak();
        } else if (wordProgress.masteredDate) {
            // Update review date using spaced repetition
            const interval = calculateReviewInterval(wordProgress);
            wordProgress.nextReviewDate = calculateNextReviewDate(interval);
        }
    } else {
        wordProgress.incorrectCount++;
        // Reset mastery if too many mistakes
        if (wordProgress.incorrectCount > wordProgress.correctCount * 2 && 
            wordProgress.masteredDate) {
            // Remove from mastered but keep progress
            wordProgress.masteredDate = null;
            wordProgress.nextReviewDate = null;
        }
    }
    
    // Update category stats
    updateCategoryStats();
}

// Calculate Next Review Date (Spaced Repetition)
function calculateNextReviewDate(intervalDays) {
    const date = new Date();
    date.setDate(date.getDate() + intervalDays);
    return date.toISOString();
}

// Calculate Review Interval (Simple spaced repetition)
function calculateReviewInterval(wordProgress) {
    // Simple algorithm: 1, 3, 7, 14, 30 days
    const intervals = [1, 3, 7, 14, 30];
    const timesReviewed = wordProgress.timesReviewed || 0;
    return intervals[Math.min(timesReviewed, intervals.length - 1)];
}

// Update Category Stats
function updateCategoryStats() {
    const categories = {};
    vocabulary.forEach(word => {
        if (!categories[word.category]) {
            categories[word.category] = { total: 0, mastered: 0 };
        }
        categories[word.category].total++;
    });
    
    userProgress.masteredWords.forEach(w => {
        if (w.masteredDate && categories[w.category]) {
            categories[w.category].mastered++;
        }
    });
    
    userProgress.categoryStats = categories;
}

// Update Streak
function updateStreak() {
    const today = new Date().toISOString().split('T')[0];
    const lastPractice = userProgress.lastPracticeDate;
    
    if (lastPractice === today) {
        // Already practiced today
        return;
    }
    
    if (!lastPractice) {
        // First practice
        userProgress.statistics.streakDays = 1;
    } else {
        const lastDate = new Date(lastPractice);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
            // Consecutive day
            userProgress.statistics.streakDays++;
        } else if (diffDays > 1) {
            // Streak broken
            userProgress.statistics.streakDays = 1;
        }
    }
    
    userProgress.lastPracticeDate = today;
}

// Update Statistics
function updateStatistics() {
    const mastered = userProgress.masteredWords.filter(w => w.masteredDate);
    userProgress.statistics.totalMastered = mastered.length;
    
    // Update total available if vocabulary loaded
    if (vocabulary.length > 0) {
        userProgress.statistics.totalAvailable = vocabulary.length;
    }
    
    userProgress.statistics.masteryPercentage = 
        userProgress.statistics.totalAvailable > 0 ?
        Math.round((userProgress.statistics.totalMastered / userProgress.statistics.totalAvailable) * 100) : 0;
    
    // Count words learned this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    userProgress.statistics.wordsLearnedThisWeek = mastered.filter(w => 
        w.masteredDate && new Date(w.masteredDate) >= weekAgo
    ).length;
}

// Update UI
function updateUI() {
    // Update header
    document.getElementById('totalMastered').textContent = userProgress.statistics.totalMastered;
    
    // Update statistics screen
    updateStatisticsScreen();
}

// Update Statistics Screen
function updateStatisticsScreen() {
    document.getElementById('statTotalMastered').textContent = userProgress.statistics.totalMastered;
    document.getElementById('statMasteryPercentage').textContent = 
        userProgress.statistics.masteryPercentage + '%';
    document.getElementById('statStreak').textContent = userProgress.statistics.streakDays;
    document.getElementById('statToday').textContent = userProgress.statistics.wordsLearnedToday;
    document.getElementById('statTotalWords').textContent = vocabulary.length;
    
    // Category stats
    const categoryStatsDiv = document.getElementById('categoryStats');
    categoryStatsDiv.innerHTML = '<h3>Category Progress</h3>';
    
    Object.entries(userProgress.categoryStats).forEach(([category, stats]) => {
        const div = document.createElement('div');
        div.className = 'category-stat-item';
        div.innerHTML = `
            <span>${category.charAt(0).toUpperCase() + category.slice(1)}</span>
            <span>${stats.mastered} / ${stats.total}</span>
        `;
        categoryStatsDiv.appendChild(div);
    });
    
    // Mastered words list
    const masteredList = document.getElementById('masteredWordsList');
    masteredList.innerHTML = '';
    
    const mastered = userProgress.masteredWords
        .filter(w => w.masteredDate)
        .sort((a, b) => new Date(b.masteredDate) - new Date(a.masteredDate))
        .slice(0, 50); // Show last 50
    
    if (mastered.length === 0) {
        masteredList.innerHTML = '<p style="color: var(--text-secondary);">No words mastered yet. Start practicing!</p>';
    } else {
        mastered.forEach(word => {
            const div = document.createElement('div');
            div.className = 'word-item';
            const date = new Date(word.masteredDate).toLocaleDateString();
            div.innerHTML = `
                <span class="word-item-german">${word.german}</span>
                <span class="word-item-danish">${word.english || word.danish || ''}</span>
                <span class="word-item-date">${date}</span>
            `;
            masteredList.appendChild(div);
        });
    }
}

// Update Status
function updateStatus(status, text) {
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    dot.className = 'status-dot ' + status;
    statusText.textContent = text;
}

// Update Progress Bar
function updateProgressBar() {
    const progress = sessionWords.length > 0 ? 
        (currentWordIndex / sessionWords.length) * 100 : 0;
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('sessionProgress').textContent = 
        `${currentWordIndex} / ${sessionWords.length}`;
}

// Show Screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'statsScreen') {
        updateStatisticsScreen();
        renderWordSearch('');
        renderCustomWordsList();
    }
    if (screenId === 'settingsScreen') {
        renderCategorySettings();
    }
}

// Render word search results for marking as known
function renderWordSearch(query) {
    const container = document.getElementById('wordSearchResults');
    const masteredIds = new Set(userProgress.masteredWords.filter(w => w.masteredDate).map(w => w.wordId));
    
    let words = vocabulary;
    if (query) {
        words = vocabulary.filter(w => 
            w.german.toLowerCase().includes(query) || 
            (w.english || '').toLowerCase().includes(query) ||
            (w.synonyms || []).some(s => s.toLowerCase().includes(query))
        );
    }
    
    if (words.length === 0) {
        container.innerHTML = '<p style="color: var(--text-tertiary); padding: 10px;">No words found.</p>';
        return;
    }
    
    container.innerHTML = words.map(w => {
        const isKnown = masteredIds.has(w.id);
        const synText = w.synonyms && w.synonyms.length > 0 ? ` <span style="color:var(--text-tertiary);font-size:11px;">(${w.synonyms.join(', ')})</span>` : '';
        return `
            <div id="wordRow_${w.id}" style="padding: 10px 4px; border-bottom: 1px solid var(--border-color);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1; min-width: 0;">
                        <span style="font-weight: 600; color: var(--text-primary);">${w.german}</span>
                        <span style="color: var(--text-secondary); margin-left: 8px;">${w.english || ''}</span>${synText}
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0;">
                        <button onclick="startEditWord('${w.id}')" 
                            style="padding: 5px 10px; border: 1px solid var(--accent); border-radius: 6px; font-size: 11px; 
                            cursor: pointer; background: transparent; color: var(--accent);">
                            Edit
                        </button>
                        <button onclick="deleteWord('${w.id}')" 
                            style="padding: 5px 10px; border: 1px solid var(--error, #e85a5a); border-radius: 6px; font-size: 11px; 
                            cursor: pointer; background: transparent; color: var(--error, #e85a5a);">
                            Del
                        </button>
                        <button onclick="markWordAsKnown('${w.id}')" 
                            style="padding: 5px 10px; border: 1px solid ${isKnown ? 'var(--success)' : 'var(--border-color)'}; 
                            border-radius: 6px; font-size: 11px; cursor: pointer; 
                            background: ${isKnown ? 'var(--success-bg)' : 'var(--bg-tertiary)'}; 
                            color: ${isKnown ? 'var(--success)' : 'var(--text-secondary)'};">
                            ${isKnown ? '✓ Known' : 'Known'}
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

// Edit any word inline in the word search list
function startEditWord(wordId) {
    const word = vocabulary.find(v => v.id === wordId);
    if (!word) return;
    
    const container = document.getElementById('wordRow_' + wordId);
    if (!container) return;
    
    const inputStyle = 'width:100%;padding:7px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-secondary);color:var(--text-primary);outline:none;';
    
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; gap: 6px;">
                <input type="text" id="editW_german_${wordId}" value="${word.german}" placeholder="German" style="${inputStyle} flex:1;">
                <input type="text" id="editW_english_${wordId}" value="${word.english || ''}" placeholder="English" style="${inputStyle} flex:1;">
            </div>
            <input type="text" id="editW_synonyms_${wordId}" value="${(word.synonyms || []).join(', ')}" 
                placeholder="Synonyms (comma-separated, optional)" style="${inputStyle}">
            <div style="display: flex; gap: 6px;">
                <select id="editW_article_${wordId}" style="${inputStyle} flex:1;">
                    <option value="" ${!word.article ? 'selected' : ''}>No article</option>
                    <option value="der" ${word.article === 'der' ? 'selected' : ''}>der</option>
                    <option value="die" ${word.article === 'die' ? 'selected' : ''}>die</option>
                    <option value="das" ${word.article === 'das' ? 'selected' : ''}>das</option>
                </select>
                <button onclick="saveEditWord('${wordId}')" 
                    style="padding: 7px 14px; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; 
                    background: var(--accent); color: white; font-weight: 600; white-space: nowrap;">
                    Save
                </button>
                <button onclick="cancelEditWord()" 
                    style="padding: 7px 14px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; 
                    cursor: pointer; background: transparent; color: var(--text-secondary); white-space: nowrap;">
                    Cancel
                </button>
            </div>
        </div>
    `;
}

function saveEditWord(wordId) {
    const german = document.getElementById('editW_german_' + wordId).value.trim();
    const english = document.getElementById('editW_english_' + wordId).value.trim();
    const synonymsRaw = document.getElementById('editW_synonyms_' + wordId).value.trim();
    const article = document.getElementById('editW_article_' + wordId).value;
    
    if (!german || !english) {
        alert('German word and English translation are required.');
        return;
    }
    
    const synonyms = synonymsRaw ? synonymsRaw.split(',').map(s => s.trim()).filter(s => s) : [];
    
    // Update in live vocabulary
    const vocabWord = vocabulary.find(v => v.id === wordId);
    if (vocabWord) {
        vocabWord.german = german;
        vocabWord.english = english;
        vocabWord.synonyms = synonyms.length > 0 ? synonyms : undefined;
        vocabWord.article = article || '';
    }
    
    // If it's a custom word, also update persistent storage
    const customWords = getCustomWords();
    const customWord = customWords.find(w => w.id === wordId);
    if (customWord) {
        customWord.german = german;
        customWord.english = english;
        customWord.synonyms = synonyms.length > 0 ? synonyms : undefined;
        customWord.article = article || '';
        saveCustomWords(customWords);
    } else {
        // Built-in word edited: save overrides to localStorage
        let overrides = getWordOverrides();
        overrides[wordId] = { german, english, synonyms: synonyms.length > 0 ? synonyms : undefined, article: article || '' };
        saveWordOverrides(overrides);
    }
    
    // Update mastered words if present
    const masteredWord = userProgress.masteredWords.find(w => w.wordId === wordId);
    if (masteredWord) {
        masteredWord.german = german;
        masteredWord.english = english;
        saveProgress();
    }
    
    const query = document.getElementById('wordSearchInput').value.trim().toLowerCase();
    renderWordSearch(query);
}

function cancelEditWord() {
    const query = document.getElementById('wordSearchInput').value.trim().toLowerCase();
    renderWordSearch(query);
}

// Persistent overrides for built-in vocabulary edits
function getWordOverrides() {
    try {
        return JSON.parse(localStorage.getItem('germanVocabOverrides') || '{}');
    } catch(e) {
        return {};
    }
}

function saveWordOverrides(overrides) {
    localStorage.setItem('germanVocabOverrides', JSON.stringify(overrides));
}

function applyWordOverrides() {
    const overrides = getWordOverrides();
    for (const [wordId, changes] of Object.entries(overrides)) {
        const word = vocabulary.find(v => v.id === wordId);
        if (word) {
            if (changes.german) word.german = changes.german;
            if (changes.english) word.english = changes.english;
            if (changes.synonyms !== undefined) word.synonyms = changes.synonyms;
            if (changes.article !== undefined) word.article = changes.article;
        }
    }
}

// Mark or unmark a single word as known
function markWordAsKnown(wordId) {
    const vocabWord = vocabulary.find(v => v.id === wordId);
    if (!vocabWord) return;
    
    let wordProgress = userProgress.masteredWords.find(w => w.wordId === wordId);
    
    // If already manually marked, toggle it OFF
    if (wordProgress && wordProgress.manuallyMarked) {
        wordProgress.manuallyMarked = false;
        wordProgress.masteredDate = null;
        wordProgress.correctCount = 0;
        wordProgress.nextReviewDate = null;
        saveProgress();
        const query = document.getElementById('wordSearchInput').value.trim().toLowerCase();
        renderWordSearch(query);
        return;
    }
    
    if (!wordProgress) {
        wordProgress = {
            wordId: wordId,
            german: vocabWord.german,
            english: vocabWord.english || '',
            category: vocabWord.category,
            correctCount: settings.masteryThreshold,
            incorrectCount: 0,
            lastPracticed: new Date().toISOString(),
            timesReviewed: settings.masteryThreshold
        };
        userProgress.masteredWords.push(wordProgress);
    }
    
    wordProgress.masteredDate = new Date().toISOString();
    wordProgress.correctCount = Math.max(wordProgress.correctCount, settings.masteryThreshold);
    wordProgress.nextReviewDate = null;
    wordProgress.manuallyMarked = true;
    
    saveProgress();
    
    const query = document.getElementById('wordSearchInput').value.trim().toLowerCase();
    renderWordSearch(query);
}

// Mark ALL words as known
function markAllAsKnown() {
    if (!confirm('Are you sure you want to mark ALL ' + vocabulary.length + ' words as known?')) return;
    
    vocabulary.forEach(vocabWord => {
        let wordProgress = userProgress.masteredWords.find(w => w.wordId === vocabWord.id);
        
        if (!wordProgress) {
            wordProgress = {
                wordId: vocabWord.id,
                german: vocabWord.german,
                english: vocabWord.english || '',
                category: vocabWord.category,
                correctCount: settings.masteryThreshold,
                incorrectCount: 0,
                lastPracticed: new Date().toISOString(),
                timesReviewed: settings.masteryThreshold
            };
            userProgress.masteredWords.push(wordProgress);
        }
        
        wordProgress.masteredDate = new Date().toISOString();
        wordProgress.correctCount = Math.max(wordProgress.correctCount, settings.masteryThreshold);
        wordProgress.nextReviewDate = null;
        wordProgress.manuallyMarked = true;
    });
    
    saveProgress();
    
    const query = document.getElementById('wordSearchInput').value.trim().toLowerCase();
    renderWordSearch(query);
}

// Bulk import: mark multiple words as known from pasted text
function bulkImportKnownWords() {
    const textarea = document.getElementById('bulkImportText');
    const text = textarea.value.trim();
    if (!text) return;
    
    const lines = text.split(/[\n,;]+/).map(l => l.trim().toLowerCase()).filter(l => l.length > 0);
    let matched = 0;
    
    lines.forEach(line => {
        const vocabWord = vocabulary.find(v => 
            v.german.toLowerCase() === line || 
            (v.english || '').toLowerCase() === line ||
            (v.synonyms || []).some(s => s.toLowerCase() === line)
        );
        
        if (vocabWord) {
            let wordProgress = userProgress.masteredWords.find(w => w.wordId === vocabWord.id);
            
            if (!wordProgress) {
                wordProgress = {
                    wordId: vocabWord.id,
                    german: vocabWord.german,
                    english: vocabWord.english || '',
                    category: vocabWord.category,
                    correctCount: settings.masteryThreshold,
                    incorrectCount: 0,
                    lastPracticed: new Date().toISOString(),
                    timesReviewed: settings.masteryThreshold
                };
                userProgress.masteredWords.push(wordProgress);
            }
            
            wordProgress.masteredDate = new Date().toISOString();
            wordProgress.correctCount = Math.max(wordProgress.correctCount, settings.masteryThreshold);
            wordProgress.nextReviewDate = null;
            wordProgress.manuallyMarked = true;
            matched++;
        }
    });
    
    saveProgress();
    
    const resultDiv = document.getElementById('bulkImportResult');
    const unmatched = lines.length - matched;
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `<span style="color: var(--success);">${matched} words marked as known.</span>` +
        (unmatched > 0 ? `<br><span style="color: var(--text-tertiary);">${unmatched} words not found in vocabulary.</span>` : '');
    
    textarea.value = '';
    
    const query = document.getElementById('wordSearchInput').value.trim().toLowerCase();
    renderWordSearch(query);
    updateStatistics();
}

// =====================
// ADD CUSTOM WORDS
// =====================

function getCustomWords() {
    try {
        return JSON.parse(localStorage.getItem('germanVocabCustomWords') || '[]');
    } catch(e) {
        return [];
    }
}

function saveCustomWords(words) {
    localStorage.setItem('germanVocabCustomWords', JSON.stringify(words));
}

function addWordToVocabulary(german, english, synonyms, article) {
    const id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    const newWord = {
        id: id,
        german: german.trim(),
        english: english.trim(),
        category: 'custom',
        difficulty: 'beginner',
        article: article || '',
        exampleSentence: ''
    };
    
    if (synonyms && synonyms.length > 0) {
        newWord.synonyms = synonyms;
    }
    
    // Check for duplicate
    const existsExact = vocabulary.find(v => 
        v.german.toLowerCase() === newWord.german.toLowerCase() && 
        (v.english || '').toLowerCase() === newWord.english.toLowerCase()
    );
    if (existsExact) return { duplicate: true, existing: existsExact };
    
    const existsGerman = vocabulary.find(v => 
        v.german.toLowerCase() === newWord.german.toLowerCase()
    );
    if (existsGerman) return { duplicate: true, existing: existsGerman };
    
    // Add to live vocabulary
    vocabulary.push(newWord);
    userProgress.statistics.totalAvailable = vocabulary.length;
    
    // Save to custom words storage
    const customWords = getCustomWords();
    customWords.push(newWord);
    saveCustomWords(customWords);
    
    return newWord;
}

function addSingleWord() {
    const german = document.getElementById('newGerman').value.trim();
    const english = document.getElementById('newEnglish').value.trim();
    const synonymsRaw = document.getElementById('newSynonyms').value.trim();
    const article = document.getElementById('newArticle').value;
    const resultDiv = document.getElementById('addWordResult');
    
    if (!german || !english) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color: var(--error);">Please enter both a German word and English translation.</span>';
        return;
    }
    
    const synonyms = synonymsRaw ? synonymsRaw.split(',').map(s => s.trim()).filter(s => s) : [];
    
    const result = addWordToVocabulary(german, english, synonyms, article);
    
    resultDiv.style.display = 'block';
    if (result && result.duplicate) {
        const e = result.existing;
        const synText = e.synonyms && e.synonyms.length > 0 ? ` (synonyms: ${e.synonyms.join(', ')})` : '';
        resultDiv.innerHTML = `<span style="color: #e8a33a;">⚠ "<strong>${e.german}</strong>" already exists as: <strong>${e.english || ''}</strong>${synText}</span>`;
    } else if (result) {
        resultDiv.innerHTML = `<span style="color: var(--success);">Added: <strong>${german}</strong> = ${english}</span>`;
        document.getElementById('newGerman').value = '';
        document.getElementById('newEnglish').value = '';
        document.getElementById('newSynonyms').value = '';
        document.getElementById('newArticle').value = '';
        renderCustomWordsList();
    }
}

function bulkAddWords() {
    const textarea = document.getElementById('bulkAddText');
    const text = textarea.value.trim();
    const resultDiv = document.getElementById('bulkAddResult');
    
    if (!text) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color: var(--error);">Please paste some words first.</span>';
        return;
    }
    
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let added = 0;
    let duplicates = 0;
    let errors = 0;
    
    lines.forEach(line => {
        // Expected format: German = English  OR  German = English, synonym1, synonym2
        const parts = line.split('=').map(p => p.trim());
        if (parts.length < 2 || !parts[0] || !parts[1]) {
            errors++;
            return;
        }
        
        const german = parts[0];
        const englishParts = parts[1].split(',').map(p => p.trim()).filter(p => p);
        const english = englishParts[0];
        const synonyms = englishParts.slice(1);
        
        const result = addWordToVocabulary(german, english, synonyms, '');
        if (result && result.duplicate) {
            duplicates++;
        } else if (result) {
            added++;
        }
    });
    
    resultDiv.style.display = 'block';
    let msg = `<span style="color: var(--success);">${added} words added.</span>`;
    if (duplicates > 0) msg += `<br><span style="color: var(--text-tertiary);">${duplicates} duplicates skipped.</span>`;
    if (errors > 0) msg += `<br><span style="color: var(--error);">${errors} lines couldn't be parsed (use format: German = English).</span>`;
    resultDiv.innerHTML = msg;
    
    if (added > 0) {
        textarea.value = '';
        renderCustomWordsList();
    }
}

function renderCustomWordsList() {
    const customWords = getCustomWords();
    const container = document.getElementById('customWordsList');
    const countSpan = document.getElementById('customWordCount');
    countSpan.textContent = `(${customWords.length})`;
    
    if (customWords.length === 0) {
        container.innerHTML = '<p style="color: var(--text-tertiary); padding: 10px;">No custom words added yet.</p>';
        return;
    }
    
    container.innerHTML = customWords.map(w => `
        <div id="customWord_${w.id}" style="padding: 10px 4px; border-bottom: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span style="font-weight: 600; color: var(--text-primary);">${w.german}</span>
                    <span style="color: var(--text-secondary); margin-left: 8px;">${w.english || ''}</span>
                    ${w.synonyms && w.synonyms.length > 0 ? `<span style="color: var(--text-tertiary); margin-left: 4px; font-size: 12px;">(${w.synonyms.join(', ')})</span>` : ''}
                </div>
                <div style="display: flex; gap: 6px;">
                    <button onclick="startEditCustomWord('${w.id}')" 
                        style="padding: 6px 14px; border: 1px solid var(--accent); border-radius: 6px; font-size: 12px; 
                        cursor: pointer; background: transparent; color: var(--accent);">
                        Edit
                    </button>
                    <button onclick="removeCustomWord('${w.id}')" 
                        style="padding: 6px 14px; border: 1px solid var(--error, #e85a5a); border-radius: 6px; font-size: 12px; 
                        cursor: pointer; background: transparent; color: var(--error, #e85a5a);">
                        Remove
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function startEditCustomWord(wordId) {
    const customWords = getCustomWords();
    const word = customWords.find(w => w.id === wordId);
    if (!word) return;
    
    const container = document.getElementById('customWord_' + wordId);
    if (!container) return;
    
    const inputStyle = 'width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:13px;background:var(--bg-secondary);color:var(--text-primary);outline:none;';
    
    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; gap: 8px;">
                <input type="text" id="edit_german_${wordId}" value="${word.german}" placeholder="German" 
                    style="${inputStyle} flex:1;">
                <input type="text" id="edit_english_${wordId}" value="${word.english || ''}" placeholder="English" 
                    style="${inputStyle} flex:1;">
            </div>
            <input type="text" id="edit_synonyms_${wordId}" value="${(word.synonyms || []).join(', ')}" 
                placeholder="Synonyms (comma-separated)" style="${inputStyle}">
            <div style="display: flex; gap: 8px;">
                <select id="edit_article_${wordId}" style="${inputStyle} flex:1;">
                    <option value="" ${!word.article ? 'selected' : ''}>No article</option>
                    <option value="der" ${word.article === 'der' ? 'selected' : ''}>der (masculine)</option>
                    <option value="die" ${word.article === 'die' ? 'selected' : ''}>die (feminine)</option>
                    <option value="das" ${word.article === 'das' ? 'selected' : ''}>das (neuter)</option>
                </select>
                <button onclick="saveEditCustomWord('${wordId}')" 
                    style="padding: 8px 16px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; 
                    background: var(--accent); color: white; font-weight: 600;">
                    Save
                </button>
                <button onclick="renderCustomWordsList()" 
                    style="padding: 8px 16px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; 
                    cursor: pointer; background: transparent; color: var(--text-secondary);">
                    Cancel
                </button>
            </div>
        </div>
    `;
}

function saveEditCustomWord(wordId) {
    const german = document.getElementById('edit_german_' + wordId).value.trim();
    const english = document.getElementById('edit_english_' + wordId).value.trim();
    const synonymsRaw = document.getElementById('edit_synonyms_' + wordId).value.trim();
    const article = document.getElementById('edit_article_' + wordId).value;
    
    if (!german || !english) {
        alert('German word and English translation are required.');
        return;
    }
    
    const synonyms = synonymsRaw ? synonymsRaw.split(',').map(s => s.trim()).filter(s => s) : [];
    
    // Update in custom words storage
    const customWords = getCustomWords();
    const customWord = customWords.find(w => w.id === wordId);
    if (customWord) {
        customWord.german = german;
        customWord.english = english;
        customWord.synonyms = synonyms.length > 0 ? synonyms : undefined;
        customWord.article = article || '';
        saveCustomWords(customWords);
    }
    
    // Update in live vocabulary
    const vocabWord = vocabulary.find(v => v.id === wordId);
    if (vocabWord) {
        vocabWord.german = german;
        vocabWord.english = english;
        vocabWord.synonyms = synonyms.length > 0 ? synonyms : undefined;
        vocabWord.article = article || '';
    }
    
    // Update in mastered words if present
    const masteredWord = userProgress.masteredWords.find(w => w.wordId === wordId);
    if (masteredWord) {
        masteredWord.german = german;
        masteredWord.english = english;
        saveProgress();
    }
    
    renderCustomWordsList();
}

function removeCustomWord(wordId) {
    // Remove from custom words storage
    let customWords = getCustomWords();
    customWords = customWords.filter(w => w.id !== wordId);
    saveCustomWords(customWords);
    
    // Remove from live vocabulary
    const idx = vocabulary.findIndex(v => v.id === wordId);
    if (idx !== -1) vocabulary.splice(idx, 1);
    userProgress.statistics.totalAvailable = vocabulary.length;
    
    // Also remove from mastered words if present
    userProgress.masteredWords = userProgress.masteredWords.filter(w => w.wordId !== wordId);
    saveProgress();
    
    renderCustomWordsList();
}

// Export all known/mastered words to clipboard for transfer to a new version
function exportKnownWords() {
    const mastered = userProgress.masteredWords.filter(w => w.masteredDate);
    const resultDiv = document.getElementById('exportResult');
    
    if (mastered.length === 0) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color: var(--error, #e85a5a);">No known words to export yet.</span>';
        return;
    }
    
    const wordList = mastered.map(w => w.german).join('\n');
    
    // Always show the words in a visible textarea so the user can copy
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = `
        <span style="color: var(--success); font-weight: 600;">${mastered.length} known words ready!</span>
        <span style="color: var(--text-secondary); display: block; margin-top: 4px; font-size: 12px;">
            Text is selected below. Press Ctrl+C (or long-press > Copy on phone) to copy, then paste into "Bulk Import Known Words" on your new version.
        </span>
        <textarea id="exportTextArea" readonly rows="10" 
            style="width: 100%; margin-top: 8px; padding: 10px 12px; border: 2px solid var(--success, #4CAF50); 
            border-radius: 8px; font-size: 14px; background: var(--bg-secondary); color: var(--text-primary); 
            outline: none; resize: vertical; font-family: inherit;">${wordList}</textarea>`;
    
    // Auto-select all text so user just needs to copy
    setTimeout(function() {
        var ta = document.getElementById('exportTextArea');
        if (ta) {
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, ta.value.length);
        }
    }, 100);
    
    // Also try clipboard API in background (works on HTTPS/PWA)
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(wordList).then(function() {
                var span = resultDiv.querySelector('span');
                if (span) span.innerHTML = mastered.length + ' words copied to clipboard!';
            }).catch(function() {});
        }
    } catch(e) {}
}

// =====================
// DELETE WORDS
// =====================

function getDeletedWords() {
    try {
        return JSON.parse(localStorage.getItem('germanVocabDeletedWords') || '[]');
    } catch(e) {
        return [];
    }
}

function saveDeletedWords(ids) {
    localStorage.setItem('germanVocabDeletedWords', JSON.stringify(ids));
}

function applyDeletedWords() {
    const deleted = new Set(getDeletedWords());
    if (deleted.size > 0) {
        vocabulary = vocabulary.filter(w => !deleted.has(w.id));
        userProgress.statistics.totalAvailable = vocabulary.length;
    }
}

function deleteWord(wordId) {
    var word = vocabulary.find(function(v) { return v.id === wordId; });
    var label = word ? word.german + ' (' + (word.english || '') + ')' : wordId;
    if (!confirm('Delete "' + label + '" from vocabulary?')) return;

    // If custom word, remove from custom storage
    var customWords = getCustomWords();
    var isCustom = customWords.some(function(w) { return w.id === wordId; });
    if (isCustom) {
        customWords = customWords.filter(function(w) { return w.id !== wordId; });
        saveCustomWords(customWords);
    } else {
        // Built-in word: add to deleted list
        var deleted = getDeletedWords();
        if (deleted.indexOf(wordId) === -1) {
            deleted.push(wordId);
            saveDeletedWords(deleted);
        }
    }

    // Remove from live vocabulary
    var idx = vocabulary.findIndex(function(v) { return v.id === wordId; });
    if (idx !== -1) vocabulary.splice(idx, 1);
    userProgress.statistics.totalAvailable = vocabulary.length;

    // Remove from mastered words
    userProgress.masteredWords = userProgress.masteredWords.filter(function(w) { return w.wordId !== wordId; });
    saveProgress();

    // Re-render
    var query = document.getElementById('wordSearchInput').value.trim().toLowerCase();
    renderWordSearch(query);
    renderCustomWordsList();
}

// =====================
// DICTIONARY LOOKUP
// =====================

function lookupWord() {
    var input = document.getElementById('dictLookupInput');
    var word = input.value.trim();
    var resultDiv = document.getElementById('dictLookupResult');

    if (!word) {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color: var(--error, #e85a5a);">Please enter a German word.</span>';
        return;
    }

    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<span style="color: var(--text-secondary);">Looking up "' + word + '"...</span>';

    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(word) + '&langpair=de|en';

    fetch(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
                var translation = data.responseData.translatedText.trim();
                // Collect alternative translations from matches
                var alts = [];
                if (data.matches) {
                    data.matches.forEach(function(m) {
                        var t = m.translation.trim().toLowerCase();
                        if (t !== translation.toLowerCase() && t !== word.toLowerCase() && alts.indexOf(t) === -1) {
                            alts.push(t);
                        }
                    });
                }
                var altText = alts.slice(0, 5).join(', ');

                resultDiv.innerHTML = '<div style="margin-bottom: 8px;">' +
                    '<span style="color: var(--success); font-weight: 600;">' + word + '</span>' +
                    ' = <span style="color: var(--text-primary); font-weight: 600;">' + translation + '</span>' +
                    (altText ? '<br><span style="color: var(--text-tertiary); font-size: 12px;">Also: ' + altText + '</span>' : '') +
                    '</div>' +
                    '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
                    '<input type="text" id="dictTranslation" value="' + translation.replace(/"/g, '&quot;') + '" ' +
                    'placeholder="English translation" style="flex:1; min-width: 120px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; background: var(--bg-secondary); color: var(--text-primary); outline: none;">' +
                    '<input type="text" id="dictSynonyms" value="' + altText.replace(/"/g, '&quot;') + '" ' +
                    'placeholder="Synonyms (comma-separated)" style="flex:1; min-width: 120px; padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; background: var(--bg-secondary); color: var(--text-primary); outline: none;">' +
                    '</div>' +
                    '<button onclick="addDictWord(\'' + word.replace(/'/g, "\\'") + '\')" ' +
                    'style="margin-top: 8px; padding: 8px 16px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; background: var(--accent); color: white; font-weight: 600; width: 100%;">' +
                    'Add to Vocabulary</button>';
            } else {
                resultDiv.innerHTML = '<span style="color: var(--error, #e85a5a);">Could not find a translation for "' + word + '".</span>';
            }
        })
        .catch(function(err) {
            resultDiv.innerHTML = '<span style="color: var(--error, #e85a5a);">Network error. Check your internet connection.</span>';
        });
}

function addDictWord(german) {
    var english = document.getElementById('dictTranslation').value.trim();
    var synonymsRaw = document.getElementById('dictSynonyms').value.trim();
    var resultDiv = document.getElementById('dictLookupResult');

    if (!english) {
        alert('Please enter an English translation.');
        return;
    }

    var synonyms = synonymsRaw ? synonymsRaw.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }) : [];
    var result = addWordToVocabulary(german, english, synonyms, '');

    if (result && result.duplicate) {
        var e = result.existing;
        resultDiv.innerHTML = '<span style="color: #e8a33a;">"' + e.german + '" already exists as: ' + (e.english || '') + '</span>';
    } else if (result) {
        resultDiv.innerHTML = '<span style="color: var(--success);">Added: ' + german + ' = ' + english + '</span>';
        document.getElementById('dictLookupInput').value = '';
    }
}

// =====================
// CATEGORY SETTINGS
// =====================

function getAllCategories() {
    var cats = new Set();
    vocabulary.forEach(function(w) {
        if (w.category) cats.add(w.category.toLowerCase());
    });
    return Array.from(cats).sort();
}

function renderCategorySettings() {
    var container = document.getElementById('categoryCheckboxes');
    if (!container) return;
    var excluded = new Set((settings.excludedCategories || []).map(function(c) { return c.toLowerCase(); }));
    var cats = getAllCategories();

    container.innerHTML = cats.map(function(cat) {
        var checked = !excluded.has(cat);
        var label = cat.charAt(0).toUpperCase() + cat.slice(1);
        var count = vocabulary.filter(function(w) { return (w.category || '').toLowerCase() === cat; }).length;
        return '<label style="display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; font-size: 13px; white-space: nowrap; background: var(--bg-tertiary); border-radius: 6px; cursor: pointer;">' +
            '<input type="checkbox" ' + (checked ? 'checked' : '') + ' value="' + cat + '" ' +
            'onchange="toggleCategory(this)" style="width: auto; margin: 0;">' +
            '<span>' + label + ' (' + count + ')</span></label>';
    }).join('');
}

function toggleCategory(checkbox) {
    var cat = checkbox.value.toLowerCase();
    var excluded = (settings.excludedCategories || []).map(function(c) { return c.toLowerCase(); });

    if (checkbox.checked) {
        excluded = excluded.filter(function(c) { return c !== cat; });
    } else {
        if (excluded.indexOf(cat) === -1) excluded.push(cat);
    }

    settings.excludedCategories = excluded;
    saveSettings();
}

// Load custom words into vocabulary on startup
function loadCustomWords() {
    const customWords = getCustomWords();
    customWords.forEach(w => {
        if (!vocabulary.find(v => v.id === w.id)) {
            vocabulary.push(w);
        }
    });
    userProgress.statistics.totalAvailable = vocabulary.length;
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);
