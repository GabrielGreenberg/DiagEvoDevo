// src/main.ts — app entry. Wires the GUI into #app.

import { startApp } from './ui/app';
import { registerServiceWorker } from './pwa/register';

const root = document.querySelector<HTMLElement>('#app');
if (root) startApp(root);

// Install the offline app-shell service worker (production build only — see src/pwa/register.ts).
registerServiceWorker();
