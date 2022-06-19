import { createRoot } from 'react-dom/client';
import './App.css';
import Loading from './Loading';

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<Loading />);

// calling IPC exposed from preload script
window.electron.ipcRenderer.once('ipc-example', (arg) => {
  // eslint-disable-next-line no-console
  console.log(arg);
});
window.electron.ipcRenderer.sendMessage('ipc-example', ['ping']);
