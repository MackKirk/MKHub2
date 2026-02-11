import { createContext, useContext, useEffect, useState } from 'react';

type AnimationReadyContextValue = { ready: boolean };

const AnimationReadyContext = createContext<AnimationReadyContextValue>({ ready: true });

type AnimationReadyProviderProps = {
  loaded: boolean;
  delay?: number;
  children: React.ReactNode;
};

export function AnimationReadyProvider({ loaded, delay = 50, children }: AnimationReadyProviderProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loaded) {
      setReady(false);
      return;
    }
    const timer = setTimeout(() => setReady(true), delay);
    return () => clearTimeout(timer);
  }, [loaded, delay]);

  return (
    <AnimationReadyContext.Provider value={{ ready }}>
      {children}
    </AnimationReadyContext.Provider>
  );
}

export function useAnimationReady() {
  return useContext(AnimationReadyContext);
}
