// todo: complete context setup for storing user data

import { createContext, useContext, useMemo } from 'react';

type GlobalContextValue = Record<string, never>;

const GlobalContext = createContext<GlobalContextValue | null>(null);

// Storage key for future persistence
// const storageKey = 'root:global';

const GlobalContextProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useMemo(() => ({}), []);

  return (
    <GlobalContext.Provider value={value}>{children}</GlobalContext.Provider>
  );
};

export const useGlobal = () => {
  const ctx = useContext(GlobalContext);
  if (!ctx) {
    throw new Error('useGlobal must be used within an AuthContextProvider');
  }
  return ctx;
};

export default GlobalContextProvider;
