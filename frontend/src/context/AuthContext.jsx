import React, { createContext, useState, useEffect } from 'react';
import { getMe, loginUser, registerUser, logoutUser as apiLogoutUser } from '../api/auth';
import { supabase } from '../utils/supabase';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to sync Supabase token with local FastAPI backend
  const syncBackendUser = async (token) => {
    if (!token) {
      setUser(null);
      localStorage.removeItem('access_token');
      return null;
    }
    localStorage.setItem('access_token', token);
    try {
      const res = await getMe();
      setUser(res.data);
      return res.data;
    } catch (err) {
      console.error('Failed to sync backend user profile:', err);
      return null;
    }
  };

  useEffect(() => {
    let subscription = null;

    const initializeAuth = async () => {
      try {
        // 1. Try Supabase active session first
        if (supabase && supabase.auth) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              await syncBackendUser(session.access_token);
            } else {
              // Check existing localStorage token as fallback
              const localToken = localStorage.getItem('access_token');
              if (localToken) {
                await syncBackendUser(localToken);
              }
            }
          } catch (e) {
            console.warn('Supabase session check error, falling back to local token', e);
          }

          // Listen for OAuth redirects, email confirmation logins, and token refreshes
          const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.access_token) {
              await syncBackendUser(session.access_token);
            } else if (event === 'SIGNED_OUT') {
              setUser(null);
              localStorage.removeItem('access_token');
            }
          });
          subscription = data?.subscription;
        } else {
          const localToken = localStorage.getItem('access_token');
          if (localToken) {
            await syncBackendUser(localToken);
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // Standard Email + Password Login
  const login = async (email, password) => {
    if (supabase && supabase.auth && import.meta.env.VITE_SUPABASE_URL) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data?.session?.access_token) {
        await syncBackendUser(data.session.access_token);
      }
      return data;
    } else {
      const res = await loginUser({ email, password });
      localStorage.setItem('access_token', res.data.access_token);
      setUser(res.data.user);
      return res.data;
    }
  };

  // Sign up with Email + Password (Supabase sends verification email if enabled)
  const signup = async (name, email, password, password_confirm) => {
    if (supabase && supabase.auth && import.meta.env.VITE_SUPABASE_URL) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: name.trim() },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) throw error;
      if (data?.session?.access_token) {
        await syncBackendUser(data.session.access_token);
      }
      return data;
    } else {
      return await registerUser({ name, email, password, password_confirm });
    }
  };

  // 1-Click Sign in with Google
  const loginWithGoogle = async () => {
    if (!supabase || !supabase.auth) {
      throw new Error('Supabase client not initialized');
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;
    return data;
  };

  // Send Password Reset Email
  const forgotPassword = async (email) => {
    if (!supabase || !supabase.auth) {
      throw new Error('Supabase client not initialized');
    }
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
    return data;
  };

  // Update Password (used after user clicks reset link in email)
  const updatePassword = async (newPassword) => {
    if (!supabase || !supabase.auth) {
      throw new Error('Supabase client not initialized');
    }
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  };

  // Logout
  const logout = async () => {
    try {
      if (supabase && supabase.auth) {
        await supabase.auth.signOut();
      }
      await apiLogoutUser();
    } catch {
      // Continue cleanup even if server is unreachable
    }
    localStorage.removeItem('access_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        signup,
        loginWithGoogle,
        forgotPassword,
        updatePassword,
        logout,
        isAuthenticated: user !== null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
