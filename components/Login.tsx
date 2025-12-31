import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase';
import React from 'react';

const Login = () => {
  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google Sign-In Error:", error);
    }
  };

  return (
    <div className="login-container">
      <header className="login-top-logo">
        <div className="app-icon">L</div>
        <div className="app-title-group">
          <span className="app-title">Life OS</span>
          <span className="app-version">VERSION 2.0</span>
        </div>
      </header>

      <main className="login-main">
        <div className="login-card">
          <div className="login-header">
            <h1>Welcome home.</h1>
            <p>Your life, perfectly synchronized and beautifully ordered.</p>
          </div>
          <button className="login-button" onClick={handleGoogleLogin}>
            <div className="google-icon-wrapper">
              <GoogleIcon />
            </div>
            <span>Sign in with Google</span>
          </button>
          <div className="system-status">SYSTEM READY</div>
        </div>
        <footer className="login-footer-legal">
          <p>Life OS is built with privacy-first encryption.</p>
          <div>
            <a href="#">Privacy Policy</a>
            <span>•</span>
            <a href="#">Terms</a>
          </div>
        </footer>
      </main>

      <footer className="login-bottom-motto">
        <div className="motto-item">
          <div className="motto-dot" style={{ '--dot-color': '#8B5CF6' }} />
          <span>FOCUS</span>
        </div>
        <div className="motto-item">
          <div className="motto-dot" style={{ '--dot-color': '#EC4899' }} />
          <span>HARMONY</span>
        </div>
        <div className="motto-item">
          <div className="motto-dot" style={{ '--dot-color': '#10B981' }} />
          <span>INSIGHT</span>
        </div>
      </footer>
    </div>
  );
};

// SVG component for the Google Icon
const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" >
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

export default Login;
