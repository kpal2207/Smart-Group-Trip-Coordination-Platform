import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import AuthLeftPanel from '../components/AuthLeftPanel';
import '../styles/auth.css';

const ResetPassword = () => {
  const { updatePassword, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!password || password.length < 8) {
      setErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePassword(password);

      // Crucial requirement: After resetting password, explicitly log out
      // so user does NOT land on /home, but must log in freshly on /login
      await logout();

      setSuccessMsg('Password updated successfully! Redirecting to login so you can sign in with your new password...');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2200);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update password. Please request a new recovery link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-split-wrapper">
      <AuthLeftPanel />

      <div className="auth-form-panel">
        <div className="auth-modern-card">
          <div className="auth-header-block">
            <h2 className="auth-main-title">Set New Password</h2>
            <p className="auth-sub-title">Create a strong password for your account</p>
          </div>

          {errorMsg && <div className="auth-card-alert auth-card-alert-error">{errorMsg}</div>}
          {successMsg && <div className="auth-card-alert auth-card-alert-success">{successMsg}</div>}

          <form onSubmit={handleSubmit}>
            <div className="modern-form-group">
              <label htmlFor="newPassword">New Password</label>
              <div className="input-icon-wrapper">
                <span className="input-leading-icon">
                  <Lock size={18} />
                </span>
                <input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="modern-auth-input has-trailing"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="input-trailing-btn"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="modern-form-group">
              <label htmlFor="confirmNewPassword">Confirm New Password</label>
              <div className="input-icon-wrapper">
                <span className="input-leading-icon">
                  <Lock size={18} />
                </span>
                <input
                  id="confirmNewPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="modern-auth-input"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="auth-primary-submit-btn"
              style={{ marginTop: '12px' }}
            >
              {isSubmitting ? (
                'Updating Password...'
              ) : (
                <>
                  <KeyRound size={18} style={{ marginRight: '6px' }} />
                  Set New Password
                </>
              )}
            </button>
          </form>

          <div className="auth-bottom-switch">
            Remembered your credentials? <Link to="/login">Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
