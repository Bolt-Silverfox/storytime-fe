// todo: complete context setup for storing user data

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type GlobalContextValue = {};

const GlobalContext = createContext<GlobalContextValue | null>(null);

const storageKey = 'root:global';

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
