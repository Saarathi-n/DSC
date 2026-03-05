/**
 * useSettings — adapter hook that fetches AppSettings from the main Tauri backend
 * via window.nexusAPI.settings.get() and maps it to the Settings shape
 * expected by ChatPage (mirrors the intent-flow-main useSettings interface).
 */
import { useState, useEffect, useCallback } from 'react';
import type { Settings } from '../lib/chatTypes';

function mapAppSettingsToSettings(raw: Record<string, any>): Settings {
  const provider = ((raw.aiProvider || raw.ai_provider || 'nvidia') as string).toLowerCase() as Settings['ai']['provider'];
  return {
    ai: {
      enabled: true,
      provider,
      api_key: raw.nvidiaApiKey ?? raw.nvidia_api_key ?? '',
      model: raw.defaultModel ?? raw.default_model ?? 'meta/llama-3.3-70b-instruct',
      local_only: provider === 'local' || provider === 'lmstudio',
      fallback_to_local: true,
      lmstudio_url: raw.lmstudioUrl ?? raw.lmstudio_url ?? 'http://127.0.0.1:1234',
    },
  };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = (window as any).nexusAPI;
      if (api?.settings?.get) {
        const raw = await api.settings.get();
        if (raw) {
          setSettings(mapAppSettingsToSettings(raw));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { settings, isLoading, error, refresh };
}
