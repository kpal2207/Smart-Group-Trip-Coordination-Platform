import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import ProtectedRoute from './components/ProtectedRoute';
import MyTrips from './pages/MyTrips';
import CreateTrip from './pages/CreateTrip';
import JoinTrip from './pages/JoinTrip';
import TripDetails from './pages/TripDetails';
import './styles/trip.css';

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
            <Route path="/trips" element={
              <>
                <Navbar />
                <MyTrips />
              </>
            } />
            <Route path="/trips/create" element={
              <>
                <Navbar />
                <CreateTrip />
              </>
            } />
            <Route path="/trips/join" element={
              <>
                <Navbar />
                <JoinTrip />
              </>
            } />
            <Route path="/trips/join/:tripCode" element={
              <>
                <Navbar />
                <JoinTrip />
              </>
            } />
            <Route path="/trips/:tripId" element={
              <>
                <Navbar />
                <TripDetails />
              </>
            } />
          </Route>
        </Routes>
      </div>
    </AuthProvider>
  );
};

export default App;
