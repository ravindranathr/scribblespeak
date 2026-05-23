/*
 * PWA Service Worker Installer & Prompt Broker
 * Handles service worker background registration and orchestrates custom 
 * PWA installation triggers directly inside the header toolbar.
 */

let deferredPrompt = null;

// 1. Register Service Worker for Cache Interceptions
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        console.log('ScribbleSpeak Service Worker registered successfully:', reg.scope);
      })
      .catch(err => {
        console.error('Service Worker registration failed:', err);
      });
  });
}

// 2. Capture and Mediate PWA Install Prompts
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent modern browsers from showing the default install banner automatically
  e.preventDefault();
  
  // Stash the event so it can be triggered on user action
  deferredPrompt = e;
  
  // Reveal the custom "Install App" button in the header
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
    
    // Bind click listener
    installBtn.addEventListener('click', () => {
      if (!deferredPrompt) return;
      
      // Trigger the installation prompt dialog
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the ScribbleSpeak installation request.');
        } else {
          console.log('User dismissed the ScribbleSpeak installation request.');
        }
        
        // Reset deferred prompt
        deferredPrompt = null;
        installBtn.style.display = 'none';
      });
    });
  }
});

// 3. Clear button if successfully installed
window.addEventListener('appinstalled', (evt) => {
  console.log('ScribbleSpeak was successfully installed as a native app on the system!');
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) {
    installBtn.style.display = 'none';
  }
});
