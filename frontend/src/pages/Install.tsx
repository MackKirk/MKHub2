import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type Platform = 'android' | 'ios' | 'desktop' | 'unknown';

export default function Install() {
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAndroid = /android/.test(userAgent);
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
    }

    if (isAndroid) {
      setPlatform('android');
    } else if (isIOS) {
      setPlatform('ios');
    } else {
      setPlatform('desktop');
    }

    // Listen for beforeinstallprompt event (Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Generate QR code (dynamic import for browser compatibility)
    const generateQRCode = async () => {
      try {
        // Use browser-compatible import
        const QRCode = (await import('qrcode/lib/browser')).default || (await import('qrcode')).default;
        const installUrl = `${window.location.origin}/install`;
        const url = await QRCode.toDataURL(installUrl, {
          width: 256,
          margin: 2,
          color: {
            dark: '#0B1739',
            light: '#ffffff'
          }
        });
        setQrCodeDataUrl(url);
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
          const installUrl = `${window.location.origin}/install`;
          const url = await QRCode.toDataURL(installUrl, {
            width: 256,
            margin: 2,
            color: {
              dark: '#0B1739',
              light: '#ffffff'
            }
          });
          setQrCodeDataUrl(url);
        } catch (err2) {
          console.error('QR code generation failed:', err2);
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
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code for MK Hub installation"
                  className="w-48 h-48 bg-white p-2 rounded-lg"
                />
              ) : (
                <div className="w-48 h-48 bg-white/10 rounded-lg flex items-center justify-center">
                  <div className="text-sm opacity-75">Loading QR code...</div>
                </div>
              )}
            </div>
            <canvas ref={qrCanvasRef} className="hidden" />
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
    </div>
  );
}

