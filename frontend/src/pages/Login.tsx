import { useState } from 'react';
import { api } from '@/lib/api';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Login(){
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
          </form>
        </section>
      </div>
    </div>
  );
}


