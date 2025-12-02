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
  const [preferred, setPreferred] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
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
    
    setLoading(true);
    
    try {
      const profile: any = {};
      if (preferred.trim()) profile.preferred_name = preferred.trim();
      if (phone.trim()) profile.phone = phone.trim();
      
      const response = await api<{ access_token: string }>('POST', '/auth/register', {
        invite_token: token,
        password: password,
        first_name: first.trim(),
        last_name: last.trim(),
        profile: Object.keys(profile).length > 0 ? profile : undefined,
      });
      
      if (response && response.access_token) {
        localStorage.setItem('user_token', response.access_token);
        toast.success('Registration successful!');
        navigate('/home', { replace: true });
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
                placeholder="First name" 
                value={first} 
                onChange={e => setFirst(e.target.value)} 
                required
              />
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" 
                placeholder="Last name" 
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
            <div className="grid grid-cols-2 gap-3">
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" 
                placeholder="Preferred name" 
                value={preferred} 
                onChange={e => setPreferred(e.target.value)} 
              />
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" 
                placeholder="Phone" 
                value={phone} 
                onChange={e => setPhone(e.target.value)} 
              />
            </div>
            <input 
              className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" 
              placeholder="New password" 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required
              minLength={8}
            />
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

