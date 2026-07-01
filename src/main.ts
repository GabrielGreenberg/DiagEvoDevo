// src/main.ts — app entry. Wires the GUI into #app.

import { startApp } from './ui/app';

const root = document.querySelector<HTMLElement>('#app');
if (root) startApp(root);
