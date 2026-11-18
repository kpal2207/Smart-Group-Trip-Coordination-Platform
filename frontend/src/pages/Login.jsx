import React, { useState, useContext, useEffect } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, LogIn } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import AuthLeftPanel from '../components/AuthLeftPanel';
import '../styles/auth.css';

const Login = () => {
  const { login, loginWithGoogle, forgotPassword, isAuthenticated, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  // Pre-fill remembered email if saved
  useEffect(() => {
    const savedEmail = localStorage.getItem('smart_trip_remember_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  if (loading) {
    return (
      <div className="auth-split-wrapper">
        <AuthLeftPanel />
        <div className="auth-form-panel">
          <div className="auth-modern-card" style={{ textAlign: 'center', padding: '60px 40px' }}>
            <div className="live-pulse-dot" style={{ margin: '0 auto 16px auto', width: '12px', height: '12px' }} />
            <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Loading session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);

      // Handle Remember Me preference
      if (rememberMe) {
        localStorage.setItem('smart_trip_remember_email', email.trim());
      } else {
        localStorage.removeItem('smart_trip_remember_email');
      }

      navigate('/home');
    } catch (err) {
      setErrorMsg(err.message || err.response?.data?.detail || 'Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setErrorMsg(err.message || 'Google login failed. Please ensure Google provider is enabled in Supabase.');
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) {
      setErrorMsg('Please enter your email to receive a password reset link.');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await forgotPassword(forgotEmail);
      setSuccessMsg(`Password reset link sent to ${forgotEmail}. Please check your inbox.`);
      setShowForgot(false);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-split-wrapper">
      {/* Left Column: Live Telemetry Canvas */}
      <AuthLeftPanel />

      {/* Right Column: Floating Auth Card */}
      <div className="auth-form-panel">
        <div className="auth-modern-card">
          <div className="auth-header-block">
            <h2 className="auth-main-title">Sign In</h2>
            <p className="auth-sub-title">Welcome back</p>
          </div>

          {errorMsg && <div className="auth-card-alert auth-card-alert-error">{errorMsg}</div>}
          {successMsg && <div className="auth-card-alert auth-card-alert-success">{successMsg}</div>}

          {/* 1-Click Sign in with Google */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="auth-google-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="auth-or-divider">
            <span>or with email</span>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Email Field with Leading Envelope Icon */}
            <div className="modern-form-group">
              <label htmlFor="loginEmail">Email</label>
              <div className="input-icon-wrapper">
                <span className="input-leading-icon">
                  <Mail size={18} />
                </span>
                <input
                  id="loginEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="modern-auth-input"
                  required
                />
              </div>
            </div>

            {/* Password Field with Leading Lock & Trailing Eye Icon */}
            <div className="modern-form-group">
              <label htmlFor="loginPassword">Password</label>
              <div className="input-icon-wrapper">
                <span className="input-leading-icon">
                  <Lock size={18} />
                </span>
                <input
                  id="loginPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="modern-auth-input has-trailing"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="input-trailing-btn"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Helper Row: Remember Me Toggle & Forgot Password Link */}
            <div className="auth-helper-row">
              <label className="remember-toggle-label">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="remember-toggle-input"
                />
                <span className="toggle-switch-track">
                  <span className="toggle-switch-thumb" />
                </span>
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setShowForgot(!showForgot);
                }}
                className="auth-forgot-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Forgot password?
              </button>
            </div>

            {/* Submit Button (Sign In with Login/Arrow Icon - NO Airplane) */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="auth-primary-submit-btn"
            >
              {isSubmitting ? (
                'Signing In...'
              ) : (
                <>
                  <LogIn size={18} style={{ marginRight: '6px' }} />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Inline Forgot Password Box */}
          {showForgot && (
            <div className="forgot-password-box">
              <p style={{ margin: '0 0 10px 0', fontSize: '0.88rem', color: '#475569' }}>
                Enter your email address to receive a secure password recovery link:
              </p>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="your@email.com"
                className="modern-auth-input"
                style={{ marginBottom: '12px', paddingLeft: '14px' }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowForgot(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleForgotPassword}
                  disabled={isSubmitting}
                >
                  Send Reset Link
                </button>
              </div>
            </div>
          )}

          <div className="auth-bottom-switch">
            Don't have an account? <Link to="/signup">Sign Up</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
