import React, { useState, useContext } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { User, Mail, Lock, Eye, EyeOff, UserPlus } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import AuthLeftPanel from '../components/AuthLeftPanel';
import '../styles/auth.css';

const Signup = () => {
  const { signup, loginWithGoogle, isAuthenticated, loading } = useContext(AuthContext);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    password_confirm: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

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

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters long';
    }
    if (formData.password !== formData.password_confirm) {
      newErrors.password_confirm = 'Passwords do not match';
    }
    return newErrors;
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setSuccess('');

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});

    setIsSubmitting(true);
    try {
      const res = await signup(formData.name, formData.email, formData.password);
      if (res?.user && (!res?.session || res?.user?.identities?.length === 0)) {
        setSuccess('Registration successful! Please check your email inbox to verify your account before logging in.');
      } else {
        setSuccess('Account created successfully! Redirecting to login...');
        setTimeout(() => {
          navigate('/login');
        }, 1800);
      }
    } catch (err) {
      setApiError(err.message || err.response?.data?.detail || 'An error occurred during registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    setApiError('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setApiError(err.message || 'Google sign-up failed.');
    }
  };

  return (
    <div className="auth-split-wrapper">
      <AuthLeftPanel />

      <div className="auth-form-panel">
        <div className="auth-modern-card">
          <div className="auth-header-block">
            <h2 className="auth-main-title">Create Account</h2>
            <p className="auth-sub-title">Start coordinating trips collaboratively</p>
          </div>

          {apiError && <div className="auth-card-alert auth-card-alert-error">{apiError}</div>}
          {success && <div className="auth-card-alert auth-card-alert-success">{success}</div>}

          {/* 1-Click Google Sign Up */}
          <button
            type="button"
            onClick={handleGoogleSignup}
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
            Sign up with Google
          </button>

          <div className="auth-or-divider">
            <span>or with email</span>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Full Name */}
            <div className="modern-form-group">
              <label htmlFor="signupName">Full Name</label>
              <div className="input-icon-wrapper">
                <span className="input-leading-icon">
                  <User size={18} />
                </span>
                <input
                  id="signupName"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Alex Rivers"
                  className="modern-auth-input"
                  required
                />
              </div>
              {errors.name && <span style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.name}</span>}
            </div>

            {/* Email Address */}
            <div className="modern-form-group">
              <label htmlFor="signupEmail">Email Address</label>
              <div className="input-icon-wrapper">
                <span className="input-leading-icon">
                  <Mail size={18} />
                </span>
                <input
                  id="signupEmail"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  className="modern-auth-input"
                  required
                />
              </div>
              {errors.email && <span style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.email}</span>}
            </div>

            {/* Password */}
            <div className="modern-form-group">
              <label htmlFor="signupPassword">Password</label>
              <div className="input-icon-wrapper">
                <span className="input-leading-icon">
                  <Lock size={18} />
                </span>
                <input
                  id="signupPassword"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Minimum 8 characters"
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
              {errors.password && <span style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.password}</span>}
            </div>

            {/* Confirm Password */}
            <div className="modern-form-group">
              <label htmlFor="signupPasswordConfirm">Confirm Password</label>
              <div className="input-icon-wrapper">
                <span className="input-leading-icon">
                  <Lock size={18} />
                </span>
                <input
                  id="signupPasswordConfirm"
                  type={showPassword ? 'text' : 'password'}
                  name="password_confirm"
                  value={formData.password_confirm}
                  onChange={handleChange}
                  placeholder="Re-enter password"
                  className="modern-auth-input"
                  required
                />
              </div>
              {errors.password_confirm && <span style={{ color: '#dc2626', fontSize: '0.8rem', marginTop: '4px', display: 'block' }}>{errors.password_confirm}</span>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="auth-primary-submit-btn"
              style={{ marginTop: '10px' }}
            >
              {isSubmitting ? (
                'Creating Account...'
              ) : (
                <>
                  <UserPlus size={18} style={{ marginRight: '6px' }} />
                  Create Account
                </>
              )}
            </button>
          </form>

          <div className="auth-bottom-switch">
            Already have an account? <Link to="/login">Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
