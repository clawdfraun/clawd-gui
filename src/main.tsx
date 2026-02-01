import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { LoginScreen } from './components/LoginScreen'

function AuthGate() {
  const { user, loading, needsSetup } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <span className="text-text-muted text-sm">Loading...</span>
      </div>
    );
  }

  if (!user || needsSetup) {
    return <LoginScreen />;
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </StrictMode>,
)
