// frontend/src/entries/emoji-plaza.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { EmojiPlazaPage } from '@/pages/emoji-plaza-page';
import '@/styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EmojiPlazaPage />
  </React.StrictMode>
);
