/*
 * Core Application Controller
 * Coordinates Handwriting Canvas and Handwriting Recognition Engines.
 * Directly translates recognized calligraphy into speech utilizing hardcoded 
 * text-to-speech settings (Microsoft Heera voice, Speed 1.0, Pitch 1.0, Volume 1.0).
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const canvasEl = document.getElementById('drawing-canvas');
  const canvasContainer = document.getElementById('canvas-container-box');
  
  // Canvas Toolbar Controls
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');
  const penColorDots = document.querySelectorAll('.color-dot');
  
  // App Toolbar Settings
  const autoRecognizeToggle = document.getElementById('auto-recognize-toggle');
  const btnRecognize = document.getElementById('btn-recognize');
  const networkBadge = document.getElementById('network-badge');
  const networkStatusText = document.getElementById('network-status-text');
  
  // --- State Variables ---
  let canvas = null;
  let recognizer = null;
  let autoRecognizeTimer = null;
  let isAutoRecognizeEnabled = true;

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
    
    // Trigger translation 2.0s after drawing stops
    if (isAutoRecognizeEnabled) {
      autoRecognizeTimer = setTimeout(() => {
        triggerRecognition();
      }, 2000);
    }
  };

  // Initialize Canvas and Recognizer
  canvas = new window.HandwritingCanvas(canvasEl, canvasContainer, handleStrokeEnd);
  canvas.setPaperType('ruled-paper'); // Ensure lighter ruled paper starts by default!
  canvas.setPenWidth(4);              // Standard medium calligraphy brush size
  
  recognizer = new window.HandwritingRecognizer(handleNetworkChange);
  
  // Check initial connection status
  handleNetworkChange(navigator.onLine);
  updateCanvasControlState();

  // iOS Speech Unlocker: iOS Safari blocks asynchronous text-to-speech triggered by timers.
  // We unlock the audio context by playing a brief silent utterance on the very first user touch/click.
  const unlockIOSSpeech = () => {
    try {
      const silentUtterance = new SpeechSynthesisUtterance(' ');
      silentUtterance.volume = 0;
      window.speechSynthesis.speak(silentUtterance);
      
      // Remove listeners once successfully unlocked
      window.removeEventListener('touchstart', unlockIOSSpeech);
      window.removeEventListener('pointerdown', unlockIOSSpeech);
      window.removeEventListener('mousedown', unlockIOSSpeech);
      console.log('iOS Speech Engine successfully unlocked.');
    } catch (e) {
      console.warn('Speech unlock failed:', e);
    }
  };
  window.addEventListener('touchstart', unlockIOSSpeech);
  window.addEventListener('pointerdown', unlockIOSSpeech);
  window.addEventListener('mousedown', unlockIOSSpeech);

  // --- 2. Hardcoded Text-To-Speech Engine ---

  const startSpeech = (textToSpeak) => {
    if (!textToSpeak) return;

    // Cancel any active speech playback
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    
    // Hardcoded Speech Settings:
    utterance.volume = 1.0; // 100% Volume
    utterance.pitch = 1.0;  // Standard Pitch Tone
    utterance.rate = 1.0;   // Normal Speed Rate

    // Fetch System Voices to find Microsoft Heera
    const systemVoices = window.speechSynthesis.getVoices();
    
    // Look for Microsoft Heera (case-insensitive search)
    const heeraVoice = systemVoices.find(voice => 
      voice.name.toLowerCase().includes('heera')
    );

    if (heeraVoice) {
      utterance.voice = heeraVoice;
      console.log('Selected Heera voice successfully.');
    } else {
      // Fallback: search for any English voice, or use first system voice
      const englishVoice = systemVoices.find(voice => 
        voice.lang.toLowerCase().startsWith('en')
      );
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
      console.warn('Microsoft Heera voice not found on this system. Falling back to default English voice.');
    }

    utterance.onstart = () => {
      console.log('Speaking:', textToSpeak);
    };

    window.speechSynthesis.speak(utterance);
  };

  // Ensure voices are fetched loaded asynchronously (crucial for Chrome/Edge)
  if (typeof speechSynthesis !== 'undefined' && window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      // Warm up the speech voices pool
      window.speechSynthesis.getVoices();
    };
  }

  // --- 3. Call Handwriting Recognition ---
  const triggerRecognition = async () => {
    if (canvas.isEmpty()) {
      return;
    }

    btnRecognize.disabled = true;
    const originalBtnText = btnRecognize.innerHTML;
    btnRecognize.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';

    // Default recognition language set to English
    const selectedLang = 'en';
    
    // Offline status feedback callback
    const handleProgress = (progress) => {
      console.log('OCR progress:', progress.message);
    };

    try {
      const textResult = await recognizer.recognize(canvas, selectedLang, handleProgress);
      
      if (textResult) {
        // Visual confirmation of the transcribed text via minimal toast
        showToast(`Spoken: "${textResult}"`, 'success');
        
        // Auto convert to speech immediately!
        startSpeech(textResult);
      }
      
      // Auto clear the canvas so the user can draw next block
      canvas.clear();
      updateCanvasControlState();
      
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnRecognize.disabled = false;
      btnRecognize.innerHTML = originalBtnText;
    }
  };

  // --- 4. Event Listeners Coordination ---

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

  // Pen Ink Selector
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

  // Update Undo/Redo button disable states dynamically
  function updateCanvasControlState() {
    btnUndo.disabled = canvas.strokes.length === 0;
    btnRedo.disabled = canvas.redoStrokes.length === 0;
    btnRecognize.disabled = canvas.strokes.length === 0;
  }

  // --- 5. Toast Notifications Utilities ---
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
