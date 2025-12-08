import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function Register() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      // Fetch invite details to pre-fill email
      api<any>('GET', `/auth/invite/${encodeURIComponent(token)}`)
        .then((j) => {
          if (j && j.email_personal) {
            setEmail(j.email_personal);
          }
        })
        .catch(() => {});
    }
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    
    if (!token) {
      setError('Invalid or missing token');
      return;
    }
    
    if (!first.trim() || !last.trim()) {
      setError('First name and last name are required');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await api<{ access_token: string }>('POST', '/auth/register', {
        invite_token: token,
        password: password,
        first_name: first.trim(),
        last_name: last.trim(),
      });
      
      if (response && response.access_token) {
        localStorage.setItem('user_token', response.access_token);
        toast.success('Registration successful!');
        navigate('/onboarding', { replace: true });
      } else {
        setError('Registration failed');
      }
    } catch (err: any) {
      setError(err?.message || err?.detail || 'Registration failed');
      toast.error(err?.message || err?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center" style={{ backgroundImage: 'url(/ui/assets/login/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 w-[960px] max-w-[94vw] grid grid-cols-2 rounded-xl shadow-hero overflow-hidden bg-white">
        <aside className="bg-gradient-to-br from-[#7f1010] to-[#a31414] text-white p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold"><img src="/ui/assets/login/logo-light.svg" className="h-7"/> MKHub</div>
            <h1 className="text-3xl font-extrabold mt-6">Welcome!</h1>
            <p className="opacity-90 mt-2 max-w-[36ch]">Complete your registration to join Mack Kirk Operations Hub — customers, proposals, inventory, and projects in one secure place.</p>
          </div>
        </aside>
        <section className="p-7 flex flex-col justify-center">
          <div className="text-xl font-bold mb-3">Accept Invite</div>
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" 
                placeholder="First name *" 
                value={first} 
                onChange={e => setFirst(e.target.value)} 
                required
              />
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" 
                placeholder="Last name *" 
                value={last} 
                onChange={e => setLast(e.target.value)} 
                required
              />
            </div>
            <input 
              className="w-full rounded-lg border px-3 py-2 bg-gray-100 text-gray-600 cursor-not-allowed" 
              placeholder="Email (from invite)" 
              type="email" 
              value={email} 
              readOnly
            />
            <div className="relative">
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc] pr-10" 
                placeholder="Password *" 
                type={showPassword ? 'text' : 'password'}
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <div className="relative">
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc] pr-10" 
                placeholder="Confirm password *" 
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showConfirmPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button 
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2 font-bold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Registering...' : 'Register'}
            </button>
            <div className="text-center mt-2">
              <button 
                type="button"
                onClick={() => navigate('/login')}
                className="text-sm text-gray-600 hover:text-brand-red underline"
              >
                Back to Login
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

