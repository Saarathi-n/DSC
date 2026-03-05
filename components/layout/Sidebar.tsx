import React from 'react';
import {
  LayoutGrid, Code2, Brain, CalendarClock, Headphones, Music2,
  MessageSquare, Activity, BookOpen, Settings2
} from 'lucide-react';
import { useNavStore, Tab } from '../../store/useNavStore';

const MAIN_NAV: { id: Tab; icon: React.ElementType; label: string }[] = [
  { id: 'dashboard', icon: LayoutGrid, label: 'Dashboard' },
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'activity', icon: Activity, label: 'Activity' },
  { id: 'diary', icon: BookOpen, label: 'Diary' },
  { id: 'code', icon: Code2, label: 'Code' },
  { id: 'brain', icon: Brain, label: 'Brain' },
  { id: 'schedule', icon: CalendarClock, label: 'Schedule' },
  { id: 'zen', icon: Headphones, label: 'Zen Mode' },
  { id: 'music', icon: Music2, label: 'Music' },
];

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab } = useNavStore();

  const NavButton = ({ id, icon: Icon, label }: { id: Tab; icon: React.ElementType; label: string }) => {
    const isActive = activeTab === id;
    return (
      <button
        key={id}
        onClick={() => setActiveTab(id)}
        className={`
          group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300
          ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}
        `}
        aria-label={label}
      >
        {/* Active Glow */}
        {isActive && (
          <div className="absolute inset-0 rounded-xl bg-cyan-500/20 blur-md" />
        )}
        <Icon
          size={22}
          className={`relative z-10 transition-all duration-300 ${isActive ? 'drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : ''}`}
        />
        {/* Tooltip */}
        <div className="absolute left-14 px-2 py-1 bg-[#262626] border border-[#333] text-xs text-white rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
          {label}
        </div>
      </button>
    );
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-16 bg-[#161616] border-r border-[#262626] flex flex-col items-center py-6 z-50">
      {/* Main nav */}
      <div className="flex flex-col gap-7 flex-1">
        {MAIN_NAV.map((item) => (
          <NavButton key={item.id} {...item} />
        ))}
      </div>

      {/* Settings — pinned at bottom */}
      <div className="mt-4 pt-4 border-t border-[#262626] w-full flex flex-col items-center">
        <NavButton id="settings" icon={Settings2} label="Settings" />
      </div>
    </aside>
  );
};