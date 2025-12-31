import type React from 'react';
import { createContext, useContext } from 'react';

type AddonContextValue = {
  addon: any;
  fromDate: string;
  toDate: string;
  isPrivateMode: boolean;
  currency: string;
};

const AddonContext = createContext<AddonContextValue | undefined>(undefined);

export function AddonProvider({
  children,
  addon,
  fromDate,
  toDate,
  isPrivateMode,
  currency,
}: {
  children: React.ReactNode;
  addon: any;
  fromDate: string;
  toDate: string;
  isPrivateMode: boolean;
  currency: string;
}) {
  return (
    <AddonContext.Provider value={{ addon, fromDate, toDate, isPrivateMode, currency }}>
      {children}
    </AddonContext.Provider>
  );
}

export function useAddon() {
  const context = useContext(AddonContext);
  if (!context) {
    throw new Error('useAddon must be used within AddonProvider');
  }
  return context.addon;
}

export function useAddonContext() {
  const context = useContext(AddonContext);
  if (!context) {
    throw new Error('useAddonContext must be used within AddonProvider');
  }
  return context;
}
