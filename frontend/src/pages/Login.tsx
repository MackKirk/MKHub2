import { useState } from 'react';
import { api } from '@/lib/api';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Login(){
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const nav = useNavigate();
  const loc = useLocation() as any;

  async function onSubmit(e: React.FormEvent){
    e.preventDefault(); setError('');
    try{
      const j = await api<{access_token:string}>('POST','/auth/login',{ identifier, password });
      if (j && j.access_token){
        localStorage.setItem('user_token', j.access_token);
        const to = (loc.state && loc.state.from) ? String(loc.state.from) : '/home';
        nav(to, { replace: true });
      }
      else setError('Invalid credentials');
    }catch(err:any){ setError(err?.message||'Login failed'); }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center" style={{ backgroundImage: 'url(/ui/assets/login/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 w-[960px] max-w-[94vw] grid grid-cols-2 rounded-xl shadow-hero overflow-hidden bg-white">
        <aside className="bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold"><img src="/ui/assets/login/logo-light.svg" className="h-7"/> MKHub</div>
            <h1 className="text-3xl font-extrabold mt-6">Welcome back!</h1>
            <p className="opacity-90 mt-2 max-w-[36ch]">Mack Kirk Operations Hub — customers, proposals, inventory, and projects in one secure place.</p>
          </div>
        </aside>
        <section className="p-7 flex flex-col justify-center">
          <div className="text-xl font-bold mb-3">Sign in</div>
          <form onSubmit={onSubmit} className="space-y-3">
            <input className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" placeholder="Email or username" value={identifier} onChange={e=>setIdentifier(e.target.value)} />
            <input className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button className="w-full rounded-lg py-2 font-bold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b]">Login</button>
            <div className="text-center mt-2">
              <button 
                type="button"
                onClick={() => setForgotPasswordOpen(true)} 
                className="text-sm text-gray-600 hover:text-brand-red underline"
              >
                Forgot your password? Click here
              </button>
            </div>
          </form>
        </section>
      </div>
      
      {forgotPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[500px] max-w-[95vw] bg-white rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">Password Recovery</div>
              <button 
                onClick={() => { 
                  setForgotPasswordOpen(false); 
                  setForgotIdentifier(''); 
                  setForgotPasswordSent(false); 
                }} 
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              {!forgotPasswordSent ? (
                <>
                  <div className="text-sm text-gray-600 mb-4">
                    Enter your email or username to receive a password reset link.
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Email or Username</label>
                      <input 
                        className="w-full rounded-lg border px-3 py-2" 
                        placeholder="Enter your email or username"
                        value={forgotIdentifier}
                        onChange={e => setForgotIdentifier(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (!forgotIdentifier.trim()) {
                          toast.error('Please enter your email or username');
                          return;
                        }
                        try {
                          const response = await api<any>('POST', `/auth/password/forgot?identifier=${encodeURIComponent(forgotIdentifier.trim())}`);
                          setForgotPasswordSent(true);
                          // Check if email was actually sent
                          if (response?.email_sent) {
                            toast.success('Password reset email sent successfully');
                          } else if (response?.email_error) {
                            console.error('Email send error:', response.email_error);
                            toast.error('Failed to send email. Please contact support.');
                          } else {
                            // SMTP not configured or other issue
                            console.warn('Email not sent - SMTP may not be configured');
                            toast.error('Email service not configured. Please contact support.');
                          }
                        } catch (error: any) {
                          console.error('Password reset request error:', error);
                          // Always show success message for security (don't reveal if user exists)
                          setForgotPasswordSent(true);
                        }
                      }}
                      className="w-full rounded-lg py-2 font-bold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b]"
                    >
                      Send Recovery Email
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <div className="text-green-600 font-semibold mb-2">✓ Password reset email sent</div>
                  <div className="text-sm text-gray-600">
                    If the email or username exists in our system, you will receive an email with instructions to reset your password.
                  </div>
                  <button
                    onClick={() => {
                      setForgotPasswordOpen(false);
                      setForgotIdentifier('');
                      setForgotPasswordSent(false);
                    }}
                    className="mt-4 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


