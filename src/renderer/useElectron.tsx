import { useEffect, useState } from 'react';

/**
 * A hook to check whether pluto is running inside Desktop,
 * and execute a callback if that is the case.
 * @param callback A function that takes in a window (having `plutoDesktop` as a property)
 * as its argument, if `plutoDesktop` is not found, it is not called.
 * @returns A boolean denoting whether pluto is running inside Desktop or not.
 */
const useElectron = (callback?: (window: Window) => void) => {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (window.plutoDesktop) {
      // console.log(
      //   'Running in Desktop Environment! Found following properties/methods:',
      //   window.plutoDesktop
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
