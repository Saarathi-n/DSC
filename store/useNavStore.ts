import { create } from 'zustand';

export type Tab = 'dashboard' | 'code' | 'brain' | 'schedule' | 'zen' | 'music' | 'chat' | 'activity' | 'diary' | 'settings';

interface NavState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export const useNavStore = create<NavState>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));