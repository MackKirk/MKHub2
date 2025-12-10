import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone === true;

    if (isStandalone) {
      return;
    }

    // Check if dismissed
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed === 'true') {
      return;
    }

    // Check if mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

    if (!isMobile) {
      return;
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
      
      // Auto-trigger install prompt after a short delay (Android)
      setTimeout(() => {
        if (e && (e as any).prompt) {
          (e as any).prompt().then((result: any) => {
            if (result.outcome === 'accepted') {
              setIsVisible(false);
              localStorage.removeItem('pwa-install-dismissed');
            }
          }).catch(() => {
            // User dismissed - keep prompt available for manual trigger
          });
        }
      }, 2000); // Auto-show after 2 seconds
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Also show if user has been on site for a while (even without prompt)
    const timer = setTimeout(() => {
      if (!isDismissed && isMobile && !isStandalone && !deferredPrompt) {
        setIsVisible(true);
      }
    }, 10000); // Show after 10 seconds

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      clearTimeout(timer);
    };
  }, [isDismissed]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      // Redirect to install page if no prompt available
      window.location.href = '/install';
      return;
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        setIsVisible(false);
        // Clear dismissal so it can show again if needed
        localStorage.removeItem('pwa-install-dismissed');
      } else {
        console.log('User dismissed the install prompt');
      }
    } catch (err) {
      console.error('Error showing install prompt:', err);
    }
    
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:max-w-sm animate-slide-up">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4 flex items-center gap-3">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-gradient-to-br from-brand-red to-[#ee2b2b] rounded-lg flex items-center justify-center text-white text-xl font-bold">
            MK
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Install MK Hub</p>
          <p className="text-xs text-gray-600">Get faster access to your projects</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleInstall}
            className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Install
          </button>
          <button
            onClick={handleDismiss}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

