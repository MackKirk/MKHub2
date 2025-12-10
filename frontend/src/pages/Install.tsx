import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type Platform = 'android' | 'ios' | 'desktop' | 'unknown';

export default function Install() {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[Install] Page loaded');
    
    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAndroid = /android/.test(userAgent);
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone === true;

    console.log('[Install] Platform detected:', { isAndroid, isIOS, isStandalone });

    if (isStandalone) {
      setIsInstalled(true);
    }

    if (isAndroid) {
      setPlatform('android');
    } else if (isIOS) {
      setPlatform('ios');
      // Auto-show iOS modal after a short delay
      setTimeout(() => {
        if (!isStandalone) {
          setShowIOSModal(true);
        }
      }, 1500);
    } else {
      setPlatform('desktop');
    }

    // Listen for beforeinstallprompt event (Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Auto-trigger install prompt for Android after a short delay
      setTimeout(() => {
        if (e && (e as any).prompt) {
          (e as any).prompt().then((result: any) => {
            if (result.outcome === 'accepted') {
              setIsInstalled(true);
            }
          }).catch(() => {
            // User dismissed or error - keep deferred prompt for manual trigger
          });
        }
      }, 1000); // Show after 1 second
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Generate QR code (dynamic import for browser compatibility)
    const generateQRCode = async () => {
      try {
        setIsLoading(true);
        // Use browser-compatible import
        const QRCode = (await import('qrcode/lib/browser')).default || (await import('qrcode')).default;
        // Use full URL with protocol for better mobile compatibility
        const protocol = window.location.protocol;
        const host = window.location.host;
        const installUrl = `${protocol}//${host}/install`;
        const url = await QRCode.toDataURL(installUrl, {
          width: 256,
          margin: 2,
          color: {
            dark: '#0B1739',
            light: '#ffffff'
          }
        });
        setQrCodeDataUrl(url);
        setIsLoading(false);
        if (qrCanvasRef.current) {
          const ctx = qrCanvasRef.current.getContext('2d');
          if (ctx) {
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
            };
            img.src = url;
          }
        }
      } catch (err) {
        console.error('Error generating QR code:', err);
        // Fallback: try alternative import
        try {
          const QRCode = (await import('qrcode')).default;
          const protocol = window.location.protocol;
          const host = window.location.host;
          const installUrl = `${protocol}//${host}/install`;
          const url = await QRCode.toDataURL(installUrl, {
            width: 256,
            margin: 2,
            color: {
              dark: '#0B1739',
              light: '#ffffff'
            }
          });
          setQrCodeDataUrl(url);
          setIsLoading(false);
        } catch (err2) {
          console.error('QR code generation failed:', err2);
          setIsLoading(false);
        }
      }
    };

    generateQRCode();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      setIsInstalled(true);
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0B1739] to-[#1a2d5a] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">MK Hub is Installed!</h1>
          <p className="text-gray-600 mb-6">
            The app is now installed on your device. You can find it on your home screen.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B1739] to-[#1a2d5a] text-white">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Install MK Hub</h1>
          <p className="text-xl opacity-90">
            Get faster access to your projects, customers, and more
          </p>
        </div>

        {/* Platform-specific instructions */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Android Instructions */}
          {platform === 'android' && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <span>🤖</span> Android
              </h2>
              {deferredPrompt ? (
                <>
                  <p className="mb-4 opacity-90">
                    Click the button below to install MK Hub on your Android device.
                  </p>
                  <button
                    onClick={handleInstall}
                    className="w-full py-3 rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold hover:opacity-90 transition-opacity"
                  >
                    Install MK Hub
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <p className="opacity-90 mb-4">Follow these steps:</p>
                  <ol className="list-decimal list-inside space-y-2 opacity-90">
                    <li>Tap the menu (three dots) in your browser</li>
                    <li>Select "Add to Home screen" or "Install app"</li>
                    <li>Confirm the installation</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* iOS Instructions */}
          {platform === 'ios' && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <span>🍎</span> iOS (Safari)
              </h2>
              <div className="space-y-4">
                <p className="opacity-90 mb-4">Follow these steps:</p>
                <ol className="list-decimal list-inside space-y-3 opacity-90">
                  <li>
                    Tap the <strong>Share</strong> button
                    <span className="ml-2 text-2xl">📤</span>
                  </li>
                  <li>
                    Scroll down and tap <strong>"Add to Home Screen"</strong>
                    <span className="ml-2 text-2xl">➕</span>
                  </li>
                  <li>Tap <strong>"Add"</strong> to confirm</li>
                </ol>
                <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-sm opacity-75">
                    <strong>Note:</strong> Installation must be done from Safari browser, not Chrome or other browsers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Desktop Instructions */}
          {platform === 'desktop' && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <span>💻</span> Desktop
              </h2>
              {deferredPrompt ? (
                <>
                  <p className="mb-4 opacity-90">
                    Click the button below to install MK Hub as a desktop app.
                  </p>
                  <button
                    onClick={handleInstall}
                    className="w-full py-3 rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold hover:opacity-90 transition-opacity"
                  >
                    Install MK Hub
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <p className="opacity-90">
                    Look for the install icon in your browser's address bar, or check the browser menu for "Install" or "Add to Home Screen" options.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* QR Code Section */}
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>📱</span> Scan to Install
            </h2>
            <p className="opacity-90 mb-4 text-sm">
              Scan this QR code with your mobile device to open the install page:
            </p>
            <div className="flex justify-center">
              {isLoading ? (
                <div className="w-48 h-48 bg-white/10 rounded-lg flex items-center justify-center">
                  <div className="text-sm opacity-75">Loading QR code...</div>
                </div>
              ) : qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code for MK Hub installation"
                  className="w-48 h-48 bg-white p-2 rounded-lg"
                />
              ) : (
                <div className="w-48 h-48 bg-white/10 rounded-lg flex items-center justify-center">
                  <div className="text-sm opacity-75 text-center">
                    QR code unavailable
                    <br />
                    <a 
                      href={`${window.location.protocol}//${window.location.host}/install`}
                      className="text-brand-red underline mt-2 block"
                    >
                      Open install page
                    </a>
                  </div>
                </div>
              )}
            </div>
            <canvas ref={qrCanvasRef} className="hidden" />
            {qrCodeDataUrl && (
              <p className="text-xs opacity-75 mt-4 text-center break-all">
                {`${window.location.protocol}//${window.location.host}/install`}
              </p>
            )}
          </div>
        </div>

        {/* Benefits Section */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 border border-white/20 mb-8">
          <h2 className="text-2xl font-bold mb-4">Why Install MK Hub?</h2>
          <ul className="space-y-3 opacity-90">
            <li className="flex items-start gap-3">
              <span className="text-brand-red font-bold">✓</span>
              <span>Faster access - launch directly from your home screen</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-brand-red font-bold">✓</span>
              <span>Works offline - view cached content without internet</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-brand-red font-bold">✓</span>
              <span>App-like experience - no browser UI, full screen mode</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-brand-red font-bold">✓</span>
              <span>Secure - your data stays safe with encrypted connections</span>
            </li>
          </ul>
        </div>

        {/* Footer Actions */}
        <div className="text-center">
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 transition-colors"
          >
            Continue to Login
          </button>
        </div>
      </div>

      {/* iOS Installation Modal - Auto-shows on iOS */}
      {showIOSModal && platform === 'ios' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Install MK Hub</h2>
              <button
                onClick={() => setShowIOSModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-4">
              <p className="text-gray-700">
                To install MK Hub on your iPhone/iPad, follow these simple steps:
              </p>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">Tap the Share button</p>
                    <p className="text-sm text-gray-600 mt-1">Look for the share icon at the bottom of Safari</p>
                    <div className="mt-2 text-3xl">📤</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">Scroll and tap "Add to Home Screen"</p>
                    <p className="text-sm text-gray-600 mt-1">Scroll down in the share menu to find this option</p>
                    <div className="mt-2 text-3xl">➕</div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                  <div className="flex-shrink-0 w-8 h-8 bg-purple-500 text-white rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">Tap "Add" to confirm</p>
                    <p className="text-sm text-gray-600 mt-1">The app will appear on your home screen</p>
                    <div className="mt-2 text-3xl">✓</div>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Important:</strong> You must use Safari browser. Chrome or other browsers won't work.
                </p>
              </div>
              
              <button
                onClick={() => setShowIOSModal(false)}
                className="w-full py-3 rounded-lg bg-gradient-to-r from-brand-red to-[#ee2b2b] text-white font-semibold hover:opacity-90 transition-opacity mt-4"
              >
                Got it!
              </button>
            </div>
          </div>
          <style>{`
            @keyframes fade-in {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slide-up {
              from {
                transform: translateY(20px);
                opacity: 0;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
            .animate-fade-in {
              animation: fade-in 0.3s ease-out;
            }
            .animate-slide-up {
              animation: slide-up 0.4s ease-out;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}

