# NEXUS OS

**NEXUS OS** is a feature-rich, AI-powered personal desktop application built with [Tauri v2](https://v2.tauri.app/) (Rust backend) and React/TypeScript (frontend). It acts as an all-in-one productivity hub — tracking your daily computer activity, providing an AI chat assistant, managing notes and schedules, playing music, and much more, all from a single sleek desktop window.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Available Scripts](#available-scripts)
- [Views & Modules](#views--modules)
  - [Dashboard](#dashboard)
  - [Chat](#chat)
  - [Activity](#activity)
  - [Diary](#diary)
  - [Code (LeetCode Tracker)](#code-leetcode-tracker)
  - [Brain (Notes)](#brain-notes)
  - [Schedule](#schedule)
  - [Zen Mode](#zen-mode)
  - [Music](#music)
  - [Settings](#settings)
  - [Tray Panel](#tray-panel)
- [Frontend Architecture](#frontend-architecture)
  - [Components](#components)
  - [Stores (Zustand)](#stores-zustand)
  - [Services](#services)
  - [Hooks](#hooks)
  - [Lib](#lib)
- [Backend Architecture (Rust / Tauri)](#backend-architecture-rust--tauri)
  - [Intent Modules](#intent-modules)
  - [Models](#models)
  - [Services](#services-1)
  - [Utils](#utils)
- [Tauri API Bridge (`tauri-api.ts`)](#tauri-api-bridge-tauri-apits)
- [Data & Privacy](#data--privacy)
- [Supported AI Providers](#supported-ai-providers)
- [Google Integration](#google-integration)
- [Python Utilities](#python-utilities)
- [Contributing](#contributing)
- [License](#license)

---

## Features

| Feature | Description |
|---|---|
| 🧠 **AI Chat** | Multi-session chat with context from your activity data. Supports NVIDIA NIM, OpenAI, Anthropic, Groq, and local LM Studio. |
| 📊 **Activity Tracker** | Silently records which apps/windows you use and for how long, categorised automatically. |
| 📖 **AI Diary** | Generates a daily narrative summary of your activity, with manual note support. |
| 📝 **Brain (Notes)** | Obsidian-style vault note-taking with a rich TipTap editor and an embedded AI assistant. |
| 💻 **Code / LeetCode** | Track LeetCode problems, mark them solved, add notes, and get AI-powered explanations. |
| 📅 **Schedule** | Visual day planner with Google Calendar and Google Tasks two-way sync. |
| 🎵 **Music Player** | YouTube-backed music player with playlists, liked songs, search, and a queue. |
| 🧘 **Zen Mode** | Minimalist focus timer with Pomodoro, music sync, and Do Not Disturb toggle. |
| 🗂️ **Dashboard** | At-a-glance AI summary cards (Morning Brief, Standup, etc.), projects, deadlines, fitness, news, and goals. |
| 🖥️ **System Tray** | Always-accessible tray panel with timer controls, music controls, incognito/game mode, and navigation shortcuts. |
| 🔒 **Incognito Mode** | Temporarily pause all activity tracking for a set number of minutes. |
| 🎮 **Game Mode** | Disable non-essential background tasks for performance-sensitive scenarios. |
| ⌨️ **Global Shortcut** | Keyboard shortcut to show/hide the app window from anywhere. |
| 🚀 **Autostart** | Optional startup with Windows, minimizing to tray on launch. |
| 💾 **Data Export/Import** | Export and import all local SQLite data as a portable file. |

---

## Tech Stack

### Frontend
| Library | Version | Purpose |
|---|---|---|
| React | ^19 | UI framework |
| TypeScript | ~5.8 | Type safety |
| Vite | ^6 | Build tool & dev server |
| Tailwind CSS | (via CDN/config) | Utility-first styling |
| Framer Motion | ^11 | Animations |
| Zustand | ^5 | Global state management |
| TipTap | ^3 | Rich text / note editor |
| React Markdown | ^10 | Markdown rendering |
| Mermaid | ^11 | Diagram rendering in notes |
| react-youtube | ^10 | YouTube player for Music view |
| date-fns | ^4 | Date utilities |
| DOMPurify | ^3 | HTML sanitisation |
| Lucide React | ^0.555 | Icon library |
| jsPDF | ^4 | PDF export |

### Backend (Rust)
| Crate | Purpose |
|---|---|
| tauri v2 | Desktop app shell, IPC, tray, global shortcuts |
| rusqlite (bundled) | Embedded SQLite database |
| reqwest | Async HTTP client for AI API calls |
| tokio | Async runtime |
| serde / serde_json | Serialisation |
| chrono | Date & time |
| active-win-pos-rs | Active window detection |
| xcap / image | Screen capture for OCR |
| windows crate | Windows OCR, media controls |
| uuid | Unique ID generation |
| walkdir | File-system traversal (Notes vault) |
| regex | Text pattern matching |
| tauri-plugin-autostart | System startup registration |
| tauri-plugin-global-shortcut | Global keyboard shortcuts |
| tauri-plugin-dialog | Native file/folder dialogs |

---

## Project Structure

```
DSC/
├── App.tsx                      # Root React component; routes between views
├── index.tsx                    # Entry point; mounts React and initialises nexusAPI
├── index.html                   # Vite HTML shell
├── tauri-api.ts                 # Defines window.nexusAPI — all Tauri invoke() calls
├── vite.config.mjs              # Vite config (port 5180, env injection)
├── tsconfig.json                # TypeScript config
├── package.json                 # Node dependencies & scripts
├── .env.example                 # Environment variable template
├── leetcode_problems.csv        # Default LeetCode problem list (bundled as a Tauri resource)
├── organize_leetcode.py         # Python helper: organises/enriches the CSV
├── setup.py                     # Python setup script
│
├── views/                       # Top-level page components (one per sidebar tab)
│   ├── DashboardView.tsx
│   ├── ChatView.tsx
│   ├── ActivityView.tsx
│   ├── DiaryView.tsx
│   ├── CodeView.tsx
│   ├── BrainView.tsx
│   ├── ScheduleView.tsx
│   ├── ZenView.tsx
│   ├── MusicView.tsx
│   ├── MusicApp.css
│   ├── SettingsView.tsx
│   ├── NotesView.tsx
│   └── TrayPanelView.tsx        # Separate window rendered in the system tray popup
│
├── components/                  # Reusable UI components
│   ├── layout/
│   │   ├── AppLayout.tsx        # Outer shell: sidebar + main content area
│   │   └── Sidebar.tsx          # Icon sidebar with nav buttons
│   ├── chat/
│   │   ├── ChatPage.tsx         # Full chat UI (sessions, messages, model picker)
│   │   ├── ChatMessage.tsx      # Individual message bubble
│   │   └── ChatSidebar.tsx      # Chat session list panel
│   ├── dashboard/
│   │   ├── AISummaryCard.tsx    # Prompts for Morning Brief, Standup, etc.
│   │   ├── DetailModal.tsx      # Modal for project/deadline details
│   │   ├── FitnessCard.tsx      # Fitness tracking card
│   │   ├── GoalsCard.tsx        # Goals display card
│   │   ├── GoalsManager.tsx     # Add/edit goals
│   │   ├── LeetCodeCard.tsx     # LeetCode progress summary
│   │   ├── NewsCard.tsx         # Curated news headlines
│   │   ├── NewsManager.tsx      # Manage news sources
│   │   ├── ProjectsCard.tsx     # Active projects & deadlines
│   │   └── TaskAlerter.tsx      # Upcoming task notifications
│   ├── notes/
│   │   └── NotesApp.tsx         # Standalone notes component
│   ├── schedule/
│   │   ├── EventModal.tsx       # Create/edit calendar events
│   │   └── TaskModal.tsx        # Create/edit tasks
│   ├── ui/
│   │   └── Card.tsx             # Generic card wrapper
│   ├── zen/
│   │   └── MusicEngine.tsx      # Hidden YouTube player engine (global singleton)
│   ├── DynamicIsland.tsx        # macOS-style notification island
│   ├── GlobalWidgets.tsx        # Mounts MusicEngine globally
│   └── MermaidBlock.tsx         # Renders Mermaid diagrams inside markdown
│
├── store/                       # Zustand global state stores
│   ├── useNavStore.ts           # Active sidebar tab
│   ├── useIntentStore.ts        # Settings, activity stats, chat sessions, diary entries
│   ├── useMusicStore.ts         # Playlists, current track, playback state
│   ├── useTimerStore.ts         # Focus timer / Pomodoro state
│   ├── useScheduleStore.ts      # Tasks, calendar events, Google sync state
│   ├── useCodeStore.ts          # LeetCode problem list & solved state
│   └── useLeetCodeActivityStore.ts  # LeetCode session activity tracking
│
├── services/
│   ├── chatService.ts           # Wraps nexusAPI.intent.* for Chat view
│   └── brainAiService.ts        # AI logic for Brain (notes) view: RAG, tool calls, streaming
│
├── hooks/
│   ├── useFavoriteModels.ts     # Persist recently-used AI models in localStorage
│   ├── usePlaylistLoader.ts     # Load playlists from backend on startup
│   └── useSettings.ts           # Load/save app settings from backend
│
├── lib/
│   ├── chatTypes.ts             # Shared types: ChatSession, ChatMessage
│   ├── chatUtils.ts             # Utility functions for chat (message formatting, etc.)
│   └── constants.ts             # App-wide constants (localStorage keys, YouTube player states)
│
├── intent-flow-main/            # Older standalone intent-flow prototype (kept for reference)
│   └── src/components/Chat/ChatPage.tsx
│
└── src-tauri/                   # Tauri / Rust backend
    ├── tauri.conf.json          # Tauri configuration (window size, bundle targets, product name)
    ├── Cargo.toml               # Rust crate manifest & dependencies
    ├── build.rs                 # Tauri build script
    ├── capabilities/
    │   └── default.json         # Tauri IPC capability declarations
    ├── icons/                   # App icons for all platforms (Windows, macOS, Linux, iOS, Android)
    └── src/
        ├── main.rs              # Binary entry point
        ├── lib.rs               # Core app setup: tray, shortcuts, window management, all Tauri commands
        ├── intent/
        │   ├── mod.rs           # Module exports
        │   ├── db.rs            # SQLite schema init & connection helpers
        │   ├── activity.rs      # Tauri commands: get_activities, get_activity_stats
        │   ├── activity_tracker.rs  # Background thread: polls active window every ~200 ms
        │   ├── chat.rs          # Tauri commands: chat session & message CRUD + AI streaming
        │   ├── dashboard.rs     # Tauri commands: dashboard overview, project/deadline CRUD
        │   ├── diary.rs         # Tauri commands: diary entry CRUD + AI generation
        │   ├── file_monitor.rs  # File system change monitoring (Notes vault)
        │   ├── screen_capture.rs  # Windows OCR screen capture
        │   ├── settings.rs      # Tauri commands: settings get/save, API key validation, model listing
        │   ├── storage.rs       # Tauri commands: stats, clear, export, import
        │   └── windows_utils.rs # Windows-specific utilities (process info, media metadata)
        ├── models/
        │   ├── mod.rs
        │   └── settings.rs      # Rust struct for AppSettings (serialised to/from JSON)
        ├── services/
        │   ├── mod.rs
        │   └── query_engine.rs  # Core AI query engine: builds prompts with activity context
        └── utils/
            ├── mod.rs
            └── config.rs        # Config file path helpers
```

---

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **Rust** (stable toolchain) — install via [rustup.rs](https://rustup.rs/)
- **Tauri CLI** — installed automatically as a dev dependency
- **Windows** is the primary target (uses `winapi` and `windows` crates for screen capture, OCR and media metadata). macOS/Linux builds are possible but some backend features may be limited.

---

## Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/Ashvin-KS/DSC.git
cd DSC

# 2. Install Node dependencies
npm install

# 3. Copy the environment template and fill in your API keys
cp .env.example .env
# Edit .env with your credentials (see Environment Variables below)

# 4. Start the development build (launches the desktop window)
npm run tauri:dev

# 5. (Optional) Build a production installer
npm run tauri:build
```

---

## Environment Variables

Copy `.env.example` to `.env` and populate the following keys:

| Variable | Required | Description |
|---|---|---|
| `VITE_A4F_API_KEY` | Optional | API key for the A4F/AI provider gateway |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth 2.0 client ID for Calendar & Tasks sync |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth 2.0 client secret |

Additional API keys (NVIDIA NIM, OpenAI, Anthropic, Groq) are configured **inside the app** via the Settings view and are stored securely in the local database — they are never committed to source control.

> ⚠️ **Never commit your `.env` file.** It is listed in `.gitignore`.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server only (browser preview, no Tauri) |
| `npm run build` | Build the frontend with Vite |
| `npm run preview` | Preview the Vite production build in a browser |
| `npm run tauri:dev` | Start the full Tauri desktop app in dev mode (hot-reload) |
| `npm run tauri:build` | Compile a production installer/binary |

---

## Views & Modules

### Dashboard

**File:** `views/DashboardView.tsx`

The main landing screen. Displays a grid of cards:

- **AI Summary Cards** (`components/dashboard/AISummaryCard.tsx`) — one-click prompts that send your activity context to the AI and return a narrative: *Morning Brief*, *Standup Update*, *Focus Suggestion*, *Productivity Score*, and *Evening Wrap-Up*.
- **Projects & Deadlines** (`components/dashboard/ProjectsCard.tsx`, `DetailModal.tsx`) — track active projects with deadlines; CRUD stored in the backend database.
- **Fitness Card** (`components/dashboard/FitnessCard.tsx`) — log fitness metrics.
- **Goals Card** (`components/dashboard/GoalsCard.tsx`, `GoalsManager.tsx`) — set and review personal goals.
- **LeetCode Card** (`components/dashboard/LeetCodeCard.tsx`) — displays solve count and recent activity from the Code view.
- **News Card** (`components/dashboard/NewsCard.tsx`, `NewsManager.tsx`) — configurable news headlines.
- **Task Alerter** (`components/dashboard/TaskAlerter.tsx`) — surfaces imminent schedule tasks as in-app alerts.

---

### Chat

**File:** `views/ChatView.tsx` → `components/chat/ChatPage.tsx`

A full multi-session AI chat interface:

- **Session management** — create, rename and delete chat sessions (`components/chat/ChatSidebar.tsx`).
- **Model picker** — choose from NVIDIA NIM, OpenAI, Anthropic, Groq, or a local LM Studio endpoint.
- **Context sources** — optionally inject recent activity data, notes vault excerpts, or other sources into the system prompt.
- **Streaming responses** — AI replies are streamed token-by-token for a responsive feel.
- **Markdown rendering** — responses are rendered with `react-markdown` + `remark-gfm`, including syntax-highlighted code blocks and Mermaid diagram support (`components/MermaidBlock.tsx`).
- **Favorite models** — recently-used models are persisted via `hooks/useFavoriteModels.ts`.

**Service:** `services/chatService.ts` wraps all `nexusAPI.intent.*` IPC calls.  
**Backend:** `src-tauri/src/intent/chat.rs` handles session/message CRUD and proxies streaming AI requests.

---

### Activity

**File:** `views/ActivityView.tsx`

Displays everything the backend's activity tracker has recorded:

- **Timeline view** — chronological list of app sessions with expandable details.
- **Category breakdown bar** — visual proportion of time spent per category (Development, Browser, Communication, Entertainment, Productivity, System, Other).
- **Time range filter** — Today, Yesterday, Last 7 Days, Last 30 Days, All Time.
- **Category filter** — drill into a single category.
- **Refresh button** — re-fetches data from the SQLite database.

**Backend:** `src-tauri/src/intent/activity_tracker.rs` polls the active window every ~200 ms using `active-win-pos-rs`, classifies it into a category and persists sessions to SQLite via `src-tauri/src/intent/activity.rs` and `db.rs`.

---

### Diary

**File:** `views/DiaryView.tsx`

An AI-powered personal journal:

- **Date navigation** — browse any past date using chevron buttons.
- **Yesterday AI Summary** — one click generates a narrative summary of yesterday's activity using the configured AI model and saves it persistently.
- **Manual notes** — free-text notes for any date, stored in the database.
- **Edit & delete** — update or remove any entry.

**Backend:** `src-tauri/src/intent/diary.rs` handles entry CRUD and calls the query engine to generate AI summaries from raw activity data.

---

### Code (LeetCode Tracker)

**File:** `views/CodeView.tsx`

A personal LeetCode study tool:

- **Problem list** — filterable by category and difficulty; importable from `leetcode_problems.csv`.
- **Solved tracking** — toggle problems as solved with a timestamp.
- **Notes editor** — per-problem markdown notes with an inline AI assistant.
- **AI hints/explanations** — ask the AI for hints, time-complexity analysis, or pattern identification without revealing the full solution.
- **Mermaid diagrams** — AI can render algorithm diagrams inline.

**Data:** `leetcode_problems.csv` ships with the app (bundled as a Tauri resource) and `organize_leetcode.py` can regenerate/extend it.  
**Store:** `store/useCodeStore.ts` (persisted to `localStorage`), `store/useLeetCodeActivityStore.ts`.

---

### Brain (Notes)

**File:** `views/BrainView.tsx`

An Obsidian-inspired note-taking workspace with an integrated AI assistant:

- **Vault selector** — point it at any folder on disk; the file tree is read via Tauri's file-system commands.
- **File tree** (`FileNode` hierarchy) — create, rename, move, and delete files and folders.
- **Rich editor** — powered by [TipTap](https://tiptap.dev/) with Markdown input/output, task lists, images, links, bubble menu, and syntax highlighting.
- **AI chat panel** — a side panel where the AI can read the current note and perform actions: *insert content*, *create note*, *replace selection*, *find and replace*.
- **RAG (Retrieval-Augmented Generation)** — `services/brainAiService.ts` performs keyword-based local search over the vault to provide relevant context to the AI.
- **Streaming** — responses stream via a local TCP listener that Tauri's `brain_chat_stream` command writes to.
- **Model switching** — NVIDIA NIM or local LM Studio, persisted in `localStorage`.

**Service:** `services/brainAiService.ts` — contains RAG chunking, tool-call parsing, prompt building, and stream handling logic.

---

### Schedule

**File:** `views/ScheduleView.tsx`

A visual day planner:

- **Week view calendar** — navigate day-by-day; events rendered in a time-grid with overlap handling.
- **Event creation/editing** — modal (`components/schedule/EventModal.tsx`) with title, date, start time, duration, and type (focus/break/meeting/work).
- **Task list** — separate to-do list (`components/schedule/TaskModal.tsx`) with tags (Work, Health, Study, Life) and due dates.
- **Google Calendar sync** — two-way sync of events via OAuth 2.0 (`nexusAPI.google.listEvents`, `addEvent`, `updateEvent`, `deleteEvent`).
- **Google Tasks sync** — sync task list with Google Tasks (`nexusAPI.google.tasks.*`).

**Store:** `store/useScheduleStore.ts` (persisted to `localStorage`).  
**Backend:** OAuth token management and Google API proxy in `src-tauri/src/lib.rs`.

---

### Zen Mode

**File:** `views/ZenView.tsx`

A distraction-free focus environment:

- **Focus Timer** — large countdown display; click to edit time.
- **Pomodoro mode** — 25 min focus / 5 min short break / 15 min long break cycle with mode tabs.
- **Music sync** — automatically pauses music when the timer finishes (`store/useTimerStore.ts` → `store/useMusicStore.ts`).
- **Quick Focus Mixes** — picks the first three playlists from the Music store as one-tap playlist launchers.
- **Do Not Disturb toggle** — UI toggle (local state; can be connected to system DND).

**Store:** `store/useTimerStore.ts`.

---

### Music

**File:** `views/MusicView.tsx`  
**Engine:** `components/zen/MusicEngine.tsx` (global, hidden YouTube `<ReactPlayer>`)

A Spotify-inspired music player backed by YouTube:

- **Search** — YouTube video search via the Tauri backend (`nexusAPI.music.search`).
- **Playlists** — create, rename, and delete playlists; add/remove tracks; persisted to the backend.
- **Liked Songs** — like/unlike tracks; stored in the music library.
- **Recently Played** — automatically tracked.
- **Queue** — plays through a context (playlist, liked songs, search results).
- **Playback controls** — play/pause, next, previous, seek, volume, mute, shuffle, repeat.
- **Persist state** — playlists saved via `nexusAPI.music.savePlaylists` / `getPlaylists`.

**Store:** `store/useMusicStore.ts`.  
**Constants:** `lib/constants.ts` (localStorage key `musicapp_playlists`, YouTube player state codes).

---

### Settings

**File:** `views/SettingsView.tsx`

Sectioned settings panel:

| Section | Settings |
|---|---|
| **API Keys** | NVIDIA NIM, OpenAI, Anthropic, Groq — with masked input and live validation |
| **AI Model** | Default provider, default model, LM Studio base URL |
| **System** | Launch at startup, startup behavior (visible/minimised to tray), minimize/close to tray |
| **Privacy** | Toggle app tracking, screen OCR, media tracking, browser tracking |
| **Storage** | Data retention period, max storage (MB), auto-cleanup; export/import data; clear all |
| **Appearance** | Compact mode, font scale |
| **About** | App version, open-source libraries |

Settings are read from and written to the Rust backend (`nexusAPI.settings.get/save`) so they survive app restarts.  
**Store:** `store/useIntentStore.ts` (`AppSettings`).

---

### Tray Panel

**File:** `views/TrayPanelView.tsx`

A compact popup window accessible from the system tray icon:

- **Timer widget** — shows remaining time and mode; start/pause/reset controls.
- **Music widget** — current track, playlist selector, previous/next/play controls.
- **Navigation shortcuts** — jump directly to Dashboard, Chat, Calendar, Brain.
- **Incognito mode** — set a duration to pause activity tracking.
- **Game mode** — toggle optimisation mode.
- **Refresh AI** — trigger a dashboard AI refresh.
- **Quit** — gracefully exit the app.

Communication between the main window and tray panel uses Tauri's `emitTo` / `listen` event system.

---

## Frontend Architecture

### Components

| Path | Description |
|---|---|
| `components/layout/AppLayout.tsx` | Outer wrapper that renders the `Sidebar` and a `<main>` content area with a dark background |
| `components/layout/Sidebar.tsx` | Fixed left icon sidebar; each icon navigates to a tab via `useNavStore` |
| `components/GlobalWidgets.tsx` | Renders `<MusicEngine />` once at the app root so the player is always alive |
| `components/zen/MusicEngine.tsx` | Hidden `react-youtube` player that drives all music playback |
| `components/MermaidBlock.tsx` | Lazily renders Mermaid diagram source into SVG using `mermaid.render()` |
| `components/DynamicIsland.tsx` | macOS-style floating notification pill for in-app alerts |
| `components/ui/Card.tsx` | Simple styled card wrapper |

### Stores (Zustand)

| Store | Persisted | Key State |
|---|---|---|
| `useNavStore` | No | `activeTab` — current sidebar selection |
| `useIntentStore` | No | `settings`, `activities`, `chatSessions`, `diaryEntries` |
| `useMusicStore` | Via backend | `playlists`, `currentTrack`, `isPlaying`, `volume`, `likedSongs` |
| `useTimerStore` | No | `timeLeft`, `isActive`, `isPomodoroEnabled`, `mode` |
| `useScheduleStore` | `localStorage` | `tasks`, `events`, `isGoogleConnected` |
| `useCodeStore` | `localStorage` | `problems`, `activeProblemId` |
| `useLeetCodeActivityStore` | `localStorage` | LeetCode session activity |

### Services

| File | Description |
|---|---|
| `services/chatService.ts` | Thin wrapper around `window.nexusAPI.intent.*` for chat CRUD and model listing |
| `services/brainAiService.ts` | Full RAG + tool-call pipeline for the Brain notes AI assistant; handles prompt construction, local tool execution (insert, replace, create), and stream parsing |

### Hooks

| File | Description |
|---|---|
| `hooks/useFavoriteModels.ts` | Reads/writes a list of recently-used model IDs to `localStorage` |
| `hooks/usePlaylistLoader.ts` | On mount, loads playlists and library from `nexusAPI.music.*` into `useMusicStore` |
| `hooks/useSettings.ts` | Loads settings from `nexusAPI.settings.get()` into `useIntentStore` |

### Lib

| File | Description |
|---|---|
| `lib/chatTypes.ts` | TypeScript interfaces: `ChatSession`, `ChatMessage` |
| `lib/chatUtils.ts` | Utility functions for formatting/processing chat messages |
| `lib/constants.ts` | `LS_PLAYLISTS` localStorage key, YouTube `PLAYER_STATE` enum |

---

## Backend Architecture (Rust / Tauri)

### Intent Modules

Located in `src-tauri/src/intent/`:

| Module | Description |
|---|---|
| `db.rs` | Opens SQLite connection with WAL mode; creates all tables on first run (categories, activities, chat_sessions, messages, diary_entries, dashboard_items, settings) |
| `activity.rs` | Tauri commands `get_activities` and `get_activity_stats` — query activity data from SQLite with time-range filtering |
| `activity_tracker.rs` | Background async task: polls the active window every ~200 ms using `active-win-pos-rs`, debounces short visits, classifies by app name/window title, and writes `ActivityEvent` records to SQLite |
| `chat.rs` | Commands for session/message CRUD; proxies AI requests to NVIDIA NIM, OpenAI, Anthropic, or Groq; handles streaming via Server-Sent Events |
| `dashboard.rs` | Commands for `dashboard_get_overview`, `dashboard_refresh_overview`, project/deadline CRUD, and `dashboard_summarize_item` |
| `diary.rs` | CRUD for diary entries; `diary_generate_entry` builds a prompt from yesterday's activity and calls the AI |
| `file_monitor.rs` | Watches the Notes vault directory for file changes using `walkdir`; emits Tauri events to the frontend |
| `screen_capture.rs` | Uses Windows OCR (`windows::Media::Ocr`) to extract text from screen regions (used when `trackScreenOcr` is enabled) |
| `settings.rs` | `settings_get/save`, `settings_validate_api_key`, `settings_get_nvidia_models`, `settings_get_lmstudio_models`, `brain_chat_stream` (streams AI to a local TCP port), `settings_nvidia_chat_completion`, `settings_lmstudio_chat_completion` |
| `storage.rs` | `storage_get_stats`, `storage_clear_all`, `storage_export_data`, `storage_import_data` |
| `windows_utils.rs` | Windows-specific helpers: process path resolution, media session metadata (Now Playing info) |

### Models

| File | Description |
|---|---|
| `models/settings.rs` | `AppSettings` Rust struct with `serde` derives; matches the TypeScript `AppSettings` type |

### Services

| File | Description |
|---|---|
| `services/query_engine.rs` | Assembles AI prompts by fetching relevant activity records, formatting them as context, and invoking the selected AI provider |

### Utils

| File | Description |
|---|---|
| `utils/config.rs` | Returns the platform-appropriate path for the config/data directory |

---

## Tauri API Bridge (`tauri-api.ts`)

`tauri-api.ts` defines and exposes `window.nexusAPI` — a typed facade that maps every frontend action to a `tauri::invoke()` call. It is initialised once at startup in `index.tsx` and is checked by all views before making calls (falling back gracefully when running in a browser without Tauri).

Namespaces exposed on `window.nexusAPI`:

| Namespace | Commands |
|---|---|
| `notes` | `selectVault`, `getFileTree`, `readFile`, `writeFile`, `createFile`, `createFolder`, `delete`, `rename`, `moveFile`, `ensureDir` |
| `leetcode` | `readCsv` |
| `browser` | `openInApp`, `createChild`, `updateChildBounds`, `closeChild` |
| `app` | `minimizeToTray`, `showWindow`, `showWindowPage`, `quit`, `getIncognitoStatus`, `toggleIncognito`, `setIncognitoFor`, `getGameMode`, `toggleGameMode`, `refreshAi`, `clearNotifications`, `musicControl`, `musicSelectPlaylist`, `timerControl`, `toggleTrayPanel` |
| `google` | `checkAuth`, `signIn`, `signOut`, `listEvents`, `addEvent`, `updateEvent`, `deleteEvent`, `tasks.*` |
| `music` | `search`, `getPlaylists`, `savePlaylists`, `getLibrary`, `saveLibrary` |
| `intent` | `getActivityStats`, `getActivities`, `getChatSessions`, `createChatSession`, `deleteChatSession`, `getChatMessages`, `sendChatMessage`, `startActivityTracker`, `getDashboardOverview`, `refreshDashboardOverview`, `summarizeDashboardItem`, `upsertDashboardDeadline/Project`, `deleteDashboardDeadline/Project` |
| `diary` | `getEntries`, `saveEntry`, `deleteEntry`, `generateEntry` |
| `settings` | `get`, `save`, `validateApiKey`, `getNvidiaModels`, `getLMStudioModels`, `nvidiaChatCompletion`, `lmstudioChatCompletion`, `brainChatStream` |
| `storage` | `getStats`, `clearAll`, `exportData`, `importData` |

---

## Data & Privacy

All data is stored **locally** in an SQLite database inside the OS app-data directory (e.g. `%APPDATA%\com.nexus.os\` on Windows). Nothing is sent to any third-party server except:

- Your configured AI provider (when you explicitly send a chat message or trigger an AI action).
- Google Calendar / Tasks (only when you connect your Google account).

**Incognito mode** (`app_toggle_incognito`) temporarily pauses all activity tracking without restarting the app.

---

## Supported AI Providers

| Provider | Model examples | How to configure |
|---|---|---|
| **NVIDIA NIM** | `meta/llama-3.3-70b-instruct`, `moonshotai/kimi-k2.5`, any NIM model | Settings → API Keys → NVIDIA API Key |
| **OpenAI** | `gpt-4o`, `gpt-4-turbo`, etc. | Settings → API Keys → OpenAI API Key |
| **Anthropic** | `claude-3-5-sonnet`, etc. | Settings → API Keys → Anthropic API Key |
| **Groq** | `llama3-70b-8192`, etc. | Settings → API Keys → Groq API Key |
| **LM Studio** | Any locally running model | Settings → AI Model → LM Studio URL |

The default model is **`moonshotai/kimi-k2.5`** via NVIDIA NIM.

---

## Google Integration

To enable Google Calendar and Tasks sync:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Calendar API** and **Google Tasks API**.
3. Create **OAuth 2.0 credentials** (Desktop app type).
4. Copy the **Client ID** and **Client Secret** into `.env` (or into Settings inside the app).
5. In the Schedule view, click **Connect Google** — a browser OAuth flow will open.

The backend handles the OAuth callback on a local TCP listener and stores tokens in the app-data directory.

---

## Python Utilities

| File | Description |
|---|---|
| `organize_leetcode.py` | Reads `leetcode_problems.csv`, enriches problem entries with categories and techniques, and writes the result back. Run with `python organize_leetcode.py`. |
| `setup.py` | General project setup helper. |

---

## Contributing

1. Fork the repository and create a feature branch.
2. Run `npm run tauri:dev` to confirm your environment works.
3. Make your changes following the existing code style (TypeScript strict mode, Tailwind utility classes, Zustand for state).
4. Submit a pull request with a clear description of what changed and why.

---

## License

This project is currently **private / unlicensed**. All rights reserved by the author.
