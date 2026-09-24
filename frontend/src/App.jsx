import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import ProtectedRoute from './components/ProtectedRoute';

const App = () => {
  return (
    <AuthProvider>
      <div className="app-layout">
        <Routes>
          {/* Public Routes without Navbar */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protected Routes (include Navbar here or via a layout component) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={
              <>
                <Navbar />
                <Home />
              </>
            } />
          </Route>
        </Routes>
      </div>
    </AuthProvider>
  );
};

export default App;
