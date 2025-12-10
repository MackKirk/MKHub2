import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { register } from './sw-registration';

// Register service worker in production
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  register({
    onUpdate: (registration) => {
      console.log('New service worker available');
      // Optionally show update notification to user
    },
    onSuccess: (registration) => {
      console.log('Service worker registered successfully');
    },
    onControllerChange: () => {
      // Optionally reload page when new SW takes control
      // window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


