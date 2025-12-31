import type React from 'react';
import { createContext, useContext } from 'react';

type AddonContextType = any | null;

const AddonContext = createContext<AddonContextType>(null);

export function AddonProvider({ children, addon }: { children: React.ReactNode; addon: any }) {
  return <AddonContext.Provider value={addon}>{children}</AddonContext.Provider>;
}

export function useAddon() {
  return useContext(AddonContext);
}
