import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';

// Single-browser preview only. This adapter does not provide shared storage.
window.storage = {
  async get(key) {
    const value = localStorage.getItem(`ophthalmology-preview:${key}`);
    return value === null ? null : { key, value };
  },
  async set(key, value) {
    localStorage.setItem(`ophthalmology-preview:${key}`, value);
    return { key, value };
  },
};

createRoot(document.getElementById('root')).render(
  <>
    <div className="bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">로컬 테스트 · 이 브라우저에만 저장되며 다른 컴퓨터와 공유되지 않습니다.</div>
    <App />
  </>
);
