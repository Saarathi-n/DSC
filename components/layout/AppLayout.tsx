import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { useIntentStore } from '../../store/useIntentStore';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const settings = useIntentStore((s) => s.settings);
  const fontScale = settings?.fontScale || 1;
  const compactMode = settings?.compactMode || false;

  useEffect(() => {
    // Tailwind uses rem for sizing. To scale the entire UI (text and spacing), 
    // we must change the root html element's font-size.
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
  }, [fontScale]);

  return (
    <div className="flex min-h-screen w-full bg-[#0a0a0a] text-white overflow-hidden font-sans">
      <Sidebar />
      {/* 
        Main content wrapper
        ml-16 matches the width of the sidebar (w-16) to prevent overlap 
      */}
      <main className="flex-1 ml-16 h-screen overflow-y-auto relative">
        <div className={`h-full w-full transition-all duration-300 ${compactMode ? 'p-0' : 'p-4'}`}>
          {children}
        </div>
      </main>
    </div>
  );
};