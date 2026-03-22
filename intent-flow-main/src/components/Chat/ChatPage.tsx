import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChatSession, ChatMessage as ChatMessageType } from '../../types';
import {
    createChatSession,
    getChatSessions,
    deleteChatSession,
    getChatMessages,
    sendChatMessage,
    getNvidiaModels,
    getLMStudioModels,
    type ModelInfo,
} from '../../services/tauri';
import { ChatMessage } from './ChatMessage';
import {
    Send,
    Loader2,
    Bot,
    Sparkles,
    ChevronDown,
    Grid3X3,
    Calendar,
    Check,
    Plus,
    Trash2,
    MessageSquare,
    PanelLeftClose,
    PanelLeft,
    Cloud,
    Cpu,
    RefreshCw,
    Zap,
    Clock,
    BarChart2,
    Music2,
    Star,
    Sun,
    Calendar as CalendarIcon,
    SlidersHorizontal,
    AlertCircle,
    Brain,
    Leaf,
    BriefcaseBusiness,
    Search,
} from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { useFavoriteModels } from '../../hooks/useFavoriteModels';
import { useSettings } from '../../hooks/useSettings';

// Source options
const SOURCE_OPTIONS = [
    { id: 'apps', label: 'Applications', default: true },
    { id: 'screen', label: 'Screen Text (OCR)', default: true },
    { id: 'media', label: 'Media / Music', default: true },
    { id: 'browser', label: 'Browser History', default: false },
    { id: 'files', label: 'Files & Documents', default: false },
];

// Time range options
const TIME_RANGE_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'last_3_days', label: 'Last 3 Days' },
    { id: 'last_7_days', label: 'Last 7 Days' },
    { id: 'last_30_days', label: 'Last 30 Days' },
    { id: 'this_year', label: 'This Year' },
    { id: 'all_time', label: 'All Time' },
];

// Quick suggestion cards for the empty state
const SUGGESTION_CARDS = [
    {
        icon: Sun,
        label: 'Morning Brief',
        prompt: 'Everything to kickstart your day',
        color: 'text-yellow-500',
        bg: 'bg-[#0a0a0a] border-[#262626]',
    },
    {
        icon: Calendar,
        label: 'Standup Update',
        prompt: 'What you did, what\'s next, any blockers',
        color: 'text-emerald-500',
        bg: 'bg-[#0a0a0a] border-[#262626]',
    },
    {
        icon: SlidersHorizontal,
        label: 'Custom Summary',
        prompt: 'Custom time, filters & instructions',
        color: 'text-purple-500',
        bg: 'bg-[#0a0a0a] border-[#262626]',
    },
    {
        icon: AlertCircle,
        label: 'Top of Mind',
        prompt: 'Recurring topics ranked by importance',
        color: 'text-red-500',
        bg: 'bg-[#0a0a0a] border-[#262626]',
    },
    {
        icon: Brain,
        label: 'AI Habits',
        prompt: 'AI usage patterns and model preferences',
        color: 'text-purple-400',
        bg: 'bg-[#0a0a0a] border-[#262626]',
    },
    {
        icon: Leaf,
        label: 'Discover',
        prompt: 'Reminders, Recaps, and More',
        color: 'text-emerald-400',
        bg: 'bg-[#0a0a0a] border-[#262626]',
    },
];

interface ChatPageProps {
    initialPrompt?: string;
}

const CHAT_MODEL_STORAGE_KEY = 'intentflow_chat_selected_model';

interface ConfirmActionPayload {
    kind: string;
    reason: string;
    suggested_time_range?: string;
    enable_sources?: string[];
    retry_message: string;
}

interface ParsedAssistantAction {
    cleanedContent: string;
    action: ConfirmActionPayload | null;
}

function parseAssistantAction(content: string): ParsedAssistantAction {
    const marker = /\[\[IF_ACTION:(\{[\s\S]*\})\]\]/m;
    const match = content.match(marker);
    if (!match) {
        return { cleanedContent: content, action: null };
    }
    let action: ConfirmActionPayload | null = null;
    try {
        action = JSON.parse(match[1]) as ConfirmActionPayload;
    } catch {
        action = null;
    }
    const cleanedContent = content.replace(marker, '').trim();
    return { cleanedContent, action };
}

function loadSelectedModelFromStorage(): string {
    try {
        return localStorage.getItem(CHAT_MODEL_STORAGE_KEY) || '';
    } catch {
        return '';
    }
}

