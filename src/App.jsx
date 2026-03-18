import { Routes, Route, Navigate } from 'react-router-dom';
import { isAuthenticated } from './api';
import BondsPage from './pages/BondsPage';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './components/LoginPage';
import './style.css';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated() ? <Navigate to="/" replace /> : <LoginPage />
      } />
      <Route path="/*" element={
        <PrivateRoute><BondsPage /></PrivateRoute>
      } />
    </Routes>
  );
}
