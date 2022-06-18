import { useEffect, useState } from 'react';

/**
 * A hook to check whether pluto is running inside Electron,
 * and execute a callback if that is the case.
 * @param callback A function that takes in a window (having electron as a property)
 * as its argument, if electron is not found, it is not called.
 * @returns A boolean denoting whether pluto is running inside Electron or not.
 */
const useElectron = (callback?: (window: Window) => void) => {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (window.electron) {
      // console.log(
      //   'Running in Electron Environment! Found following properties/methods:',
      //   window.electron
      // );
      setIsDesktop(true);
      if (callback) callback(window);
    }
    return () => {
      setIsDesktop(false);
    };
  }, [callback]);

  return isDesktop;
};

export default useElectron;
