import React, { useContext } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

const Landing = () => {
  const { isAuthenticated, loading } = useContext(AuthContext);

  if (loading) return <div className="spinner"></div>;

  // Redirect to home if user is already logged in
  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="landing-container">
      <div className="landing-content">
        <h1 className="landing-title">TripManager</h1>
        <p className="landing-subtitle">Plan trips, manage expenses, and travel together.</p>
        <div className="landing-actions">
          <Link to="/login" className="btn btn-primary">Login</Link>
          <Link to="/signup" className="btn btn-secondary">Sign Up</Link>
        </div>
      </div>
    </div>
  );
};

export default Landing;
