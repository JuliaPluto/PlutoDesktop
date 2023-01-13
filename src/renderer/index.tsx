import './App.css';

import { createRoot } from 'react-dom/client';

import Loading from './Loading';

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<Loading />);

// calling IPC exposed from preload script
window.plutoDesktop.ipcRenderer.once('ipc-example', (arg) => {
  console.log(arg);
});
window.plutoDesktop.ipcRenderer.sendMessage('ipc-example', ['ping']);
