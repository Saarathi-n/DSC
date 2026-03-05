import React, { useEffect } from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { AppLayout } from './components/layout/AppLayout';
import { useNavStore } from './store/useNavStore';
import { useIntentStore } from './store/useIntentStore';
import { DashboardView } from './views/DashboardView';
import { CodeView } from './views/CodeView';
import { BrainView } from './views/BrainView';
import { ScheduleView } from './views/ScheduleView';
import { ZenView } from './views/ZenView';
import { MusicView } from './views/MusicView';
import { ChatView } from './views/ChatView';
import { ActivityView } from './views/ActivityView';
import { DiaryView } from './views/DiaryView';
import { SettingsView } from './views/SettingsView';
import { GlobalWidgets } from './components/GlobalWidgets';
import { useMusicStore } from './store/useMusicStore';
import { useTimerStore } from './store/useTimerStore';
import { TrayPanelView } from './views/TrayPanelView';

const App: React.FC = () => {
  const isTrayPanelWindow = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('window') === 'tray';
  const activeTab = useNavStore((state) => state.activeTab);
  const setActiveTab = useNavStore((state) => state.setActiveTab);
  const setSettings = useIntentStore((s) => s.setSettings);
  const toggleMusic = useMusicStore((s) => s.togglePlay);
  const nextTrack = useMusicStore((s) => s.nextTrack);
  const prevTrack = useMusicStore((s) => s.prevTrack);
  const setActivePlaylist = useMusicStore((s) => s.setActivePlaylist);

  // Load settings from backend on startup so all views have API keys available
  useEffect(() => {
    if (isTrayPanelWindow) return;
    const load = async () => {
      try {
        if (window.nexusAPI?.settings) {
          const data = await window.nexusAPI.settings.get();
          if (data) setSettings(data);
        }
      } catch { /* settings will use defaults */ }
    };
    load();
  }, [isTrayPanelWindow, setSettings]);

  useEffect(() => {
    if (isTrayPanelWindow) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const register = async (promise: Promise<() => void>) => {
      const unlisten = await promise;
      if (disposed) {
        try { unlisten(); } catch { }
        return;
      }
      unlisteners.push(unlisten);
    };
    const setup = async () => {
      try {
        await register(listen<string>('tray:navigate', (event) => {
          const next = (event.payload || '').toLowerCase();
          if (next) {
            setActiveTab(next as any);
          }
        }));
        await register(listen<string>('tray:music-control', (event) => {
          const action = (event.payload || '').toLowerCase();
          if (action === 'play_pause') toggleMusic();
          if (action === 'next') nextTrack();
          if (action === 'prev') prevTrack();
        }));
        await register(listen<number | { playlistId?: number }>('tray:music-playlist-select', (event) => {
          const payload = event.payload as any;
          const id = typeof payload === 'number' ? payload : Number(payload?.playlistId);
          if (!Number.isNaN(id) && id > 0) {
            setActivePlaylist(id);
          }
        }));
        await register(listen<{ action?: string; minutes?: number }>('tray:timer-control', (event) => {
          const payload = event.payload || {};
          const action = (payload.action || '').toLowerCase();
          const minutes = Number(payload.minutes || 0);
          const timer = useTimerStore.getState();
          const music = useMusicStore.getState();

          const startTopPlaylist = () => {
            const top = music.playlists?.[0];
            if (top?.id) {
              music.setActivePlaylist(top.id);
            } else if (music.currentTrack) {
              music.play();
            }
          };

          if (action === 'start') timer.start();
          if (action === 'pause') timer.pause();
          if (action === 'toggle') {
            if (timer.isActive) timer.pause();
            else timer.start();
          }
          if (action === 'reset') timer.reset();
          if (action === 'set_duration' && minutes > 0) {
            timer.reset(minutes * 60);
          }

          if (action === 'start' || (action === 'toggle' && !timer.isActive)) {
            startTopPlaylist();
          }
        }));
        await register(listen<boolean>('tray:request-state', () => {
          publishStateToTray().catch(() => { /* ignore */ });
        }));
        await register(listen<boolean>('tray:refresh-ai', () => {
          setActiveTab('dashboard');
          window.dispatchEvent(new CustomEvent('allentire:refresh-dashboard'));
        }));
        await register(listen<{ active: boolean; remainingSeconds: number }>('tray:incognito-tick', (event) => {
          window.dispatchEvent(new CustomEvent('allentire:incognito-tick', { detail: event.payload }));
        }));
        await register(listen<boolean>('tray:clear-notifications', () => {
          window.dispatchEvent(new CustomEvent('allentire:clear-notifications'));
        }));
      } catch {
        // non-tauri runtime
      }
    };
    setup();
    return () => {
      disposed = true;
      try {
        for (const unlisten of unlisteners) {
          unlisten();
        }
      } catch { }
    };
  }, [isTrayPanelWindow, setActiveTab, toggleMusic, nextTrack, prevTrack, setActivePlaylist]);

  const publishStateToTray = async () => {
    const timer = useTimerStore.getState();
    const music = useMusicStore.getState();
    await emitTo('tray_panel', 'app:timer-state', {
      timeLeft: timer.timeLeft,
      isActive: timer.isActive,
      mode: timer.mode,
    });
    await emitTo('tray_panel', 'app:music-state', {
      isPlaying: music.isPlaying,
      currentTrack: music.currentTrack
        ? {
            id: music.currentTrack.id,
            title: music.currentTrack.title,
            thumbnail: music.currentTrack.thumbnail,
          }
        : null,
      activePlaylistId: music.activePlaylistId,
      playlists: (music.playlists || []).map((p) => ({
        id: p.id,
        name: p.name,
        trackCount: p.tracks.length,
        thumbnail: p.tracks[0]?.thumbnail || '',
      })),
    });
  };

  useEffect(() => {
    if (isTrayPanelWindow) return;
    publishStateToTray().catch(() => { /* ignore non-tauri runtime */ });
    const interval = window.setInterval(() => {
      publishStateToTray().catch(() => { /* ignore transient emit errors */ });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isTrayPanelWindow]);

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView />;
      case 'chat': return <ChatView />;
      case 'activity': return <ActivityView />;
      case 'diary': return <DiaryView />;
      case 'code': return <CodeView />;
      case 'brain': return <BrainView />;
      case 'schedule': return <ScheduleView />;
      case 'zen': return <ZenView />;
      case 'music': return <MusicView />;
      case 'settings': return <SettingsView />;
      default: return null;
    }
  };

  if (isTrayPanelWindow) {
    return <TrayPanelView />;
  }

  return (
    <AppLayout>
      {renderContent()}
      <GlobalWidgets />
    </AppLayout>
  );
};

export default App;
