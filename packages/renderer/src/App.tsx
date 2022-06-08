import styles from "@/styles/app.module.scss";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Pluto } from "./global";
import Loading from "./pages/Loading";
import PlutoFrame from "./pages/Pluto";

const App = () => {
  const [pluto, setPluto] = useState<Pluto.RunPlutoResponse>();
  const navigate = useNavigate();

  useEffect(() => {
    window.electronAPI.handlePlutoURL((event, value) => {
      console.log(value);
      setPluto(value);
    });

    return () => {};
  }, []);

  // useEffect(() => {
  //   if (pluto === "loading") {
  //     navigate("/");
  //   } else {
  //     // url available
  //     navigate("/pluto");
  //   }

  //   return () => navigate("/");
  // }, [pluto]);

  return (
    <div className={styles.app}>
      <Routes>
        <Route
          path="/"
          element={<Loading msg={(pluto as string) ?? "Starting"} />}
        />
        <Route
          path="/pluto"
          element={
            typeof pluto === "string" ? (
              <Navigate to="/" />
            ) : (
              <PlutoFrame url={pluto?.url} />
            )
          }
        />
      </Routes>
    </div>
  );
};

export default App;
