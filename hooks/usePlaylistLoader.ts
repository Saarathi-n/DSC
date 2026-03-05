import { useEffect } from 'react';
import { LS_PLAYLISTS } from '../lib/constants';
import { Playlist, MusicLibrary } from '../store/useMusicStore';

export const usePlaylistLoader = (
    setPlaylists: (playlists: Playlist[]) => void,
    setLibrary: (library: MusicLibrary) => void
) => {
    useEffect(() => {
        const loadData = async () => {
            try {
                if (window.nexusAPI?.music) {
                    // Load Playlists
                    const pData = await window.nexusAPI.music.getPlaylists();
                    if (Array.isArray(pData) && pData.length > 0) {
                        setPlaylists(pData);
                    }

                    // Load Library (Liked & Recent)
                    const lData = await window.nexusAPI.music.getLibrary();
                    if (lData) {
                        setLibrary({
                            likedSongs: lData.likedSongs || [],
                            recentlyPlayed: lData.recentlyPlayed || []
                        });
                    }
                    return;
                }
            } catch (err) {
                console.error('Failed to load music data from IPC', err);
            }

            // Fallback to localStorage
            const savedP = localStorage.getItem(LS_PLAYLISTS);
            if (savedP) setPlaylists(JSON.parse(savedP));

            const savedL = localStorage.getItem('nexus_music_library');
            if (savedL) setLibrary(JSON.parse(savedL));
        };
        loadData();
    }, [setPlaylists, setLibrary]);
};
