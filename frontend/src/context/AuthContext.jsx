import React, { createContext, useState, useEffect } from 'react';
import { getMe, loginUser, registerUser, logoutUser as apiLogoutUser } from '../api/auth';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // For initial auth check

  useEffect(() => {
    // On mount, check if user has access token in localStorage
    // NOTE: Using localStorage for token storage is simple for Sprint 1.
    // In a production environment, HTTP-only secure cookies are preferable to mitigate XSS attacks.
    const initializeAuth = async () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        try {
          const res = await getMe();
          setUser(res.data);
        } catch (error) {
          console.error("Token invalid or expired", error);
          localStorage.removeItem('access_token');
          setUser(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    const res = await loginUser({ email, password });
    // Assuming backend returns { access_token, user, token_type }
    localStorage.setItem('access_token', res.data.access_token);
    setUser(res.data.user);
  };

  const signup = async (name, email, password, password_confirm) => {
    // Signup does not automatically login the user
    await registerUser({ name, email, password, password_confirm });
  };

  const logout = async () => {
    // Since JWT is stateless on the server, removing it from the client effectively logs the user out locally.
    // We still call the API in case we have server-side invalidation/tracking.
    try {
      await apiLogoutUser();
    } catch (e) {
      console.error("Logout API failed, continuing client-side logout");
    }
    localStorage.removeItem('access_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, isAuthenticated: user !== null }}>
      {children}
    </AuthContext.Provider>
  );
};