export function ChatPage({ initialPrompt }: ChatPageProps) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessageType[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [agentStatus, setAgentStatus] = useState('');
    const [displayedStatus, setDisplayedStatus] = useState('');
    const [showHistory, setShowHistory] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const initialPromptHandled = useRef(false);

    // Dropdown states
    const [showModelDropdown, setShowModelDropdown] = useState(false);
    const [showSourcesDropdown, setShowSourcesDropdown] = useState(false);
    const [showTimeDropdown, setShowTimeDropdown] = useState(false);
    const [selectedSources, setSelectedSources] = useState<string[]>(
        SOURCE_OPTIONS.filter((s) => s.default).map((s) => s.id)
    );
    const [selectedTimeRange, setSelectedTimeRange] = useState('today');
    const [selectedModel, setSelectedModel] = useState<string>(loadSelectedModelFromStorage);
    const [pendingAction, setPendingAction] = useState<ConfirmActionPayload | null>(null);

    // Cloud vs Local toggle
    const [modelMode, setModelMode] = useState<'cloud' | 'local'>('cloud');
    const [lmStudioModels, setLmStudioModels] = useState<ModelInfo[]>([]);
    const [lmStudioLoading, setLmStudioLoading] = useState(false);
    const [lmStudioError, setLmStudioError] = useState<string | null>(null);
    const [cloudModels, setCloudModels] = useState<ModelInfo[]>([]);
    const [cloudLoading, setCloudLoading] = useState(false);
    const [cloudError, setCloudError] = useState<string | null>(null);
    const [modelSearch, setModelSearch] = useState('');
    const [customModelInput, setCustomModelInput] = useState('');

    // Hooks
    const { favorites, addFavorite } = useFavoriteModels();
    const { settings } = useSettings();

    // Refs for dropdowns
    const modelRef = useRef<HTMLDivElement>(null);
    const sourcesRef = useRef<HTMLDivElement>(null);
    const timeRef = useRef<HTMLDivElement>(null);

    // Sync selected model with Settings model updates only if user has no explicit chat selection.
    useEffect(() => {
        if (!settings?.ai.model) return;
        if (!selectedModel) {
            setSelectedModel(settings.ai.model);
        }
    }, [settings?.ai.model, selectedModel]);

    useEffect(() => {
        try {
            if (selectedModel) {
                localStorage.setItem(CHAT_MODEL_STORAGE_KEY, selectedModel);
            } else {
                localStorage.removeItem(CHAT_MODEL_STORAGE_KEY);
            }
        } catch {
            // ignore storage errors
        }
    }, [selectedModel]);

    const fetchLMStudioModels = useCallback(async () => {
        setLmStudioLoading(true);
        setLmStudioError(null);
        const lmStudioUrl = settings?.ai.lmstudio_url ?? 'http://127.0.0.1:1234';
        try {
            const models = await getLMStudioModels(lmStudioUrl);
            setLmStudioModels(models);
            if (models.length > 0 && !selectedModel) {
                setSelectedModel(models[0].id);
            }
        } catch {
            setLmStudioError(`LM Studio not reachable at ${lmStudioUrl}`);
            setLmStudioModels([]);
        } finally {
            setLmStudioLoading(false);
        }
    }, [selectedModel, settings?.ai.lmstudio_url]);

    const fetchCloudModels = useCallback(async () => {
        const apiKey = settings?.ai.api_key?.trim() || '';
        setCloudLoading(true);
        setCloudError(null);
        try {
            const models = await getNvidiaModels(apiKey);
            setCloudModels(models);
        } catch (error) {
            setCloudModels([]);
            const message = error instanceof Error ? error.message : String(error);
            if (message.toLowerCase().includes('missing nvidia api key')) {
                setCloudError('Cloud model list needs an API key in Settings or NVIDIA_API_KEY env var.');
            } else {
                setCloudError(`Failed to load cloud model list (${message || 'unknown error'}). Chat may still work with your current model selection.`);
            }
        } finally {
            setCloudLoading(false);
        }
    }, [settings?.ai.api_key]);

    // Sync modelMode from settings.ai.provider (mirrors CodeView/BrainView aiProvider derivation)
    useEffect(() => {
        if (!settings) return;
        const provider = (settings.ai.provider || 'nvidia').toLowerCase();
        const isLocal = provider === 'local' || provider === 'lmstudio';
        setModelMode(isLocal ? 'local' : 'cloud');
    }, [settings?.ai.provider]);

    // Auto-fetch models when mode changes (mirrors CodeView/BrainView fetchModels useEffect)
    useEffect(() => {
        if (modelMode === 'local') {
            fetchLMStudioModels();
            return;
        }
        fetchCloudModels();
    }, [modelMode, fetchLMStudioModels, fetchCloudModels]);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
                setShowModelDropdown(false);
            }
            if (sourcesRef.current && !sourcesRef.current.contains(e.target as Node)) {
                setShowSourcesDropdown(false);
            }
            if (timeRef.current && !timeRef.current.contains(e.target as Node)) {
                setShowTimeDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Load sessions on mount
    useEffect(() => {
        loadSessions();
    }, []);

    // Handle initial prompt (from Homepage summary cards)
    useEffect(() => {
        if (initialPrompt && !initialPromptHandled.current && !isSending) {
            initialPromptHandled.current = true;
            setInput(initialPrompt);
            // Auto-send after a short delay to let state settle
            setTimeout(() => {
                handleSendWithMessage(initialPrompt);
            }, 300);
        }
    }, [initialPrompt]);

    // Load messages when active session changes
    useEffect(() => {
        if (activeSessionId) {
            loadMessages(activeSessionId);
        } else {
            setMessages([]);
        }
        setStreamingContent('');
    }, [activeSessionId]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, streamingContent]);

    // Listen for streaming tokens
    useEffect(() => {
        let unlistenToken: (() => void) | undefined;
        let unlistenStatus: (() => void) | undefined;
        let unlistenDone: (() => void) | undefined;
        async function setupListener() {
            unlistenToken = await listen<string>('chat://token', (event) => {
                setStreamingContent((prev) => prev + event.payload);
            });
            unlistenStatus = await listen<string>('chat://status', (event) => {
                setAgentStatus(event.payload || '');
            });
            unlistenDone = await listen<string>('chat://done', () => {
                setAgentStatus('');
                setDisplayedStatus('');
            });
        }
        setupListener();
        return () => {
            if (unlistenToken) unlistenToken();
            if (unlistenStatus) unlistenStatus();
            if (unlistenDone) unlistenDone();
        };
    }, []);

    useEffect(() => {
        if (!agentStatus) {
            setDisplayedStatus('');
            return;
        }
        let i = 0;
        const timer = window.setInterval(() => {
            i = Math.min(i + 1, agentStatus.length);
            setDisplayedStatus(agentStatus.slice(0, i));
            if (i >= agentStatus.length) {
                window.clearInterval(timer);
            }
        }, 12);
        return () => window.clearInterval(timer);
    }, [agentStatus]);

    const loadSessions = async () => {
        try {
            const data = await getChatSessions();
            setSessions(data);
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    };

    const loadMessages = async (sessionId: string) => {
        try {
            const data = await getChatMessages(sessionId);
            setMessages(data);
        } catch (error) {
            console.error('Failed to load messages:', error);
        }
    };

    const handleNewSession = async () => {
        try {
            const session = await createChatSession();
            setSessions((prev) => [session, ...prev]);
            setActiveSessionId(session.id);
            setMessages([]);
            setInput('');
            setStreamingContent('');
            inputRef.current?.focus();
        } catch (error) {
            console.error('Failed to create session:', error);
        }
    };

    const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await deleteChatSession(id);
            setSessions((prev) => prev.filter((s) => s.id !== id));
            if (activeSessionId === id) {
                setActiveSessionId(null);
                setMessages([]);
            }
        } catch (error) {
            console.error('Failed to delete session:', error);
        }
    };

    const handleSendWithMessage = async (
        messageText: string,
        overrides?: { timeRange?: string; sources?: string[] }
    ) => {
        if (!messageText.trim() || isSending) return;

        setShowModelDropdown(false);
        setShowSourcesDropdown(false);
        setShowTimeDropdown(false);

        let sessionId = activeSessionId;
        if (!sessionId) {
            try {
                const session = await createChatSession();
                setSessions((prev) => [session, ...prev]);
                setActiveSessionId(session.id);
                sessionId = session.id;
            } catch (error) {
                console.error('Failed to create session:', error);
                return;
            }
        }

        setInput('');
        setIsSending(true);
        setStreamingContent('');
        setAgentStatus('Preparing search...');

        const tempUserMsg: ChatMessageType = {
            id: Date.now(),
            session_id: sessionId,
            role: 'user',
            content: messageText.trim(),
            created_at: Math.floor(Date.now() / 1000),
        };
        setMessages((prev) => [...prev, tempUserMsg]);

        try {
            const response = await sendChatMessage(
                sessionId,
                messageText.trim(),
                selectedModel || undefined,
                modelMode === 'local' ? 'local' : 'cloud',
                overrides?.timeRange || selectedTimeRange,
                overrides?.sources || selectedSources
            );
            const { cleanedContent, action } = parseAssistantAction(response.content);
            const normalizedResponse: ChatMessageType = {
                ...response,
                content: cleanedContent || 'Please confirm the suggested scope/source update to continue.',
            };
            if (selectedModel) {
                const selected = favorites.find((f) => f.id === selectedModel);
                addFavorite({ id: selectedModel, name: selected?.name || selectedModel });
            }
            setMessages((prev) => [...prev, normalizedResponse]);
            if (action?.kind === 'confirm_scope_or_sources') {
                setPendingAction(action);
            }
            loadSessions(); // Refresh sessions to update titles
        } catch (error) {
            console.error('Failed to send message:', error);
            const errorMsg: ChatMessageType = {
                id: Date.now() + 1,
                session_id: sessionId,
                role: 'assistant',
                content: `Sorry, something went wrong: ${error}`,
                created_at: Math.floor(Date.now() / 1000),
            };
            setMessages((prev) => [...prev, errorMsg]);
        } finally {
            setIsSending(false);
            setStreamingContent('');
            setAgentStatus('');
            setDisplayedStatus('');
        }
    };

    const handleSend = () => handleSendWithMessage(input);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const toggleSource = (sourceId: string) => {
        setSelectedSources((prev) =>
            prev.includes(sourceId)
                ? prev.filter((s) => s !== sourceId)
                : [...prev, sourceId]
        );
    };

    const renderStreamingMessage = () => {
        if (!streamingContent) return null;
        const normalized = streamingContent.trim();
        const looksLikeToolJson =
            normalized.startsWith('{') ||
            normalized.startsWith(', "reasoning"') ||
            streamingContent.includes('"tool"') ||
            streamingContent.includes('"args"') ||
            streamingContent.includes('"reasoning"') ||
            streamingContent.includes('<|tool_') ||
            streamingContent.includes('tool_call_');
        if (looksLikeToolJson) {
            const toolNameMatch = streamingContent.match(/"tool"\s*:\s*"([^"]+)"/);
            const reasoningMatch = streamingContent.match(/"reasoning"\s*:\s*"([\s\S]*?)"/);
            const toolName = toolNameMatch?.[1] || 'tool';
            const reasoningText = reasoningMatch?.[1]
                ?.replace(/\\"/g, '"')
                ?.replace(/\\n/g, '\n')
                ?.trim();
            return (
                <div className="flex justify-start mb-4 animate-pulse">
                    <div className="max-w-[85%] bg-white/5 rounded-2xl rounded-bl-md px-4 py-3 border border-[#333]">
                        <div className="flex items-center gap-2 text-cyan-400 mb-2">
                            <Bot className="w-4 h-4" />
                            <span className="text-sm font-medium">Thinking</span>
                        </div>
                        <div className="text-xs text-gray-300 space-y-1">
                            {reasoningText && <p className="whitespace-pre-wrap">{reasoningText}</p>}
                            <p className="text-gray-400">Running `{toolName}`...</p>
                        </div>
                    </div>
                </div>
            );
        }
        const tempMsg: ChatMessageType = {
            id: -1,
            session_id: activeSessionId || '',
            role: 'assistant',
            content: streamingContent,
            created_at: Date.now() / 1000,
        };
        return <ChatMessage message={tempMsg} isStreaming={true} />;
    };

    const getModelDisplayName = () => {
        if (!selectedModel) return 'Select Model';
        const fav = favorites.find((f) => f.id === selectedModel);
        if (fav) return fav.name;
        const cloud = cloudModels.find((m) => m.id === selectedModel);
        if (cloud) return cloud.name;
        const local = lmStudioModels.find((m) => m.id === selectedModel);
        if (local) return local.name;
        const parts = selectedModel.split('/');
        return parts[parts.length - 1] || selectedModel;
    };

    const selectChatModel = (modelId: string, modelName?: string) => {
        const normalizedId = modelId.trim();
        if (!normalizedId) return;
        setSelectedModel(normalizedId);
        addFavorite({ id: normalizedId, name: modelName || normalizedId });
        setShowModelDropdown(false);
        setModelSearch('');
        setCustomModelInput('');
    };

    const uniqueCloudModels = Array.from(
        new Map(
            [
                ...cloudModels,
                ...favorites.map((f) => ({ id: f.id, name: f.name })),
                ...(settings?.ai.model ? [{ id: settings.ai.model, name: settings.ai.model }] : []),
            ].map((model) => [model.id, model])
        ).values()
    );

    const filteredCloudModels = uniqueCloudModels.filter((model) => {
        const query = modelSearch.trim().toLowerCase();
        if (!query) return true;
        return model.name.toLowerCase().includes(query) || model.id.toLowerCase().includes(query);
    });

    const getTimeRangeLabel = () =>
        TIME_RANGE_OPTIONS.find((t) => t.id === selectedTimeRange)?.label || 'Today';

    const getSourcesSummary = () => {
        if (selectedSources.length === SOURCE_OPTIONS.length) return 'All Sources';
        if (selectedSources.length === 0) return 'No Sources';
        return `${selectedSources.length} Sources`;
    };

    const getSourceLabelById = (id: string) =>
        SOURCE_OPTIONS.find((s) => s.id === id)?.label || id;

    const getTimeRangeLabelById = (id?: string) =>
        TIME_RANGE_OPTIONS.find((t) => t.id === id)?.label || id || '';

    const handleConfirmAction = async () => {
        if (!pendingAction) return;
        const nextTimeRange = pendingAction.suggested_time_range || selectedTimeRange;
        const nextSources = Array.from(
            new Set([...(selectedSources || []), ...(pendingAction.enable_sources || [])])
        );

        if (pendingAction.suggested_time_range) {
            setSelectedTimeRange(nextTimeRange);
        }
        if ((pendingAction.enable_sources || []).length > 0) {
            setSelectedSources(nextSources);
        }

        const retryMessage = pendingAction.retry_message || input.trim();
        setPendingAction(null);
        await handleSendWithMessage(retryMessage, {
            timeRange: nextTimeRange,
            sources: nextSources,
        });
    };

    const formatSessionDate = (timestamp: number) => {
        const d = new Date(timestamp * 1000);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const hasMessages = messages.length > 0;

    // Control bar (shared between empty and message states)
    const controlBar = (
        <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
                {/* Cloud / Local toggle */}
                <div className="flex items-center rounded-full bg-white/5 border border-[#333]/50 p-0.5">
                    <button
                        onClick={() => setModelMode('cloud')}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${modelMode === 'cloud' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        <Cloud className="w-3 h-3" /> Cloud
                    </button>
                    <button
                        onClick={() => setModelMode('local')}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${modelMode === 'local' ? 'bg-emerald-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                    >
                        <Cpu className="w-3 h-3" /> Local
                    </button>
                </div>

                {/* Model selector */}
                <div className="relative" ref={modelRef}>
                    <button
                        onClick={() => {
                            setShowModelDropdown(!showModelDropdown);
                            setShowSourcesDropdown(false);
                            setShowTimeDropdown(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-[#333]/50 text-sm text-gray-200 hover:text-white hover:border-[#444] transition-colors"
                    >
                        {modelMode === 'local' ? (
                            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        )}
                        <span className="text-xs font-medium max-w-[140px] truncate">{getModelDisplayName()}</span>
                        <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showModelDropdown && (
                        <div className="absolute bottom-full mb-2 left-0 w-72 bg-white/5 border border-[#333] rounded-xl shadow-2xl shadow-black/40 z-50 py-1 max-h-72 overflow-y-auto">
                            {modelMode === 'local' ? (
                                <>
                                    <div className="px-3 py-2 border-b border-[#333]/50 flex items-center justify-between">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">LM Studio — Loaded Models</p>
                                            <p className="text-[10px] text-gray-500 truncate">{settings?.ai.lmstudio_url ?? 'http://127.0.0.1:1234'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] ${lmStudioError ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {lmStudioError ? 'Offline' : 'Online'}
                                            </span>
                                            <button onClick={fetchLMStudioModels} className="text-gray-400 hover:text-white transition-colors" title="Refresh">
                                                {lmStudioLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </div>
                                    {lmStudioError ? (
                                        <div className="px-3 py-4 text-center">
                                            <p className="text-xs text-red-400">{lmStudioError}</p>
                                            <p className="text-[10px] text-gray-500 mt-1">Make sure LM Studio is running with the server enabled</p>
                                        </div>
                                    ) : lmStudioLoading ? (
                                        <div className="px-3 py-4 flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                                            <p className="text-xs text-gray-400">Detecting models...</p>
                                        </div>
                                    ) : lmStudioModels.length === 0 ? (
                                        <div className="px-3 py-4 text-center">
                                            <p className="text-xs text-gray-500">No models loaded</p>
                                            <p className="text-[10px] text-gray-600 mt-1">Load a model in LM Studio first</p>
                                        </div>
                                    ) : (
                                        lmStudioModels.map((model) => (
                                            <button
                                                key={model.id}
                                                onClick={() => selectChatModel(model.id, model.name)}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition-colors ${selectedModel === model.id ? 'text-emerald-400' : 'text-gray-200'}`}
                                            >
                                                <Cpu className="w-3.5 h-3.5 flex-shrink-0" />
                                                <span className="flex-1 truncate text-xs">{model.name}</span>
                                                {selectedModel === model.id && <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                                            </button>
                                        ))
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="px-3 py-2 border-b border-[#333]/50">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cloud Models (Chat Only)</p>
                                        <div className="mt-2 relative">
                                            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2 top-1.5" />
                                            <input
                                                value={modelSearch}
                                                onChange={(e) => setModelSearch(e.target.value)}
                                                placeholder="Search models"
                                                className="w-full bg-[#111] border border-[#333] rounded-md pl-7 pr-2 py-1.5 text-[11px] text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#555]"
                                            />
                                        </div>
                                    </div>
                                    {cloudError && (
                                        <div className="px-3 py-2.5 border-b border-[#333]/50">
                                            <p className="text-[11px] text-amber-300">{cloudError}</p>
                                        </div>
                                    )}
                                    {cloudLoading ? (
                                        <div className="px-3 py-4 flex items-center justify-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                            <p className="text-xs text-gray-400">Loading models...</p>
                                        </div>
                                    ) : filteredCloudModels.length === 0 ? (
                                        <div className="px-3 py-4 text-center">
                                            <p className="text-xs text-gray-500">No matching models</p>
                                            <p className="text-[10px] text-gray-600 mt-1">Type a model ID below to use any model</p>
                                        </div>
                                    ) : (
                                        filteredCloudModels.map((model) => (
                                            <button
                                                key={model.id}
                                                onClick={() => selectChatModel(model.id, model.name)}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/10 transition-colors ${selectedModel === model.id ? 'text-blue-400' : 'text-gray-200'}`}
                                            >
                                                <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                                                <span className="flex-1 truncate text-xs">{model.name || model.id}</span>
                                                {selectedModel === model.id && <Check className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                                            </button>
                                        ))
                                    )}
                                    <div className="px-3 py-2 border-t border-[#333]/50">
                                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Use Any Model ID</p>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                value={customModelInput}
                                                onChange={(e) => setCustomModelInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        selectChatModel(customModelInput);
                                                    }
                                                }}
                                                placeholder="e.g. kimi-k2-instruct-0905"
                                                className="flex-1 bg-[#111] border border-[#333] rounded-md px-2 py-1.5 text-[11px] text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#555]"
                                            />
                                            <button
                                                onClick={() => selectChatModel(customModelInput)}
                                                className="px-2.5 py-1.5 rounded-md bg-blue-600 text-[11px] text-white hover:bg-blue-500 transition-colors"
                                            >
                                                Use
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Sources */}
                <div className="relative" ref={sourcesRef}>
                    <button
                        onClick={() => {
                            setShowSourcesDropdown(!showSourcesDropdown);
                            setShowModelDropdown(false);
                            setShowTimeDropdown(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-[#333]/50 text-sm text-gray-200 hover:text-white hover:border-[#444] transition-colors"
                    >
                        <Grid3X3 className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{getSourcesSummary()}</span>
                        <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${showSourcesDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showSourcesDropdown && (
                        <div className="absolute bottom-full mb-2 left-0 w-56 bg-white/5 border border-[#333] rounded-xl shadow-2xl shadow-black/40 z-50 py-1">
                            <div className="px-3 py-2 border-b border-[#333]/50">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Data Sources</p>
                            </div>
                            {SOURCE_OPTIONS.map((source) => (
                                <button
                                    key={source.id}
                                    onClick={() => toggleSource(source.id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors"
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selectedSources.includes(source.id) ? 'bg-blue-500 border-blue-500' : 'border-[#444] bg-transparent'
                                        }`}>
                                        {selectedSources.includes(source.id) && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className={`text-xs ${selectedSources.includes(source.id) ? 'text-white' : 'text-gray-300'}`}>
                                        {source.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Time Range */}
                <div className="relative" ref={timeRef}>
                    <button
                        onClick={() => {
                            setShowTimeDropdown(!showTimeDropdown);
                            setShowModelDropdown(false);
                            setShowSourcesDropdown(false);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 border border-[#333]/50 text-sm text-gray-200 hover:text-white hover:border-[#444] transition-colors"
                    >
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{getTimeRangeLabel()}</span>
                        <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${showTimeDropdown ? 'rotate-180' : ''}`} />
                    </button>
                    {showTimeDropdown && (
                        <div className="absolute bottom-full mb-2 left-0 w-48 bg-white/5 border border-[#333] rounded-xl shadow-2xl shadow-black/40 z-50 py-1">
                            <div className="px-3 py-2 border-b border-[#333]/50">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Time Range</p>
                            </div>
                            {TIME_RANGE_OPTIONS.map((range) => (
                                <button
                                    key={range.id}
                                    onClick={() => { setSelectedTimeRange(range.id); setShowTimeDropdown(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 transition-colors ${selectedTimeRange === range.id ? 'text-blue-400' : 'text-gray-200'
                                        }`}
                                >
                                    <span className="flex-1 text-xs">{range.label}</span>
                                    {selectedTimeRange === range.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Send */}
            <button
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 border border-[#333]/50 text-gray-200 hover:text-white hover:border-[#444] disabled:opacity-30 disabled:hover:text-gray-200 transition-colors"
                id="chat-send"
            >
                {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span className="text-xs font-medium">Send</span>
            </button>
        </div>
    );

    return (
        <div className="flex h-full bg-[#0a0a0a]">
            {/* Chat History Panel */}
            {showHistory && (
                <div className="w-64 flex-shrink-0 bg-[#0d0f12]/90 border-r border-[#1f2329] flex flex-col">
                    {/* History Header */}
                    <div className="flex items-center justify-between px-3 py-3 border-b border-[#1f2329]">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleNewSession}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                title="New chat"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setShowHistory(false)}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                                title="Close history"
                            >
                                <PanelLeft className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Session List */}
                    <div className="flex-1 overflow-y-auto py-1">
                        {sessions.length === 0 ? (
                            <div className="px-3 py-8 text-center">
                                <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                <p className="text-xs text-gray-500">No conversations yet</p>
                                <button
                                    onClick={handleNewSession}
                                    className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                >
                                    Start your first chat
                                </button>
                            </div>
                        ) : (
                            sessions.map((session) => (
                                <button
                                    key={session.id}
                                    onClick={() => setActiveSessionId(session.id)}
                                    className={`group w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors ${activeSessionId === session.id
                                            ? 'bg-white/10 text-white'
                                            : 'text-gray-300 hover:bg-white/5 hover:text-gray-200'
                                        }`}
                                >
                                    <span className="w-3.5 h-3.5 mt-0.5 rounded-[3px] border border-[#39414b] bg-transparent flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">
                                            {session.title || 'New Chat'}
                                        </p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">
                                            {formatSessionDate(session.updated_at)}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => handleDeleteSession(session.id, e)}
                                        className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-white/10 transition-all"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top: History toggle if hidden */}
                {!showHistory && (
                    <div className="px-4 py-2 flex-shrink-0">
                        <button
                            onClick={() => setShowHistory(true)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                            title="Show chat history"
                        >
                            <PanelLeft className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                )}

                {hasMessages ? (
                    <>
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-6 py-4">
                            <div className="max-w-3xl mx-auto">
                                {messages.map((msg) => (
                                    <ChatMessage key={msg.id} message={msg} />
                                ))}
                                {streamingContent ? renderStreamingMessage() : isSending && (
                                    <div className="flex items-center gap-2 text-gray-400 mb-4">
                                        <div className="bg-white/5 rounded-2xl rounded-bl-md px-4 py-3 border border-[#333]">
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span className="text-sm">
                                                    {displayedStatus || agentStatus || 'Thinking...'}
                                                    <span className="inline-flex ml-1">
                                                        <span className="animate-pulse">.</span>
                                                        <span className="animate-pulse [animation-delay:120ms]">.</span>
                                                        <span className="animate-pulse [animation-delay:240ms]">.</span>
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {isSending && agentStatus && streamingContent && (
                                    <div className="flex items-center gap-2 text-gray-500 mb-4">
                                        <div className="bg-[#161616]/70 rounded-xl px-3 py-2 border border-[#262626]">
                                            <span className="text-xs">
                                                {displayedStatus || agentStatus}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>

                        {/* Input (with messages) */}
                        <div className="border-t border-[#262626]/50 bg-[#0a0a0a] px-6 py-4">
                            <div className="max-w-3xl mx-auto space-y-3">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onFocus={() => {
                                        setShowModelDropdown(false);
                                        setShowSourcesDropdown(false);
                                        setShowTimeDropdown(false);
                                    }}
                                    placeholder="Ask about your activity..."
                                    rows={1}
                                    className="w-full resize-none bg-[#161616] border border-[#333]/70 text-white rounded-xl px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 focus:border-cyan-500/40"
                                    style={{ minHeight: '44px', maxHeight: '120px' }}
                                    onInput={(e) => {
                                        const t = e.target as HTMLTextAreaElement;
                                        t.style.height = 'auto';
                                        t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                                    }}
                                />
                                {controlBar}
                            </div>
                        </div>
                    </>
                ) : (
                    /* Empty state */
                    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 overflow-y-auto">
                        <div className="w-full max-w-2xl space-y-5">
                            <div className="flex justify-center mb-2">
                                <div className="w-14 h-14 rounded-full border border-[#2a2f35] bg-[#0f1318] flex items-center justify-center">
                                    <Music2 className="w-5 h-5 text-gray-400" />
                                </div>
                            </div>

                            {/* Greeting */}
                            <div className="text-center mb-2">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-[#333] mb-3">
                                    <BriefcaseBusiness className="w-6 h-6 text-cyan-400" />
                                </div>
                                <h2 className="text-3xl font-semibold text-white">What would you like to know?</h2>
                                <p className="text-sm text-gray-400 mt-2">Ask about your activity, get summaries, or start a conversation</p>
                            </div>

                            {/* Suggestion Cards */}
                            <div className="grid grid-cols-2 gap-2.5">
                                {SUGGESTION_CARDS.map((card) => (
                                    <button
                                        key={card.label}
                                        onClick={() => {
                                            setInput(card.prompt);
                                            setTimeout(() => handleSendWithMessage(card.prompt), 50);
                                        }}
                                        className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all hover:scale-[1.01] hover:brightness-110 ${card.bg}`}
                                    >
                                        <card.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${card.color}`} />
                                        <div>
                                            <p className="text-xs font-semibold text-white">{card.label}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{card.prompt}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {/* Input */}
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onFocus={() => {
                                    setShowModelDropdown(false);
                                    setShowSourcesDropdown(false);
                                    setShowTimeDropdown(false);
                                }}
                                placeholder="Ask about moments or topics from your memories..."
                                rows={1}
                                className="w-full resize-none bg-[#161616] border border-[#333]/70 text-white rounded-2xl px-5 py-4 text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 focus:border-cyan-500/40"
                                style={{ minHeight: '52px', maxHeight: '120px' }}
                                onInput={(e) => {
                                    const t = e.target as HTMLTextAreaElement;
                                    t.style.height = 'auto';
                                    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                                }}
                            />
                            {controlBar}
                        </div>
                    </div>
                )}
            </div>

            {pendingAction && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4">
                    <div className="w-full max-w-md rounded-2xl border border-[#333] bg-[#161616] p-5 shadow-2xl">
                        <h3 className="text-sm font-semibold text-white">Allow Scope Update?</h3>
                        <p className="mt-2 text-xs text-gray-300 leading-relaxed">{pendingAction.reason}</p>
                        {pendingAction.suggested_time_range && (
                            <p className="mt-2 text-xs text-gray-200">
                                Time range change:
                                <span className="text-blue-400"> {getTimeRangeLabelById(selectedTimeRange)}</span>
                                {' -> '}
                                <span className="text-blue-400">{getTimeRangeLabelById(pendingAction.suggested_time_range)}</span>
                            </p>
                        )}
                        {(pendingAction.enable_sources || []).length > 0 && (
                            <p className="mt-2 text-xs text-gray-200">
                                Enable sources:
                                <span className="text-blue-400">
                                    {' '}
                                    {(pendingAction.enable_sources || []).map(getSourceLabelById).join(', ')}
                                </span>
                            </p>
                        )}
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                onClick={() => setPendingAction(null)}
                                className="px-3 py-1.5 rounded-lg border border-[#333] text-xs text-gray-300 hover:text-white hover:border-[#444] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmAction}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 transition-colors"
                            >
                                Yes, Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


