import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';

import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  MoreHorizontal,
  Sparkles,
  File,
  Send,
  FolderOpen,
  RefreshCw,
  FilePlus,
  Save,
  Edit3,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Bold,
  Italic,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Quote,
  Square,
  Trash2
} from 'lucide-react';
import { BrainActionType, BrainChatMessage, buildModelConversation, inferActionContentFromResponse, isUiTranscriptNoise, parseActionPayload, runLocalAgenticTools, sanitizeProposedMarkdown, serializeToolRuns } from '../services/brainAiService';
import { MermaidBlock } from '../components/MermaidBlock';

// Default vault path - your Notes folder
const DEFAULT_VAULT = 'c:\\myself\\nonclgstuffs\\webdev\\all-in-one\\Notes';
const BRAIN_LAST_MODEL_STORAGE_KEY = 'brain_last_selected_model';
const DEFAULT_NIM_MODEL = 'meta/llama-3.3-70b-instruct';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

// Unified Styles Configuration
// Unified Styles Configuration
const MARKDOWN_STYLES = {
  h1: "text-3xl font-bold text-white mt-6 mb-3",
  h2: "text-2xl font-bold text-white mt-6 mb-3",
  h3: "text-xl font-semibold text-white mt-4 mb-2",
  h4: "text-lg font-semibold text-white mt-4 mb-2",
  h5: "text-base font-semibold text-white mt-3 mb-1",
  h6: "text-sm font-semibold text-gray-300 mt-3 mb-1",
  p: "text-gray-300 my-2 leading-relaxed",
  ul: "list-disc list-inside text-gray-300 my-2 space-y-1 ml-1",
  ol: "list-decimal list-inside text-gray-300 my-2 space-y-1 ml-1",
  li: "text-gray-300 pl-1",
  codeInline: "bg-[#262626] px-1.5 py-0.5 rounded text-purple-300 text-sm font-mono",
  codeBlock: "bg-[#1a1a1a] p-4 rounded-lg overflow-x-auto text-sm my-3 border border-[#333] text-gray-300 font-mono",
  a: "text-blue-400 hover:underline cursor-pointer",
  blockquote: "border-l-4 border-purple-500 pl-4 text-gray-400 my-3 italic",
  hr: "border-[#333] my-4",
  img: "max-w-full rounded-lg my-3",
  table: "w-full border-collapse text-sm my-3",
  th: "text-left px-3 py-2 text-gray-200 font-semibold border-b border-[#333]",
  td: "px-3 py-2 text-gray-300 border-b border-[#262626]",
  tr: "hover:bg-[#1a1a1a]"
};

const looksLikeMermaid = (input: string): boolean => {
  const t = input.trimStart();
  return /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|architecture|block-beta)\b/m.test(t);
};

