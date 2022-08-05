import { useState } from 'react';
import { TailSpin } from 'react-loader-spinner';
import useElectron from './useElectron';

const Loading = () => {
  const [message, setMessage] = useState('');

  useElectron((window) => {
    window.plutoDesktop.ipcRenderer.on('pluto-url', (m) => {
      setMessage(String(m));
      console.log(m);
    });
  });

  return (
    <div className="container">
      <TailSpin
        ariaLabel="loading-indicator"
        color="#e6e6e6"
        wrapperStyle={{ marginTop: message.length > 0 ? '1.5em' : '0' }}
      />
      {message.length > 0 && (
        <h4
          style={{
            padding: 0,
            margin: 0,
            marginTop: '1.5em',
            textAlign: 'center',
            width: '100%',
            color: '#c4c4c4',
          }}
        >
          {message}
        </h4>
      )}
    </div>
  );
};

export default Loading;
