/*
 * Core Application Controller
 * Coordinates Drawing Canvas, Handwriting Recognition Engines, and Text-to-Speech Utilities.
 * Implements scroll-synchronized backdrop word highlighting, responsive voice settings, and custom animations.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const canvasEl = document.getElementById('drawing-canvas');
  const canvasContainer = document.getElementById('canvas-container-box');
  const textEditor = document.getElementById('text-editor');
  const textHighlights = document.getElementById('text-highlights');
  
  // Canvas Toolbar Controls
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');
  const penColorDots = document.querySelectorAll('.color-dot');
  const penWidthSelect = document.getElementById('pen-width');
  const paperGridSelect = document.getElementById('paper-grid');
  
  // App Toolbar Settings
  const languageSelect = document.getElementById('language-select');
  const autoRecognizeToggle = document.getElementById('auto-recognize-toggle');
  const btnRecognize = document.getElementById('btn-recognize');
  const networkBadge = document.getElementById('network-badge');
  const networkStatusText = document.getElementById('network-status-text');
  
  // Text-To-Speech Controls
  const btnSpeak = document.getElementById('btn-speak');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const voiceSelect = document.getElementById('voice-select');
  const rateSlider = document.getElementById('rate-slider');
  const rateValue = document.getElementById('rate-value');
  const pitchSlider = document.getElementById('pitch-slider');
  const pitchValue = document.getElementById('pitch-value');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeValue = document.getElementById('volume-value');
  const copyBtn = document.getElementById('btn-copy');
  
  // Speech Visualizer
  const visualizerWave = document.getElementById('speech-wave');
  const visualizerStatus = document.getElementById('visualizer-status-text');
  const visualizerStatusDot = document.getElementById('visualizer-status-dot');
  
  // --- State Variables ---
  let canvas = null;
  let recognizer = null;
  let autoRecognizeTimer = null;
  let isAutoRecognizeEnabled = true;
  
  // Speech state
  let currentUtterance = null;
  let isSpeaking = false;
  let isPaused = false;
  let systemVoices = [];

  // --- 1. Initialize Core Components ---
  
  // Network Change Handler
  const handleNetworkChange = (online) => {
    if (online) {
      networkBadge.className = 'status-badge online';
      networkStatusText.textContent = 'Online Mode';
      showToast('Connected to internet. High-accuracy handwriting API enabled.', 'success');
    } else {
      networkBadge.className = 'status-badge offline';
      networkStatusText.textContent = 'Offline Mode';
      showToast('Running offline. Switched to local Tesseract OCR engine.', 'warning');
    }
  };

  // Drawing Ended Callback
  const handleStrokeEnd = () => {
    updateCanvasControlState();
    
    // Clear existing timer
    if (autoRecognizeTimer) {
      clearTimeout(autoRecognizeTimer);
    }
    
    // If auto-recognize is enabled, trigger translation 2.0s after drawing stops
    if (isAutoRecognizeEnabled) {
      autoRecognizeTimer = setTimeout(() => {
        triggerRecognition();
      }, 2000);
    }
  };

  // Initialize Modules
  canvas = new window.HandwritingCanvas(canvasEl, canvasContainer, handleStrokeEnd);
  recognizer = new window.HandwritingRecognizer(handleNetworkChange);
  
  // Check initial connection status
  handleNetworkChange(navigator.onLine);
  updateCanvasControlState();

  // --- 2. Scroll-Synchronized Highlight Backdrop ---
  
  // Keep Textarea and Background Highlight div scrolls aligned 100% of the time
  textEditor.addEventListener('scroll', () => {
    textHighlights.scrollTop = textEditor.scrollTop;
    textHighlights.scrollLeft = textEditor.scrollLeft;
  });

  // Re-split and format characters into word blocks when user types or text changes
  const updateHighlightBackdrop = () => {
    const text = textEditor.value;
    
    // Split keeping whitespaces so text structure matches exactly
    const wordTokens = text.split(/(\s+)/);
    let charOffset = 0;
    
    const formattedHtml = wordTokens.map(token => {
      if (/\s+/.test(token)) {
        // Whitespace token
        charOffset += token.length;
        return token;
      } else {
        // Word token
        const start = charOffset;
        const end = charOffset + token.length;
        charOffset += token.length;
        return `<span class="word-span" data-start="${start}" data-end="${end}">${escapeHtml(token)}</span>`;
      }
    }).join('');
    
    textHighlights.innerHTML = formattedHtml;
  };

  textEditor.addEventListener('input', updateHighlightBackdrop);

  function escapeHtml(string) {
    return string
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- 3. Speech Synthesis Controls ---

  // Populate System Voices matching selected PWA language
  const populateVoiceList = () => {
    if (typeof speechSynthesis === 'undefined') return;
    
    systemVoices = window.speechSynthesis.getVoices();
    const currentLang = languageSelect.value;
    
    // Filter voices that support the current selected language
    // e.g. language 'en' should match 'en-US', 'en-GB', etc.
    let matchingVoices = systemVoices.filter(voice => 
      voice.lang.toLowerCase().startsWith(currentLang.toLowerCase())
    );
    
    // Fallback to all voices if no exact matches exist
    if (matchingVoices.length === 0) {
      matchingVoices = systemVoices;
    }
    
    voiceSelect.innerHTML = '';
    
    matchingVoices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' [Default]' : ''}`;
      option.value = voice.name;
      
      // Select browser default if available
      if (voice.default) {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });

    if (voiceSelect.options.length === 0 && systemVoices.length > 0) {
      // Fallback
      systemVoices.forEach(voice => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.value = voice.name;
        voiceSelect.appendChild(option);
      });
    }
  };

  // Wait for voices to load (different browsers load them asynchronously)
  if (typeof speechSynthesis !== 'undefined') {
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = populateVoiceList;
    }
    populateVoiceList();
  }

  // Speak Logic
  const startSpeech = (customText = null, charOffset = 0) => {
    const textToSpeak = customText !== null ? customText.trim() : textEditor.value.trim();
    if (!textToSpeak) {
      if (customText === null) {
        showToast('Text area is empty. Draw or type something first!', 'info');
      }
      return;
    }

    // Cancel active playback
    window.speechSynthesis.cancel();
    resetHighlightState();

    currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
    
    // Apply Settings
    const selectedVoiceName = voiceSelect.value;
    const selectedVoice = systemVoices.find(voice => voice.name === selectedVoiceName);
    if (selectedVoice) {
      currentUtterance.voice = selectedVoice;
    }
    
    currentUtterance.rate = parseFloat(rateSlider.value);
    currentUtterance.pitch = parseFloat(pitchSlider.value);
    currentUtterance.volume = parseFloat(volumeSlider.value);
    
    // Core Boundary Callback - Word Highlighting in real-time!
    currentUtterance.onboundary = (e) => {
      if (e.name !== 'word') return;
      const charIndex = charOffset + e.charIndex;
      
      const spans = textHighlights.querySelectorAll('.word-span');
      spans.forEach(span => {
        const start = parseInt(span.getAttribute('data-start'));
        const end = parseInt(span.getAttribute('data-end'));
        
        if (charIndex >= start && charIndex < end) {
          span.classList.add('highlighted');
          // Smooth scroll active word to view in editor
          span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          span.classList.remove('highlighted');
        }
      });
    };

    currentUtterance.onstart = () => {
      isSpeaking = true;
      isPaused = false;
      toggleVisualizer(true, 'Speaking...');
      btnSpeak.disabled = true;
      btnPause.disabled = false;
      btnStop.disabled = false;
    };

    currentUtterance.onend = () => {
      isSpeaking = false;
      isPaused = false;
      toggleVisualizer(false, 'Speech Finished');
      btnSpeak.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
      resetHighlightState();
    };

    currentUtterance.onerror = (e) => {
      if (e.error !== 'interrupted') {
        console.error('Speech synthesis error:', e);
        showToast('Speech engine error occurred.', 'error');
      }
      isSpeaking = false;
      isPaused = false;
      toggleVisualizer(false, 'Speech Error');
      btnSpeak.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
      resetHighlightState();
    };

    window.speechSynthesis.speak(currentUtterance);
  };

  const pauseSpeech = () => {
    if (isSpeaking && !isPaused) {
      window.speechSynthesis.pause();
      isPaused = true;
      toggleVisualizer(false, 'Paused');
      btnPause.innerHTML = '<i class="fas fa-play"></i> Resume';
    } else if (isSpeaking && isPaused) {
      window.speechSynthesis.resume();
      isPaused = false;
      toggleVisualizer(true, 'Speaking...');
      btnPause.innerHTML = '<i class="fas fa-pause"></i> Pause';
    }
  };

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    isPaused = false;
    toggleVisualizer(false, 'Stopped');
    btnSpeak.disabled = false;
    btnPause.disabled = true;
    btnPause.innerHTML = '<i class="fas fa-pause"></i> Pause';
    btnStop.disabled = true;
    resetHighlightState();
  };

  const resetHighlightState = () => {
    const spans = textHighlights.querySelectorAll('.word-span');
    spans.forEach(span => span.classList.remove('highlighted'));
  };

  const toggleVisualizer = (active, statusText) => {
    visualizerStatus.textContent = statusText;
    if (active) {
      visualizerWave.classList.add('animating');
      visualizerStatusDot.classList.add('active');
    } else {
      visualizerWave.classList.remove('animating');
      visualizerStatusDot.classList.remove('active');
    }
  };

  // --- 4. Call Handwriting Recognition ---
  const triggerRecognition = async () => {
    if (canvas.isEmpty()) {
      return;
    }

    btnRecognize.disabled = true;
    const originalBtnText = btnRecognize.innerHTML;
    btnRecognize.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';

    const selectedLang = languageSelect.value;
    
    // Offline status feedback callback
    const handleProgress = (progress) => {
      visualizerStatus.textContent = progress.message;
      if (progress.status === 'processing') {
        visualizerStatusDot.classList.add('active');
      }
    };

    try {
      const textResult = await recognizer.recognize(canvas, selectedLang, handleProgress);
      
      if (textResult) {
        // Retrieve current editor contents
        const currentText = textEditor.value;
        let startIndex = 0;
        
        // Formulate spacing nicely
        if (currentText === '') {
          textEditor.value = textResult;
          startIndex = 0;
        } else {
          // If there is existing text, append with a space
          const needsSpace = !currentText.endsWith(' ');
          textEditor.value = needsSpace ? currentText + ' ' + textResult : currentText + textResult;
          startIndex = currentText.length + (needsSpace ? 1 : 0);
        }
        
        // Sync highlights backdrop and trigger scrolling
        updateHighlightBackdrop();
        textEditor.scrollTop = textEditor.scrollHeight;
        textHighlights.scrollTop = textHighlights.scrollHeight;
        
        showToast('Handwriting added to reader.', 'info');
        
        // Auto convert to speech once text is detected!
        startSpeech(textResult, startIndex);
      }
      
      // Auto clear the canvas so the user can draw next block
      canvas.clear();
      updateCanvasControlState();
      
      if (!recognizer.isOnline) {
        visualizerStatus.textContent = 'Idle';
        visualizerStatusDot.classList.remove('active');
      }
    } catch (err) {
      showToast(err.message, 'error');
      visualizerStatus.textContent = 'Idle';
      visualizerStatusDot.classList.remove('active');
    } finally {
      btnRecognize.disabled = false;
      btnRecognize.innerHTML = originalBtnText;
    }
  };

  // --- 5. Event Listeners Coordination ---

  // Recognition manual trigger
  btnRecognize.addEventListener('click', triggerRecognition);

  // Undo / Redo / Clear
  btnUndo.addEventListener('click', () => {
    canvas.undo();
    updateCanvasControlState();
  });
  
  btnRedo.addEventListener('click', () => {
    canvas.redo();
    updateCanvasControlState();
  });
  
  btnClear.addEventListener('click', () => {
    canvas.clear();
    updateCanvasControlState();
    if (autoRecognizeTimer) clearTimeout(autoRecognizeTimer);
    showToast('Canvas cleared.', 'info');
  });

  // Pen Options
  penWidthSelect.addEventListener('change', (e) => {
    canvas.setPenWidth(parseInt(e.target.value));
  });

  paperGridSelect.addEventListener('change', (e) => {
    canvas.setPaperType(e.target.value);
  });

  penColorDots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      // Remove active from others
      penColorDots.forEach(d => d.classList.remove('active'));
      // Add active to current
      e.target.classList.add('active');
      
      const selectedColor = e.target.getAttribute('data-color');
      canvas.setPenColor(selectedColor);
    });
  });

  // Language Change reloads voice configurations
  languageSelect.addEventListener('change', () => {
    populateVoiceList();
    showToast(`Recognition language changed to ${languageSelect.options[languageSelect.selectedIndex].text}`, 'info');
  });

  // Auto Recognize Toggle
  autoRecognizeToggle.addEventListener('click', () => {
    isAutoRecognizeEnabled = !isAutoRecognizeEnabled;
    autoRecognizeToggle.classList.toggle('active', isAutoRecognizeEnabled);
    if (isAutoRecognizeEnabled) {
      showToast('Auto-recognition enabled. Transcription triggers automatically.', 'info');
    } else {
      showToast('Auto-recognition disabled. Click "Convert to Text" manually.', 'info');
    }
  });

  // Text-To-Speech Triggers
  btnSpeak.addEventListener('click', startSpeech);
  btnPause.addEventListener('click', pauseSpeech);
  btnStop.addEventListener('click', stopSpeech);

  // Settings Sliders
  rateSlider.addEventListener('input', (e) => {
    rateValue.textContent = `${e.target.value}x`;
  });
  pitchSlider.addEventListener('input', (e) => {
    pitchValue.textContent = e.target.value;
  });
  volumeSlider.addEventListener('input', (e) => {
    volumeValue.textContent = Math.round(e.target.value * 100) + '%';
  });

  // Copy recognized text
  copyBtn.addEventListener('click', () => {
    const text = textEditor.value;
    if (!text) {
      showToast('Nothing to copy!', 'warning');
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => showToast('Text copied to clipboard!', 'success'))
      .catch(() => showToast('Failed to copy text.', 'error'));
  });

  // Update Undo/Redo button disable states dynamically
  function updateCanvasControlState() {
    btnUndo.disabled = canvas.strokes.length === 0;
    btnRedo.disabled = canvas.redoStrokes.length === 0;
    btnRecognize.disabled = canvas.strokes.length === 0;
  }

  // --- 6. Toast Notifications Utilities ---
  function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Choose icon based on type
    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-check-circle';
    if (type === 'warning') icon = 'fa-exclamation-triangle';
    if (type === 'error') icon = 'fa-exclamation-circle';

    toast.innerHTML = `
      <i class="fas ${icon}"></i>
      <span>${message}</span>
      <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

    container.appendChild(toast);

    // Bind close click
    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    // Auto remove after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
});
