/*
 * Handwriting Recognition Controller
 * Automatically switches between Google Input Tools Handwriting API (Online Mode)
 * and Tesseract.js OCR (Offline Mode) depending on user network connectivity.
 */

class HandwritingRecognizer {
  constructor(onNetworkChangeCallback) {
    this.isOnline = navigator.onLine;
    this.onNetworkChange = onNetworkChangeCallback;
    this.tesseractWorker = null;
    this.isTesseractLoading = false;
    
    // Set up network listeners
    window.addEventListener('online', () => this.handleNetworkStatusChange(true));
    window.addEventListener('offline', () => this.handleNetworkStatusChange(false));
  }

  handleNetworkStatusChange(online) {
    this.isOnline = online;
    if (this.onNetworkChange) {
      this.onNetworkChange(online);
    }
  }

  // Orchestrate Recognition based on connection
  async recognize(canvasInstance, languageCode = 'en', progressCallback = null) {
    if (canvasInstance.isEmpty()) {
      return '';
    }

    if (this.isOnline) {
      return this.recognizeOnline(canvasInstance, languageCode);
    } else {
      return this.recognizeOffline(canvasInstance, languageCode, progressCallback);
    }
  }

  // 1. Google Handwriting Input Tools API (Online)
  async recognizeOnline(canvasInstance, languageCode) {
    const inkData = canvasInstance.getInkData();
    const canvasRect = canvasInstance.canvas.getBoundingClientRect();
    
    const requestPayload = {
      device: navigator.userAgent,
      options: 'enable_pre_space',
      requests: [
        {
          writing_guide: {
            writing_area_width: Math.round(canvasRect.width),
            writing_area_height: Math.round(canvasRect.height)
          },
          ink: inkData,
          language: languageCode
        }
      ]
    };

    try {
      // Direct call to Google's public Input Tools API
      const response = await fetch('https://www.google.com/inputtools/request?ime=handwriting&app=autotrack&dbg=1&cs=1&oe=UTF-8', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        throw new Error('API server returned an error');
      }

      const data = await response.json();
      
      // Parse Google Input Tools Response
      // Format: ["SUCCESS", [ [ "requestIndex", [ "candidate1", "candidate2" ], [], {...} ] ] ]
      if (data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1]) {
        const candidates = data[1][0][1];
        if (candidates.length > 0) {
          // Return the absolute top candidate (most accurate)
          return candidates[0];
        }
      }
      return '';
    } catch (err) {
      console.warn('Online handwriting API failed, falling back to offline OCR:', err);
      // Fallback directly to offline if online fetch fails (e.g. CORS, DNS issue, server block)
      return this.recognizeOffline(canvasInstance, languageCode);
    }
  }

  // 2. Tesseract.js Local Client-Side OCR Engine (Offline Fallback)
  async recognizeOffline(canvasInstance, languageCode, progressCallback) {
    const imageBase64 = canvasInstance.getHighContrastImageDataUrl();
    
    // Map standard language codes to Tesseract codes
    // e.g., 'en' -> 'eng', 'es' -> 'spa', 'fr' -> 'fra', 'de' -> 'deu', 'zh' -> 'chi_sim'
    const tesseractLang = this.mapLanguageCode(languageCode);

    try {
      if (progressCallback) {
        progressCallback({ status: 'loading', message: 'Loading Offline OCR Engine...' });
      }

      // Dynamically load Tesseract.js library from CDN if not already loaded
      if (typeof Tesseract === 'undefined') {
        await this.loadTesseractLibrary();
      }

      if (progressCallback) {
        progressCallback({ status: 'recognizing', message: 'Analyzing handwriting...' });
      }

      // Execute Tesseract client-side OCR recognition
      const result = await Tesseract.recognize(
        imageBase64,
        tesseractLang,
        {
          logger: (m) => {
            if (progressCallback && m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              progressCallback({ 
                status: 'processing', 
                message: `Scanning lines: ${progress}%`, 
                progress: progress 
              });
            }
          }
        }
      );

      const recognizedText = result.data.text ? result.data.text.trim() : '';
      return recognizedText;
    } catch (err) {
      console.error('Offline OCR failed:', err);
      throw new Error('Could not recognize handwriting offline. Please ensure your handwriting is neat, or check your internet connection.');
    }
  }

  // Inject Tesseract.js script dynamically
  loadTesseractLibrary() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => {
        console.log('Tesseract.js loaded successfully from CDN');
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load Tesseract.js offline package.'));
      };
      document.head.appendChild(script);
    });
  }

  // Map 2-letter language codes to Tesseract ISO 639-2 codes
  mapLanguageCode(code) {
    const map = {
      'en': 'eng',
      'es': 'spa',
      'fr': 'fra',
      'de': 'deu',
      'it': 'ita',
      'pt': 'por',
      'ru': 'rus',
      'zh': 'chi_sim',
      'ja': 'jpn',
      'hi': 'hin',
      'ar': 'ara'
    };
    return map[code] || 'eng'; // Fallback to English
  }
}

// Export class globally
window.HandwritingRecognizer = HandwritingRecognizer;
