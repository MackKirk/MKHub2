import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

export default function PasswordReset(){
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing reset token');
    }
  }, [token]);

  async function onSubmit(e: React.FormEvent){
    e.preventDefault();
    setError('');
    
    if (!password || !confirmPassword) {
      setError('Please fill in both password fields');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    
    setLoading(true);
    try{
      await api('POST', `/auth/password/reset?token=${encodeURIComponent(token)}&new_password=${encodeURIComponent(password)}`);
      setSuccess(true);
      toast.success('Password reset successfully');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    }catch(err: any){
      setError(err?.message || err?.detail || 'Failed to reset password. The token may be invalid or expired.');
      toast.error(err?.message || err?.detail || 'Failed to reset password');
    }finally{
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen relative flex items-center justify-center" style={{ backgroundImage: 'url(/ui/assets/login/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 w-[500px] max-w-[94vw] rounded-xl shadow-hero overflow-hidden bg-white p-8">
          <div className="text-center">
            <div className="text-green-600 text-4xl mb-4">✓</div>
            <h2 className="text-2xl font-bold mb-2">Password Reset Successful</h2>
            <p className="text-gray-600 mb-4">Your password has been reset successfully. You will be redirected to the login page.</p>
            <Link to="/login" className="inline-block px-4 py-2 rounded-lg font-bold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b]">
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center" style={{ backgroundImage: 'url(/ui/assets/login/background.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative z-10 w-[500px] max-w-[94vw] rounded-xl shadow-hero overflow-hidden bg-white p-8">
        <div className="text-xl font-bold mb-3">Reset Password</div>
        {!token ? (
          <div className="text-red-600 mb-4">Invalid or missing reset token. Please use the link from your email.</div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">New Password</label>
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" 
                type="password" 
                placeholder="Enter new password"
                value={password} 
                onChange={e=>setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Confirm New Password</label>
              <input 
                className="w-full rounded-lg border px-3 py-2 bg-[#f8fafc]" 
                type="password" 
                placeholder="Confirm new password"
                value={confirmPassword} 
                onChange={e=>setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button 
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2 font-bold text-white bg-gradient-to-r from-brand-red to-[#ee2b2b] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <div className="text-center">
              <Link to="/login" className="text-sm text-gray-600 hover:text-brand-red underline">
                Back to Login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

