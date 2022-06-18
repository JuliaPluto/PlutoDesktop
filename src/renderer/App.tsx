import {
  MemoryRouter as Router,
  Routes,
  Route,
  Link,
  useNavigate,
} from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './App.css';
import Loading from './Loading';
// import useElectron from './useElectron';

const Hello = () => {
  // const b = useElectron();
  return (
    <div>
      <div className="Hello">
        <img width="200px" alt="icon" src={icon} />
      </div>
      <h1>electron-react-boilerplate</h1>
      <div className="Hello">
        <a
          href="https://electron-react-boilerplate.js.org/"
          target="_blank"
          rel="noreferrer"
        >
          <button type="button">
            <span role="img" aria-label="books">
              📚
            </span>
            Read our docs
          </button>
        </a>
        <Link to="/loading">
          <button type="button">
            <span role="img" aria-label="books">
              🙏
            </span>
            Donate
          </button>
        </Link>
      </div>
    </div>
  );
};

export default function App() {
  const navigate = useNavigate();

  window.electron.ipcRenderer.on('CHANGE_PAGE', (path) =>
    navigate(String(path))
  );

  return (
    <Routes>
      <Route path="/" element={<Hello />} />
      <Route path="/loading" element={<Loading />} />
    </Routes>
  );
}