// Tiptap Editor Component
const TiptapEditor: React.FC<{
  content: string;
  onChange: (content: string) => void;
  onEditorCreate?: (editor: any) => void;
  onSelectionChange?: (text: string) => void;
  onSelectionRangeChange?: (range: { from: number; to: number } | null) => void;
}> = ({ content, onChange, onEditorCreate, onSelectionChange, onSelectionRangeChange }) => {
  const [isFocused, setIsFocused] = useState(false);

  const editor = useEditor({
    onCreate: ({ editor }) => {
      onEditorCreate?.(editor);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      if (!empty) {
        const text = editor.state.doc.textBetween(from, to, '\n');
        onSelectionChange?.(text);
        onSelectionRangeChange?.({ from, to });
      } else {
        onSelectionRangeChange?.({ from, to: from }); // Cursor position
      }
    },
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
          HTMLAttributes: {
            class: (node) => MARKDOWN_STYLES[`h${node.level}` as keyof typeof MARKDOWN_STYLES] || '',
          }
        },
        paragraph: {
          HTMLAttributes: { class: MARKDOWN_STYLES.p },
        },
        bulletList: {
          HTMLAttributes: { class: MARKDOWN_STYLES.ul },
        },
        orderedList: {
          HTMLAttributes: { class: MARKDOWN_STYLES.ol },
        },
        listItem: {
          HTMLAttributes: { class: MARKDOWN_STYLES.li },
        },
        codeBlock: {
          HTMLAttributes: { class: MARKDOWN_STYLES.codeBlock },
        },
        blockquote: {
          HTMLAttributes: { class: MARKDOWN_STYLES.blockquote },
        },
        horizontalRule: {
          HTMLAttributes: { class: MARKDOWN_STYLES.hr },
        },
        bold: {
          HTMLAttributes: { class: "font-bold text-white" },
        },
        italic: {
          HTMLAttributes: { class: "italic text-gray-400" },
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: MARKDOWN_STYLES.a },
      }),
      Image.configure({
        HTMLAttributes: { class: MARKDOWN_STYLES.img },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'task-list pl-0 list-none',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'task-item flex items-start gap-2',
        },
      }),
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: content,
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[calc(100vh-200px)] py-4 px-8',
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = (editor.storage as any)?.markdown?.getMarkdown();
      if (markdown !== undefined) {
        onChange(markdown);
      }
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  // Update content if it changes externally
  useEffect(() => {
    if (!editor) return;

    const currentMarkdown = (editor.storage as any)?.markdown?.getMarkdown();
    if (currentMarkdown !== undefined) {
      const normalize = (str: string) => str.replace(/\r\n/g, '\n').trim();
      if (normalize(content) !== normalize(currentMarkdown)) {
        // We update even if focused to ensure AI edits show up
        // setContent(content, false) helps prevent some jumpiness
        (editor.commands as any).setContent(content, false);
      }
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full w-full">

      {/* Main Toolbar - Always Visible */}
      <div className={`flex items-center gap-1 px-4 py-2 border-b border-[#262626] bg-[#0a0a0a]/80 backdrop-blur sticky top-0 z-10 transition-opacity ${isFocused ? 'opacity-100' : 'opacity-50 hover:opacity-100'}`}>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-1.5 rounded hover:bg-[#262626] ${editor.isActive('heading', { level: 1 }) ? 'text-purple-400' : 'text-gray-500'}`} title="Heading 1">
          <Heading1 size={16} />
        </button>
        <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-1.5 rounded hover:bg-[#262626] ${editor.isActive('heading', { level: 2 }) ? 'text-purple-400' : 'text-gray-500'}`} title="Heading 2">
          <Heading2 size={16} />
        </button>
        <div className="w-px h-4 bg-[#262626] mx-1" />
        <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1.5 rounded hover:bg-[#262626] ${editor.isActive('bold') ? 'text-purple-400' : 'text-gray-500'}`} title="Bold">
          <Bold size={16} />
        </button>
        <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1.5 rounded hover:bg-[#262626] ${editor.isActive('italic') ? 'text-purple-400' : 'text-gray-500'}`} title="Italic">
          <Italic size={16} />
        </button>
        <div className="w-px h-4 bg-[#262626] mx-1" />
        <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded hover:bg-[#262626] ${editor.isActive('bulletList') ? 'text-purple-400' : 'text-gray-500'}`} title="Bullet List">
          <List size={16} />
        </button>
        <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-1.5 rounded hover:bg-[#262626] ${editor.isActive('orderedList') ? 'text-purple-400' : 'text-gray-500'}`} title="Numbered List">
          <ListOrdered size={16} />
        </button>
        <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`p-1.5 rounded hover:bg-[#262626] ${editor.isActive('taskList') ? 'text-purple-400' : 'text-gray-500'}`} title="Task List">
          <CheckSquare size={16} />
        </button>
        <div className="w-px h-4 bg-[#262626] mx-1" />
        <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`p-1.5 rounded hover:bg-[#262626] ${editor.isActive('blockquote') ? 'text-purple-400' : 'text-gray-500'}`} title="Blockquote">
          <Quote size={16} />
        </button>
      </div>

      <EditorContent editor={editor} className="flex-1 w-full" />
    </div>
  );
};

export const BrainView: React.FC = () => {
  const [vaultPath, setVaultPath] = useState<string>(() => {
    return localStorage.getItem('brain_vaultPath') || DEFAULT_VAULT;
  });
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(() => {
    return localStorage.getItem('brain_selectedFile');
  });
  const [fileContent, setFileContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [aiMessages, setAiMessages] = useState<BrainChatMessage[]>([
    { sender: 'ai', text: 'Welcome to Brain! Select a note from your vault or create a new one. I can help analyze and discuss your notes once you load them.' }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem(BRAIN_LAST_MODEL_STORAGE_KEY) || DEFAULT_NIM_MODEL);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [availableModels, setAvailableModels] = useState<{ id: string, name?: string }[]>([]);
  const [nvidiaApiKey, setNvidiaApiKey] = useState('');
  const [modelsLoading, setModelsLoading] = useState(true);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState<'lecture' | 'edit'>('lecture');
  const [proposedAction, setProposedAction] = useState<{
    type: 'insert' | 'create' | 'replace_selection' | 'insert_at_cursor' | 'find_and_replace' | 'replace_all';
    content?: string;
    target_text?: string;
    originalSelection?: string;
    title?: string;
    message?: string;
    sourceFile?: string | null;
    range?: { startLine: number, endLine: number } | { from: number, to: number };
  } | null>(null);

  // Undo state
  const [previousContent, setPreviousContent] = useState<string | null>(null);

  const [selectedContext, setSelectedContext] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ startLine: number, endLine: number } | null>(null);
  const [tiptapRange, setTiptapRange] = useState<{ from: number, to: number } | null>(null);
  const editorRef = useRef<any>(null); // Ref to hold Tiptap editor instance
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load chat history when file changes
  useEffect(() => {
    const chatKey = `brain_chat_${selectedFile || 'global'}`;
    const savedChat = localStorage.getItem(chatKey);
    if (savedChat) {
      try {
        setAiMessages(JSON.parse(savedChat));
      } catch (e) {
        setAiMessages([{ sender: 'ai', text: 'Welcome to Brain! Select a note from your vault or create a new one.' }]);
      }
    } else {
      setAiMessages([{ sender: 'ai', text: 'Welcome to Brain! Select a note from your vault or create a new one.' }]);
    }
  }, [selectedFile]);

  // Save chat history whenever it updates
  useEffect(() => {
    const chatKey = `brain_chat_${selectedFile || 'global'}`;
    localStorage.setItem(chatKey, JSON.stringify(aiMessages));
  }, [aiMessages, selectedFile]);

  // Prevent applying stale proposals after switching to another note
  useEffect(() => {
    if (!proposedAction) return;
    if (!proposedAction.sourceFile) return;
    if (selectedFile !== proposedAction.sourceFile) {
      setProposedAction(null);
      setAiMessages(prev => [...prev, {
        sender: 'ai',
        text: '⚠️ Discarded pending proposal because the active note changed. Generate a new proposal for this note.'
      }]);
    }
  }, [selectedFile, proposedAction]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiSend();
    }
  };

  // Ref for the markdown view container
  const markdownContainerRef = useRef<HTMLDivElement>(null);

  // Handle Selection in View Mode using mouseup for reliability
  const handleMouseUp = () => {
    if (isEditing) return;

    // Small delay to ensure selection is finalized
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (text.length > 0) {
        setSelectedContext(text);

        // Calculate Line Numbers using smarter line-based search
        // This handles markdown formatting (##, **, -, etc.) that isn't in rendered text
        const lines = fileContent.split('\n');
        const selectedLines = text.split('\n');
        const firstSelectedLine = selectedLines[0].trim();

        let startLine = -1;
        let endLine = -1;

        // Find the first line that contains the start of the selection
        for (let i = 0; i < lines.length; i++) {
          // Check if this line contains the first line of selection (ignoring markdown chars)
          const lineWithoutMarkdown = lines[i].replace(/^[#*\->\s]+/, '').trim();
          if (lineWithoutMarkdown.includes(firstSelectedLine) || lines[i].includes(firstSelectedLine)) {
            startLine = i + 1; // 1-indexed
            break;
          }
        }

        if (startLine !== -1) {
          // Estimate end line based on selection length
          endLine = startLine + selectedLines.length - 1;
          setSelectionRange({ startLine, endLine });
          console.log(`[Nexus View] Selected Lines: ${startLine}-${endLine}`);
        } else {
          console.warn('[Nexus View] Could not find selected text in raw content');
          setSelectionRange(null);
        }
      }
    }, 10);
  };


  // Sidebar Resizing
  const [aiPanelWidth, setAiPanelWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = document.body.clientWidth - e.clientX;
      if (newWidth > 280 && newWidth < 800) { // Min 280px, Max 800px
        setAiPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch available models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const settings = await window.nexusAPI?.settings?.get?.();
        const key = settings?.nvidiaApiKey || '';
        setNvidiaApiKey(key);
        const lastModel = localStorage.getItem(BRAIN_LAST_MODEL_STORAGE_KEY) || settings?.defaultModel || DEFAULT_NIM_MODEL;

        if (!key) {
          setAvailableModels([{ id: DEFAULT_NIM_MODEL, name: DEFAULT_NIM_MODEL }]);
          setSelectedModel(lastModel);
          return;
        }

        const modelsRaw = window.nexusAPI?.settings?.getNvidiaModels
          ? await window.nexusAPI.settings.getNvidiaModels(key)
          : await (async () => {
            const response = await fetch('https://integrate.api.nvidia.com/v1/models', {
              headers: { Authorization: `Bearer ${key}` }
            });
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`API error (${response.status}): ${errorText.slice(0, 100)}`);
            }
            return response.json();
          })();

        const normalized = (Array.isArray(modelsRaw) ? modelsRaw : (modelsRaw?.data || []))
          .map((m: any) => ({ id: m?.id || String(m), name: m?.name || m?.id || String(m) }))
          .filter((m: { id: string }) => !!m.id);

        if (normalized.length > 0) {
          setAvailableModels(normalized);
          const hasLastModel = normalized.some((m: { id: string }) => m.id === lastModel);
          if (hasLastModel) {
            setSelectedModel(lastModel);
          } else {
            setSelectedModel(normalized[0].id);
          }
        } else {
          setAvailableModels([{ id: DEFAULT_NIM_MODEL, name: DEFAULT_NIM_MODEL }]);
          setSelectedModel(lastModel);
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
        setAvailableModels([{ id: DEFAULT_NIM_MODEL, name: DEFAULT_NIM_MODEL }]);
        setSelectedModel(localStorage.getItem(BRAIN_LAST_MODEL_STORAGE_KEY) || DEFAULT_NIM_MODEL);
      } finally {
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, []);

  useEffect(() => {
    if (!selectedModel?.trim()) return;
    localStorage.setItem(BRAIN_LAST_MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  // Load file tree on mount
  useEffect(() => {
    loadFileTree();
    if (selectedFile) {
      openFile(selectedFile);
    }
  }, [vaultPath]);

  const loadFileTree = async () => {
    if (!window.nexusAPI?.notes) return;
    const tree = await window.nexusAPI.notes.getFileTree(vaultPath);
    setFileTree(tree);
  };

  const selectVault = async () => {
    if (!window.nexusAPI?.notes) {
      alert('Notes API not available. Make sure you are running in the Tauri desktop app.');
      return;
    }
    const path = await window.nexusAPI.notes.selectVault();
    if (path) {
      setVaultPath(path);
      localStorage.setItem('brain_vaultPath', path);
    }
  };

  const openFile = async (filePath: string) => {
    if (!window.nexusAPI?.notes) return;
    const content = await window.nexusAPI.notes.readFile(filePath);
    if (content !== null) {
      setSelectedFile(filePath);
      localStorage.setItem('brain_selectedFile', filePath);
      setFileContent(content);
      setEditContent(content);
      setIsEditing(false);

      // Build breadcrumbs
      const relativePath = filePath.replace(vaultPath, '').replace(/^[/\\]/, '');
      const parts = relativePath.split(/[/\\]/);
      setBreadcrumbs(parts);
    }
  };

  const saveFile = async () => {
    if (!selectedFile || !window.nexusAPI?.notes) return;
    const success = await window.nexusAPI.notes.writeFile(selectedFile, editContent);
    if (success) {
      setFileContent(editContent);
      setIsEditing(false);
    }
  };

  // Handle checkbox toggle in read mode
  const handleCheckboxToggle = useCallback(async (lineIndex: number, checked: boolean) => {
    if (!selectedFile || !window.nexusAPI?.notes) return;

    // Optimistic Update: Update UI immediately
    const lines = fileContent.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const line = lines[lineIndex];
    let newLine: string;

    // Toggle carefully using regex to preserve other text
    if (checked) {
      // Replace first occurrence of [ ] with [x]
      newLine = line.replace(/\[([ ])\]/, '[x]');
    } else {
      // Replace first occurrence of [x] or [X] with [ ]
      newLine = line.replace(/\[([xX])\]/, '[ ]');
    }

    lines[lineIndex] = newLine;
    const newContent = lines.join('\n');

    // Update State Instantly
    setFileContent(newContent);
    setEditContent(newContent);

    // Save to disk in background
    await window.nexusAPI.notes.writeFile(selectedFile, newContent);
  }, [selectedFile, fileContent]);

  const createNewFile = async () => {
    if (!newFileName.trim() || !window.nexusAPI?.notes) return;
    const result = await window.nexusAPI.notes.createFile(vaultPath, newFileName);
    if (result.success && result.path) {
      setShowNewFileInput(false);
      setNewFileName('');
      await loadFileTree();
      openFile(result.path);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const createNewFolder = async () => {
    if (!newFolderName.trim() || !window.nexusAPI?.notes) return;
    const result = await window.nexusAPI.notes.createFolder(vaultPath, newFolderName);
    if (result.success) {
      setShowNewFolderInput(false);
      setNewFolderName('');
      await loadFileTree();
    }
  };

  const handleFileDrop = async (sourcePath: string, targetPath: string) => {
    if (!window.nexusAPI?.notes) return;

    // Check if target is a folder (it should be, based on logic in item component, but double check)
    // Actually, we pass targetPath as the folder path directly from the item component
    console.log(`Moving ${sourcePath} to ${targetPath}`);

    const result = await window.nexusAPI.notes.moveFile(sourcePath, targetPath);
    if (result.success) {
      await loadFileTree(); // Refresh tree
    } else {
      console.error('Move failed:', result.error);
      // Optional: Show toast error
    }
  };

  const handleRename = async (oldPath: string, newName: string) => {
    if (!window.nexusAPI?.notes) return;
    const result = await window.nexusAPI.notes.rename(oldPath, newName);
    if (result.success) {
      await loadFileTree();
      // If the renamed file was selected, update selection
      if (selectedFile === oldPath && result.newPath) {
        openFile(result.newPath);
      }
    } else {
      console.error('Rename failed:', result.error);
    }
  };

  const handleStopAi = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsAiLoading(false);
      setAiMessages(prev => [...prev, { sender: 'ai', text: '🛑 Response interrupted by user.' }]);
    }
  };

  const clearChat = () => {
    setAiMessages([{ sender: 'ai', text: 'Chat cleared. How can I help you with this note?' }]);
    // Clear persistence immediately
    const chatKey = `brain_chat_${selectedFile || 'global'}`;
    localStorage.removeItem(chatKey);
  };

    const handleAiSend = async () => {
    if (!aiInput.trim() || isAiLoading) return;

    if (!nvidiaApiKey) {
      setAiMessages(prev => [...prev, {
        sender: 'ai',
        text: 'NVIDIA API key is missing. Add it in Settings -> API Keys to use Brain AI.'
      }]);
      return;
    }

    abortControllerRef.current = new AbortController();

    const userMessage = aiInput.trim();
    const usedContext = selectedContext;
    const usedRange = selectionRange;
    const usedTiptapRange = tiptapRange;
    const wasEditing = isEditing;

    setAiMessages(prev => [...prev, { sender: 'user', text: userMessage, context: usedContext || undefined }]);
    setAiInput('');
    setSelectedContext('');
    setTiptapRange(null);
    setSelectionRange(null);
    setIsAiLoading(true);
    setProposedAction(null);

    try {
      const currentEditorContent = wasEditing ? editContent : fileContent;
      const isSelectionActive = Boolean(usedContext && usedContext.trim());

      const toolRuns = runLocalAgenticTools({
        content: currentEditorContent,
        userMessage,
        selectedText: usedContext || undefined,
        selectedRange: usedRange
      });

      const toolContext = serializeToolRuns(toolRuns);
      const MAX_RAW_CONTEXT = 12000;
      const rawPreview = currentEditorContent.length > MAX_RAW_CONTEXT
        ? currentEditorContent.slice(0, MAX_RAW_CONTEXT) + '\n...(truncated)...'
        : currentEditorContent;

      const noteContext = selectedFile
        ? `Current note: ${selectedFile.split(/[/\\]/).pop()}\n\nSelection active: ${isSelectionActive ? 'yes' : 'no'}${usedRange ? ` (lines ${usedRange.startLine}-${usedRange.endLine})` : ''}\n\nTOOL RESULTS:\n${toolContext}\n\nRAW NOTE PREVIEW:\n${rawPreview}`
        : 'No note currently open.';

      const systemPrompt = aiMode === 'edit'
        ? `You are Nexus AI, an editor assistant with an orchestration layer.\n\nMODE:\nEDIT MODE: return precise edit actions.\n\nYou are given local tool results (line extraction, keyword search, RAG chunks). Use those results first; do not hallucinate unseen content.\n\nOutput rules:\n- Always include ONE JSON object at the end of the response.\n- Wrap the JSON in <nexus_action_json>...</nexus_action_json> tags.\n- JSON action must be one of: insert_content, create_note, replace_selection, insert_at_cursor, find_and_replace, replace_all.\n- For find_and_replace, include exact target_text from tool/line context.\n- For any edit action, content must be non-empty and must be the exact insertion text.\n- For replace_all, content must be the complete final note.\n- Also include the same insertion body in <nexus_content>...</nexus_content> tags.\n- Do not duplicate sections or repeat algorithm steps; output one clean final version.\n- Keep explanation short and concrete.\n\nJSON schema:\n<nexus_action_json>\n{\n  "action": "find_and_replace",\n  "target_text": "exact text",\n  "content": "replacement",\n  "explanation": "why"\n}\n</nexus_action_json>\n\nOptional content mirror:\n<nexus_content>\nreplacement\n</nexus_content>\n\nSelection constraints:\n${isSelectionActive
            ? (wasEditing
                ? 'User selected text in editor. Prefer replace_selection.'
                : 'User selected text in rendered view. Prefer find_and_replace with exact raw markdown target_text.')
            : 'No explicit selection. Use insert_at_cursor for additions; use replace_all only for full rewrites.'}`
        : `You are Nexus AI, a teaching assistant with an orchestration layer.\n\nMODE:\nLECTURE MODE: teach only.\n\nYou are given local tool results (line extraction, keyword search, RAG chunks). Use those results first; do not hallucinate unseen content.\n\nOutput rules:\n- Explain and teach in plain markdown.\n- Do NOT output any JSON object.\n- Do NOT output <nexus_action_json> or <nexus_content> tags.\n- Do NOT propose file edits, replacements, or apply/discard style actions.\n- Keep the response instructional, concrete, and structured.`;

      const fallbackModel = availableModels[0]?.id || DEFAULT_NIM_MODEL;
      const effectiveModel = availableModels.some(m => m.id === selectedModel)
        ? selectedModel
        : fallbackModel;

      const callModel = async (modelId: string) => {
        const convoContext = buildModelConversation(aiMessages, aiMode);
        const messages = [
          { role: 'system', content: systemPrompt },
          ...convoContext,
          { role: 'user', content: `${userMessage}\n\nCONTEXT:\n${noteContext}` }
        ];

        if (window.nexusAPI?.settings?.nvidiaChatCompletion) {
          return await window.nexusAPI.settings.nvidiaChatCompletion(
            modelId,
            messages,
            65536,
            aiMode === 'edit' ? 0.15 : 0.45,
          );
        }

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${nvidiaApiKey}`
          },
          body: JSON.stringify({
            model: modelId,
            messages,
            stream: false,
            max_tokens: 65536
          }),
          signal: abortControllerRef.current?.signal
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown API error');
          throw new Error(`API error (${response.status}) on ${modelId}: ${errorText.slice(0, 220)}`);
        }

        return response.json();
      };

      let data: any;
      try {
        data = await callModel(effectiveModel);
      } catch (firstError: any) {
        const msg = String(firstError?.message || '').toLowerCase();
        const shouldRetryWithFallback = effectiveModel !== fallbackModel && (
          msg.includes('unknown model') ||
          msg.includes('model not found') ||
          msg.includes('does not exist') ||
          msg.includes('unknown provider') ||
          msg.includes('400')
        );

        if (shouldRetryWithFallback) {
          setSelectedModel(fallbackModel);
          data = await callModel(fallbackModel);
        } else {
          throw firstError;
        }
      }

      const aiResponse = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';
      setAiMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);

      if (aiMode !== 'edit') {
        setProposedAction(null);
        return;
      }

      const actionData = parseActionPayload(aiResponse);
      const validActions: BrainActionType[] = ['insert_content', 'create_note', 'replace_selection', 'insert_at_cursor', 'find_and_replace', 'replace_all'];

      if (actionData?.action && validActions.includes(actionData.action)) {
        setAiMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.sender === 'ai') last.isAction = true;
          return next;
        });

        const sanitizedActionContent = sanitizeProposedMarkdown(actionData.content, { aggressive: actionData.action !== 'replace_all' });
        const resolvedContent = sanitizedActionContent || inferActionContentFromResponse(actionData.action, aiResponse);
        const contentRequiredActions: BrainActionType[] = ['replace_all', 'replace_selection', 'find_and_replace', 'insert_content', 'insert_at_cursor'];

        if (contentRequiredActions.includes(actionData.action) && (!resolvedContent || !resolvedContent.trim())) {
          setAiMessages(prev => [...prev, {
            sender: 'ai',
            text: 'Could not extract insertion content from the response. Retrying with strict JSON/tagged output should fix this.'
          }]);
          return;
        }

        const replaceAllTarget = (actionData.target_text || currentEditorContent || fileContent || editContent || '').toString();
        setProposedAction({
          type: actionData.action === 'insert_content' ? 'insert' : actionData.action,
          content: resolvedContent,
          target_text: actionData.action === 'replace_all' ? replaceAllTarget : (actionData.target_text || usedContext),
          originalSelection: usedContext || undefined,
          title: actionData.title,
          message: actionData.explanation,
          sourceFile: selectedFile,
          range: usedRange || usedTiptapRange
        });
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Fetch aborted');
        return;
      }
      console.error('AI API error:', error);
      setAiMessages(prev => [...prev, {
        sender: 'ai',
        text: `AI request failed. ${error?.message || 'Unknown connection error.'}`
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };
  const handleApplyAction = async () => {
    if (!proposedAction || !window.nexusAPI?.notes) return;
    if (proposedAction.sourceFile && selectedFile !== proposedAction.sourceFile) {
      setAiMessages(prev => [...prev, {
        sender: 'ai',
        text: '⚠️ This proposal was created for a different note and was not applied.'
      }]);
      setProposedAction(null);
      return;
    }

    try {
      if (proposedAction.type === 'create') {
        // ... existing create logic ...
        if (proposedAction.title) {
          const result = await window.nexusAPI.notes.createFile(vaultPath, proposedAction.title);
          if (result.success && result.path) {
            await window.nexusAPI.notes.writeFile(result.path, proposedAction.content || '');
            await loadFileTree();
            openFile(result.path);
            setAiMessages(prev => [...prev, { sender: 'ai', text: `✅ Created new note: ${proposedAction.title}` }]);
          }
        }
      } else {
        // EDIT ACTIONS
        // We need to apply these changes to the File System AND the Editor state.

        let newContent = isEditing ? editContent : fileContent;
        const originalContent = newContent;

        let successMessage = 'Action applied.';

        console.log('[Nexus Apply] Action type:', proposedAction.type);
        console.log('[Nexus Apply] Target text:', proposedAction.target_text?.slice(0, 100));
        console.log('[Nexus Apply] Replacement content:', proposedAction.content?.slice(0, 100));
        console.log('[Nexus Apply] Range:', proposedAction.range);

        if (proposedAction.type === 'replace_all') {
          // Full file replacement
          const candidate = sanitizeProposedMarkdown(proposedAction.content || '', { aggressive: false }) || '';
          if (isUiTranscriptNoise(candidate)) {
            newContent = originalContent;
            successMessage = 'Blocked full rewrite: detected UI/chat transcript noise in proposed content.';
          } else {
            newContent = candidate;
            if (isEditing && editorRef.current) {
              (editorRef.current.commands as any).setContent(newContent, true);
            }
            successMessage = 'Entire note reformatted.';
          }
        }
        else if (proposedAction.type === 'replace_selection' && isEditing && editorRef.current && proposedAction.range && 'from' in proposedAction.range) {
          // Precise Tiptap replacement
          const range = proposedAction.range as { from: number, to: number };
          editorRef.current.commands.insertContentAt({ from: range.from, to: range.to }, proposedAction.content || '');
          newContent = editorRef.current.storage.markdown.getMarkdown();
          successMessage = '✅ Selection successfully replaced.';
        }
        else if (proposedAction.type === 'insert_at_cursor' && isEditing && editorRef.current && proposedAction.range && 'from' in proposedAction.range) {
          // Precise cursor insertion
          const range = proposedAction.range as { from: number, to: number }; // Insert at selection end or cursor
          editorRef.current.commands.insertContentAt({ from: range.to, to: range.to }, proposedAction.content || '');
          newContent = editorRef.current.storage.markdown.getMarkdown();
          successMessage = '✅ Content inserted at cursor.';
        }
        else if ((proposedAction.type === 'replace_selection' || proposedAction.type === 'find_and_replace') && proposedAction.target_text) {
          let targetFound = false;

          // Helper to normalize strings for comparison (removes extra whitespace/newlines)
          const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();
          const targetNorm = normalize(proposedAction.target_text);

          // 1. Try exact string replacement first
          // We use standard string replace which only replaces the FIRST occurrence
          if (newContent.includes(proposedAction.target_text)) {
            newContent = newContent.replace(proposedAction.target_text, proposedAction.content || '');
            targetFound = true;
          }
          // 2. Try normalized replacement (slower but handles whitespace drift)
          else {
            const contentNorm = normalize(newContent);
            if (contentNorm.includes(targetNorm)) {
              // We found a fuzzy match. We need to do a regex replace that ignores whitespace
              const regexStr = proposedAction.target_text
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\s+/g, '\\s+');

              // DANGER: We DO NOT use 'g' flag here, otherwise it replaces every occurrence in the file!
              const fuzzyRegex = new RegExp(regexStr);
              if (fuzzyRegex.test(newContent)) {
                newContent = newContent.replace(fuzzyRegex, proposedAction.content || '');
                targetFound = true;
              }
            }
          }

          // 3. Last resort: use the user's ORIGINAL selection text (rendered text without markdown)
          // to fuzzy-match against the raw markdown file content
          const origSel = proposedAction.originalSelection;
          if (!targetFound && origSel && origSel !== proposedAction.target_text) {
            const fallbackRegexStr = origSel
              .split(/\s+/)
              .filter(Boolean)
              .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('[\\s\\S]*?'); // Allow any markdown characters between words

            // No 'g' flag — only replace the first match
            const desperateRegex = new RegExp(fallbackRegexStr);
            if (desperateRegex.test(newContent)) {
              newContent = newContent.replace(desperateRegex, proposedAction.content || '');
              targetFound = true;
            }
          }

          if (targetFound) {
            successMessage = '✅ Text updated successfully.';
          } else {
            // Do not append on failed replace; it causes repeated duplication.
            const targetLen = (proposedAction.target_text || '').trim().length;
            const contentLen = newContent.trim().length;
            const looksLikeLargeBlockReplace = contentLen > 0 && targetLen / contentLen >= 0.5;

            if (looksLikeLargeBlockReplace && proposedAction.content) {
              const fallbackCandidate = sanitizeProposedMarkdown(proposedAction.content, { aggressive: false }) || '';
              if (isUiTranscriptNoise(fallbackCandidate)) {
                newContent = originalContent;
                successMessage = 'Blocked fallback rewrite: detected UI/chat transcript noise in proposed content.';
              } else {
                newContent = fallbackCandidate;
                successMessage = 'Entire note reformatted (fallback due to massive selection).';
              }
            } else {
              successMessage = '⚠️ Could not find target text to replace. No changes were applied.';
            }
          }

          if (isEditing && editorRef.current) {
            (editorRef.current.commands as any).setContent(newContent, true);
          }
        }
        else if (proposedAction.type === 'insert_at_cursor') {
          // Fallback if we don't have exact cursor
          if (isEditing && editorRef.current) {
            editorRef.current.commands.insertContent(proposedAction.content);
            newContent = editorRef.current.storage.markdown.getMarkdown();
          } else {
            newContent = newContent.trim() + '\n\n' + (proposedAction.content || '').trim();
          }
          successMessage = '✅ Content inserted.';
        }
        else if (proposedAction.type === 'insert') {
          // Fallback append
          newContent = newContent.trim() + '\n\n' + (proposedAction.content || '').trim();
          if (isEditing && editorRef.current) {
            (editorRef.current.commands as any).setContent(newContent, true);
          }
          successMessage = '✅ Content appended.';
        }
        else if ((proposedAction.type === 'find_and_replace' || proposedAction.type === 'replace_selection') && proposedAction.content && !proposedAction.target_text) {
          // Missing target text: safer to no-op than overwrite/append unexpectedly.
          successMessage = '⚠️ Missing target text for replacement. No changes were applied.';
        }
        else {
          successMessage = '⚠️ Could not apply action - missing information.';
        }

        // Save to Disk
        if (selectedFile) {
          const success = await window.nexusAPI.notes.writeFile(selectedFile, newContent);

          if (success) {
            setFileContent(newContent);
            setEditContent(newContent);
            setPreviousContent(newContent !== originalContent ? originalContent : null);
            setAiMessages(prev => [...prev, { sender: 'ai', text: successMessage }]);
          } else {
            setAiMessages(prev => [...prev, { sender: 'ai', text: '❌ Failed to save changes to file.' }]);
          }
        } else {
          console.error('[Nexus Apply] No selectedFile!');
        }
      }
    } catch (err) {
      console.error('Error applying AI action:', err);
    } finally {
      setProposedAction(null);
    }
  };

  // Handle Revert
  const handleRevertAction = async () => {
    if (!previousContent || !selectedFile || !window.nexusAPI?.notes) return;

    try {
      const success = await window.nexusAPI.notes.writeFile(selectedFile, previousContent);
      if (success) {
        setFileContent(previousContent);
        setEditContent(previousContent);
        if (isEditing && editorRef.current) {
          (editorRef.current.commands as any).setContent(previousContent, true);
        }
        setAiMessages(prev => [...prev, { sender: 'ai', text: '⏪ Action reverted.' }]);
        setPreviousContent(null);
      }
    } catch (err) {
      console.error('Failed to revert:', err);
    }
  };

  // Sidebar States
  const [isExplorerOpen, setIsExplorerOpen] = useState(true);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(true);

  return (
    <div className="flex h-full w-full bg-[#0a0a0a] text-white overflow-hidden rounded-xl border border-[#262626] animate-in fade-in duration-300 relative">

      {/* LEFT COLUMN: FILE EXPLORER */}
      {isExplorerOpen && (
        <div className="w-64 bg-[#161616] border-r border-[#262626] flex flex-col shrink-0 animate-in slide-in-from-left-10 duration-200">
          <div className="h-12 flex items-center justify-between px-4 border-b border-[#262626]">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Explorer</span>
            <div className="flex gap-1">
              <button onClick={() => setIsExplorerOpen(false)} className="p-1 hover:bg-[#262626] rounded text-gray-500 hover:text-white" title="Close Explorer">
                <PanelLeftClose size={14} />
              </button>
            </div>
          </div>


          {showNewFileInput && (
            <div className="p-2 border-b border-[#262626]">
              <input
                autoFocus
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createNewFile();
                  if (e.key === 'Escape') setShowNewFileInput(false);
                }}
                placeholder="New note name..."
                className="w-full px-2 py-1 bg-[#262626] border border-[#333] rounded text-sm text-white outline-none focus:border-purple-500"
              />
            </div>
          )}

          {showNewFolderInput && (
            <div className="p-2 border-b border-[#262626]">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createNewFolder();
                  if (e.key === 'Escape') setShowNewFolderInput(false);
                }}
                placeholder="New folder name..."
                className="w-full px-2 py-1 bg-[#262626] border border-[#333] rounded text-sm text-white outline-none focus:border-yellow-500"
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5 custom-scrollbar">
            {fileTree.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-4">
                {window.nexusAPI?.notes ? 'Loading...' : 'Run in Tauri desktop app to access files'}
              </div>
            ) : (
              fileTree.map(node => (
                <FileTreeItemReal
                  key={node.path}
                  node={node}
                  depth={0}
                  selectedPath={selectedFile}
                  onSelect={openFile}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  onDrop={handleFileDrop}
                  onRename={handleRename}
                />
              ))
            )}
          </div>

          <div className="flex items-center gap-1 p-2 border-t border-[#262626]">
            <button onClick={loadFileTree} className="p-1.5 hover:bg-[#262626] rounded text-gray-500 hover:text-white" title="Refresh">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { setShowNewFileInput(true); setShowNewFolderInput(false); }} className="p-1.5 hover:bg-[#262626] rounded text-gray-500 hover:text-white" title="New Note">
              <FilePlus size={14} />
            </button>
            <button onClick={() => { setShowNewFolderInput(true); setShowNewFileInput(false); }} className="p-1.5 hover:bg-[#262626] rounded text-gray-500 hover:text-white" title="New Folder">
              <FolderOpen size={14} />
            </button>
            <button
              onClick={selectVault}
              className="flex-1 ml-1 px-2 py-1.5 bg-[#262626] border border-[#333] rounded text-xs text-center text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              Change Vault
            </button>
          </div>
        </div>
      )}

      {/* CENTER COLUMN: EDITOR */}
      <div className="flex-1 flex flex-col bg-[#0a0a0a] relative min-w-0">
        {/* Header / Breadcrumbs */}
        <div className="h-12 flex items-center justify-between px-4 border-b border-[#262626]">
          <div className="flex items-center gap-3 overflow-hidden">
            {!isExplorerOpen && (
              <button onClick={() => setIsExplorerOpen(true)} className="p-1 hover:bg-[#262626] rounded text-gray-500 hover:text-white" title="Open Explorer">
                <PanelLeftOpen size={16} />
              </button>
            )}

            <div className="flex items-center text-sm text-gray-500 select-none overflow-hidden text-ellipsis whitespace-nowrap">
              {breadcrumbs.length > 0 ? (
                breadcrumbs.map((crumb, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <ChevronRight size={14} className="mx-2 opacity-50 shrink-0" />}
                    <span className={`truncate ${i === breadcrumbs.length - 1 ? 'text-gray-300' : 'hover:text-gray-300 cursor-pointer transition-colors'}`}>
                      {crumb.replace('.md', '')}
                    </span>
                  </React.Fragment>
                ))
              ) : (
                <span className="text-gray-600">No note selected</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedFile && (
              <>
                {isEditing ? (
                  <>
                    <button onClick={saveFile} className="flex items-center gap-1 px-3 py-1 bg-green-600 rounded text-xs text-white hover:bg-green-500">
                      <Save size={12} /> <span className="hidden sm:inline">Save</span>
                    </button>
                    <button onClick={() => { setIsEditing(false); setEditContent(fileContent); }} className="flex items-center gap-1 px-3 py-1 bg-[#262626] rounded text-xs text-gray-300 hover:bg-[#333]">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="flex items-center gap-1 px-3 py-1 bg-[#262626] rounded text-xs text-gray-300 hover:bg-[#333]">
                    <Edit3 size={12} /> <span className="hidden sm:inline">Edit</span>
                  </button>
                )}
              </>
            )}

            {!isAiPanelOpen && (
              <button onClick={() => setIsAiPanelOpen(true)} className="p-1 hover:bg-[#262626] rounded text-gray-500 hover:text-white ml-2" title="Open AI">
                <PanelRightOpen size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0a0a0a]">
          {selectedFile ? (
            <div className="w-full h-full">
              {isEditing ? (
                <TiptapEditor
                  content={editContent}
                  onChange={(val) => setEditContent(val)}
                  onEditorCreate={(editor) => { editorRef.current = editor; }}
                  onSelectionChange={setSelectedContext}
                  onSelectionRangeChange={setTiptapRange}
                />
              ) : (
                <div
                  ref={markdownContainerRef}
                  onMouseUp={handleMouseUp}
                  className="prose prose-invert max-w-none w-full px-4 sm:px-8 pb-8 pt-4 cursor-auto select-text"
                >
                  <MarkdownRenderer content={fileContent} onCheckboxToggle={handleCheckboxToggle} />
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <FileText size={48} className="mb-4 opacity-30" />
              <p>Select a note to view</p>
            </div>
          )}
        </div>
      </div>

      {/* DRAG HANDLE */}
      {isAiPanelOpen && (
        <div
          onMouseDown={startResizing}
          className={`w-1 hover:w-1 bg-[#262626] hover:bg-purple-500/50 cursor-col-resize z-50 transition-colors ${isResizing ? 'bg-purple-500' : ''}`}
        />
      )}

      {/* RIGHT COLUMN: NEXUS AI */}
      {isAiPanelOpen && (
        <div
          ref={sidebarRef}
          style={{ width: aiPanelWidth }}
          className="bg-[#161616] border-l border-[#262626] flex flex-col shrink-0 animate-in slide-in-from-right-10 duration-200"
        >
          <div className="h-12 flex items-center justify-between px-5 border-b border-[#262626]">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-purple-400 fill-purple-400/20" />
              <span className="font-semibold text-sm tracking-wide text-gray-200">Nexus AI</span>
            </div>
            <button onClick={() => setIsAiPanelOpen(false)} className="text-gray-500 cursor-pointer hover:text-white transition-colors">
              <PanelRightClose size={14} />
            </button>
          </div>

          {/* AI Header Actions - Clear Chat & Revert */}
          <div className="px-5 pt-3 pb-0 flex justify-end gap-3">
            {previousContent && (
              <button
                onClick={handleRevertAction}
                className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-yellow-500 hover:text-yellow-400 transition-colors"
                title="Undo last AI action"
              >
                <RefreshCw size={12} /> Undo AI Edit
              </button>
            )}
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-gray-500 hover:text-red-400 transition-colors"
              title="Clear current chat history"
            >
              <Trash2 size={12} /> Clear Chat
            </button>
          </div>

          <div className="flex-1 flex flex-col p-5 overflow-hidden">
            {/* Mode Toggle */}
            <div className="mb-4">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">AI Mode</h4>
              <div className="flex p-1 bg-[#0a0a0a] rounded-lg border border-[#262626]">
                <button
                  onClick={() => { setAiMode('lecture'); setProposedAction(null); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all ${aiMode === 'lecture' ? 'bg-[#262626] text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <FileText size={14} />
                  Lecture
                </button>
                <button
                  onClick={() => setAiMode('edit')}
                  className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-xs font-medium transition-all ${aiMode === 'edit' ? 'bg-[#262626] text-purple-400' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  <Edit3 size={14} />
                  Edit
                </button>
              </div>
            </div>

            {/* Model Selector */}
            <div className="mb-4 relative">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Model</h4>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 bg-[#262626] border border-[#333] rounded text-sm text-gray-300 hover:border-purple-500/40 transition-colors"
              >
                <span className="truncate">{selectedModel || 'Select model...'}</span>
                <ChevronDown size={14} className={`transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showModelDropdown && (
                <div className="absolute z-20 w-full mt-1 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl max-h-72 overflow-y-auto">
                  {/* Search Input */}
                  <div className="sticky top-0 bg-[#1a1a1a] border-b border-[#333] p-2">
                    <input
                      type="text"
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      placeholder="Search models..."
                      className="w-full px-3 py-2 bg-[#262626] border border-[#333] rounded text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:border-purple-500/40"
                      autoFocus
                    />
                  </div>
                  {modelsLoading ? (
                    <div className="px-3 py-2 text-sm text-gray-500">Loading models...</div>
                  ) : (
                    availableModels
                      .filter(model => {
                        const searchLower = modelSearchQuery.toLowerCase();
                        return (model.name || model.id).toLowerCase().includes(searchLower) ||
                          model.id.toLowerCase().includes(searchLower);
                      })
                      .map(model => (
                        <button
                          key={model.id}
                          onClick={() => { setSelectedModel(model.id); setShowModelDropdown(false); setModelSearchQuery(''); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-[#262626] transition-colors ${selectedModel === model.id ? 'bg-purple-900/30 text-purple-300' : 'text-gray-300'}`}
                        >
                          {model.name || model.id}
                        </button>
                      ))
                  )}
                </div>
              )}
            </div>

            {/* Current Note Context */}
            {selectedFile && (
              <div className="mb-4">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Current Context</h4>
                <div className="flex items-center gap-2 bg-[#262626]/50 border border-[#333] rounded px-2 py-1.5">
                  <FileText size={12} className="text-cyan-400" />
                  <span className="text-xs text-gray-300 truncate">{selectedFile.split(/[/\\]/).pop()}</span>
                </div>
              </div>
            )}

            <div className="w-full h-px bg-[#262626] mb-4"></div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 mb-4 pr-1 custom-scrollbar">
              {aiMessages.map((msg, i) => (
                <ChatBubble key={i} sender={msg.sender} text={msg.text} context={msg.context} isAction={msg.isAction} />
              ))}
              {isAiLoading && (
                <div className="flex items-start">
                  <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/10 text-gray-400 rounded-2xl rounded-tl-sm border border-purple-500/10 px-3 py-2 text-sm">
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Confirmation Overlay */}
          {proposedAction && (
            <div className="px-5 pb-4 animate-in slide-in-from-bottom-4 duration-300">
              <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 shadow-lg backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2 text-purple-300">
                  <Sparkles size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">AI Proposal</span>
                </div>
                <p className="text-sm text-gray-200 mb-3">{proposedAction.message || "Confirm this action?"}</p>
                <div className="bg-[#0a0a0a]/80 rounded-md p-2 mb-4 max-h-48 overflow-y-auto border border-[#333] font-mono text-[11px] leading-snug">
                  <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wider font-sans font-bold flex items-center gap-1.5 border-b border-[#333] pb-1.5">
                    {proposedAction.type === 'replace_selection' || proposedAction.type === 'find_and_replace' || proposedAction.type === 'replace_all' ? 'Proposed Change (Diff View)' : 'Proposed Addition'}
                  </div>

                  {proposedAction.target_text && (
                    <div className="mb-1.5 group">
                      <div className="text-[9px] text-red-400 font-sans uppercase tracking-wider mb-0.5 select-none opacity-80 group-hover:opacity-100 transition-opacity">To Remove</div>
                      <pre className="bg-red-500/10 text-red-300 px-2 py-1.5 rounded whitespace-pre-wrap border-l-2 border-red-500/50">
                        {proposedAction.target_text}
                      </pre>
                    </div>
                  )}

                  <div className="group mt-2">
                    <div className="text-[9px] text-green-400 font-sans uppercase tracking-wider mb-0.5 select-none opacity-80 group-hover:opacity-100 transition-opacity">To Insert</div>
                    <pre className="bg-green-500/10 text-green-300 px-2 py-1.5 rounded whitespace-pre-wrap border-l-2 border-green-500/50">
                      {(proposedAction.content && proposedAction.content.trim()) || '[No insertion content parsed. Retry request.]'}
                    </pre>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleApplyAction}
                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-2 rounded transition-colors shadow-md"
                  >
                    Confirm & Apply
                  </button>
                  <button
                    onClick={() => setProposedAction(null)}
                    className="px-3 bg-[#262626] hover:bg-[#333] text-gray-300 text-xs font-bold py-2 rounded transition-colors"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Context Chip */}
          {selectedContext && (
            <div className="mx-4 mt-2 p-2 bg-[#262626] border border-purple-500/30 rounded-lg flex items-start gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
              <div className="mt-0.5 text-purple-400">
                <Sparkles size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider mb-0.5">Using Context</div>
                <div className="text-xs text-gray-300 line-clamp-2 font-mono border-l-2 border-purple-500/50 pl-2">
                  {selectedContext}
                </div>
              </div>
              <button
                onClick={() => { setSelectedContext(''); window.getSelection()?.removeAllRanges(); }}
                className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
              >
                <PanelLeftClose size={14} className="rotate-45" /> {/* Using as X icon */}
              </button>
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 bg-[#161616]">
            <div className="relative bg-[#0a0a0a] border border-[#262626] rounded-xl focus-within:border-purple-500/50 transition-colors">
              <textarea
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask Nexus about ${selectedFile ? 'this note' : 'your notes'}...`}
                className="w-full bg-transparent border-none text-sm text-gray-200 p-3 pr-12 outline-none resize-none h-12 min-h-[48px] max-h-32 custom-scrollbar"
                style={{ height: '48px' }} // Dynamic height handling typically needs a ref/effect
              />
              <button
                onClick={isAiLoading ? handleStopAi : handleAiSend}
                disabled={!isAiLoading && !aiInput.trim()}
                className={`absolute right-2 top-2 p-2 rounded-lg text-white transition-all shadow-lg shadow-purple-900/20 ${isAiLoading ? 'bg-red-500 hover:bg-red-600' : 'bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                title={isAiLoading ? "Stop generation" : "Send message"}
              >
                {isAiLoading ? <Square size={16} fill="currentColor" /> : <Send size={16} />}
              </button>
            </div>
            <div className="mt-2 text-[10px] text-center text-gray-600">
              Nexus AI can make mistakes. Review generated actions.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// Real File Tree Item Component
interface FileTreeItemRealProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onDrop: (sourcePath: string, targetPath: string) => void;
  onRename: (oldPath: string, newName: string) => void;
}

const FileTreeItemReal: React.FC<FileTreeItemRealProps> = ({
  node, depth, selectedPath, onSelect, expandedFolders, toggleFolder, onDrop, onRename
}) => {
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = selectedPath === node.path;
  const [isDragOver, setIsDragOver] = useState(false);

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);

  // Drag Handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('sourcePath', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.isDirectory) {
      setIsDragOver(true);
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const sourcePath = e.dataTransfer.getData('sourcePath');
    if (sourcePath && node.isDirectory) {
      onDrop(sourcePath, node.path);
    }
  };

  const submitRename = () => {
    const newName = renameValue.trim();
    if (newName && newName !== node.name) {
      onRename(node.path, newName);
    }
    setIsRenaming(false);
  };

  return (
    <div>
      <div
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!isRenaming) {
            node.isDirectory ? toggleFolder(node.path) : onSelect(node.path);
          }
        }}
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer select-none text-sm transition-colors group relative pr-8
          ${isSelected ? 'bg-[#262626] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#262626]/50'}
          ${isDragOver ? 'bg-purple-900/30 ring-1 ring-purple-500' : ''}
        `}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="opacity-70 group-hover:opacity-100">
          {node.isDirectory ? (
            isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-3.5" />
          )}
        </span>

        {node.isDirectory ? (
          isExpanded ? <FolderOpen size={14} className="text-yellow-500" /> : <Folder size={14} className="text-yellow-600" />
        ) : (
          <FileText size={14} className={isSelected ? 'text-cyan-400' : 'text-gray-400 group-hover:text-gray-200'} />
        )}

        {isRenaming ? (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            onBlur={submitRename}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-[#0a0a0a] border border-blue-500 rounded px-1 -ml-1 text-white outline-none"
          />
        ) : (
          <span className="truncate">{node.name.replace('.md', '')}</span>
        )}

        {/* Rename Button (Visible on Hover) */}
        {!isRenaming && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsRenaming(true);
              setRenameValue(node.name);
            }}
            className="absolute right-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-gray-500 hover:text-white transition-all"
            title="Rename"
          >
            <Edit3 size={12} />
          </button>
        )}
      </div>

      {node.isDirectory && isExpanded && node.children && (
        <div className="flex flex-col gap-0.5">
          {node.children.map(child => (
            <FileTreeItemReal
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              onDrop={onDrop}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Markdown Renderer using react-markdown
interface MarkdownRendererProps {
  content: string;
  onCheckboxToggle?: (lineIndex: number, checked: boolean) => void;
}

const MarkdownRendererImpl: React.FC<MarkdownRendererProps> = ({ content, onCheckboxToggle }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => <h1 className={MARKDOWN_STYLES.h1}>{children}</h1>,
        h2: ({ children }) => <h2 className={MARKDOWN_STYLES.h2}>{children}</h2>,
        h3: ({ children }) => <h3 className={MARKDOWN_STYLES.h3}>{children}</h3>,
        h4: ({ children }) => <h4 className={MARKDOWN_STYLES.h4}>{children}</h4>,
        h5: ({ children }) => <h5 className={MARKDOWN_STYLES.h5}>{children}</h5>,
        h6: ({ children }) => <h6 className={MARKDOWN_STYLES.h6}>{children}</h6>,

        // Paragraphs
        p: ({ children }) => <p className={MARKDOWN_STYLES.p}>{children}</p>,

        // Lists - detect if contains task items
        ul: ({ children, node, ...props }) => {
          // @ts-ignore
          const hasTaskItems = node?.children?.some((child: any) => typeof child?.checked === 'boolean');
          if (hasTaskItems) {
            return <ul className="list-none p-0 m-0" {...props}>{children}</ul>;
          }
          return <ul className={MARKDOWN_STYLES.ul} {...props}>{children}</ul>;
        },
        ol: ({ children }) => <ol className={MARKDOWN_STYLES.ol}>{children}</ol>,

        // List items with checkbox support  
        li: ({ children, node, ...props }) => {
          // @ts-ignore
          const isTaskItem = typeof node?.checked === 'boolean';

          if (isTaskItem) {
            // @ts-ignore
            const isChecked = node.checked;
            // @ts-ignore
            const lineNumber = node?.position?.start?.line ? node.position.start.line - 1 : -1;

            return (
              <li
                className="flex items-center gap-2 py-[2px] cursor-pointer list-none"
                onClick={() => {
                  if (onCheckboxToggle && lineNumber >= 0) {
                    onCheckboxToggle(lineNumber, !isChecked);
                  }
                }}
                {...props}
              >
                <span className={`
                  w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center
                  ${isChecked
                    ? 'bg-blue-500 border-blue-500'
                    : 'border-gray-500 bg-transparent hover:border-blue-400'
                  }
                `}>
                  {isChecked && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className={`leading-tight [&>p]:m-0 [&>p]:inline ${isChecked ? 'line-through text-gray-500' : 'text-gray-300'}`}>
                  {children}
                </span>
              </li>
            );
          }

          return <li className={MARKDOWN_STYLES.li} {...props}>{children}</li>;
        },

        // Code
        code: ({ className, children, ...props }) => {
          const codeText = String(children).replace(/\n$/, '');
          const mermaidByClass = !!className && className.includes('language-mermaid');
          const mermaidByContent = looksLikeMermaid(codeText);
          const isMermaid = mermaidByClass || mermaidByContent;

          if (isMermaid) {
            return <MermaidBlock chart={codeText} />;
          }

          const isInline = !className;
          if (isInline) {
            return <code className={MARKDOWN_STYLES.codeInline}>{children}</code>;
          }
          return (
            <code className={`${className} text-gray-300`} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => {
          const child = React.Children.only(children) as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;
          const className = child?.props?.className || '';
          const codeText = typeof child?.props?.children === 'string'
            ? child.props.children
            : Array.isArray(child?.props?.children)
              ? child?.props?.children.join('')
              : '';

          if (className.includes('language-mermaid') || looksLikeMermaid(codeText)) {
            return <MermaidBlock chart={codeText} />;
          }
          return (
            <pre className={MARKDOWN_STYLES.codeBlock}>
              {children}
            </pre>
          );
        },

        // Links
        a: ({ href, children }) => (
          <a href={href} className={MARKDOWN_STYLES.a} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),

        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className={MARKDOWN_STYLES.blockquote}>
            {children}
          </blockquote>
        ),

        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className={MARKDOWN_STYLES.table}>{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-[#1a1a1a]">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className={MARKDOWN_STYLES.tr}>{children}</tr>,
        th: ({ children }) => <th className={MARKDOWN_STYLES.th}>{children}</th>,
        td: ({ children }) => <td className={MARKDOWN_STYLES.td}>{children}</td>,

        // Horizontal rule
        hr: () => <hr className={MARKDOWN_STYLES.hr} />,

        // Bold & Italic
        strong: ({ children }) => <strong className="font-bold text-white">{children}</strong>,
        em: ({ children }) => <em className="italic text-gray-400">{children}</em>,

        // Images
        img: ({ src, alt }) => (
          <img src={src} alt={alt || ''} className={MARKDOWN_STYLES.img} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
};

const MarkdownRenderer = React.memo(MarkdownRendererImpl);
MarkdownRenderer.displayName = 'MarkdownRenderer';

const ChatBubble: React.FC<{ sender: 'ai' | 'user'; text: string; context?: string; isAction?: boolean }> = ({ sender, text, context, isAction }) => {
  const [isThinkExpanded, setIsThinkExpanded] = React.useState(false);

  // Parse for <think> tags
  const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
  const thinkContent = thinkMatch ? thinkMatch[1] : null;

  // If this message resulted in a successfully parsed action, we completely hide the raw text.
  // We still allow 'thinkContent' if DeepSeek or others generated thoughts before acting.
  if (isAction && sender === 'ai') {
    text = "Action proposed.";
  }

  // Remove <think> tags and JSON action blocks from display just in case
  let cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // Hide all JSON blocks, even unclosed ones (common when Kimi runs out of tokens or forgets backticks)
  if (!isAction) {
    cleanText = cleanText.replace(/```json[\s\S]*?(?:```|$)/ig, '').trim();
    // Clean up loose JSON objects if the model just spat out `{ "action": ... }` at the end
    cleanText = cleanText.replace(/\{\s*"action"[\s\S]*?$/ig, '').trim();
  }

  // If the message was entirely a JSON action and we stripped it, don't show an empty bubble.
  if (cleanText === '' && sender === 'ai') {
    cleanText = "Done.";
  }

  return (
    <div className={`flex flex-col ${sender === 'user' ? 'items-end' : 'items-start'} max-w-[95%]`}>

      {/* Context Badge for User Messages */}
      {sender === 'user' && context && (
        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-purple-400 bg-purple-900/20 border border-purple-500/30 rounded px-2 py-1">
          <Sparkles size={10} />
          <span className="font-mono line-clamp-1 max-w-[200px]">{context}</span>
        </div>
      )}

      {/* Thinking Process (Collapsible) */}
      {thinkContent && (
        <div className="w-full mb-2">
          <button
            onClick={() => setIsThinkExpanded(!isThinkExpanded)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-1"
          >
            <ChevronRight size={12} className={`transition-transform duration-200 ${isThinkExpanded ? 'rotate-90' : ''}`} />
            <span className="font-mono">Thinking Process</span>
          </button>

          {isThinkExpanded && (
            <div className="text-xs text-gray-400 bg-[#1a1a1a] border-l-2 border-gray-700 pl-3 py-2 my-1 italic font-mono whitespace-pre-wrap leading-relaxed animate-in slide-in-from-top-2 duration-200">
              {thinkContent.trim()}
            </div>
          )}
        </div>
      )}

      {/* Main Message */}
      <div className={`
        rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
        ${sender === 'user'
          ? 'bg-[#262626] text-gray-200 rounded-tr-sm border border-[#333]'
          : 'bg-gradient-to-br from-purple-900/20 to-blue-900/10 text-gray-300 rounded-tl-sm border border-purple-500/10'}
      `}>
        {cleanText || (thinkContent ? <span className="italic text-gray-500">Thinking complete.</span> : text)}
      </div>

      <span className="text-[10px] text-gray-600 mt-1 px-1 select-none">
        {sender === 'ai' ? 'Nexus' : 'You'}
      </span>
    </div>
  );
};




