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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
              <div className="relative">
                <input 
                  className="w-full rounded-lg border px-3 py-2 pr-10 bg-[#f8fafc]" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="Enter new password"
                  value={password} 
                  onChange={e=>setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  tabIndex={-1}
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
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Confirm New Password</label>
              <div className="relative">
                <input 
                  className="w-full rounded-lg border px-3 py-2 pr-10 bg-[#f8fafc]" 
                  type={showConfirmPassword ? "text" : "password"} 
                  placeholder="Confirm new password"
                  value={confirmPassword} 
                  onChange={e=>setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  tabIndex={-1}
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

