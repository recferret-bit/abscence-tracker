/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import { AuthProvider, useAuth } from './lib/auth-context';
import { DataProvider } from './lib/data-context';

function AuthLoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F1F5F9] text-slate-400 text-xs uppercase tracking-widest font-bold">
      Loading...
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return <AuthLoadingScreen />;
  }
  if (status !== 'authenticated') return <Navigate to="/login" replace />;
  return <DataProvider>{children}</DataProvider>;
}

function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') {
    return <AuthLoadingScreen />;
  }
  if (status === 'authenticated' && user?.role === 'VIEWER') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AdminOnlyRoute>
                  <SettingsPage />
                </AdminOnlyRoute>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
