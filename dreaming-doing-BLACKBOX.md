# Dream Doing (FORGE) - Project Documentation

## Overview

Dream Doing (also known as FORGE) is an AI-powered web application builder platform called "Dream Weaver". It allows users to describe their web application ideas in natural language, and the AI agent generates the complete code, configures the technology stack, and deploys the application - all in one place.

The platform features an intelligent agent loop with self-correction capabilities, streaming Server-Sent Events (SSE) for real-time feedback, and integration with multiple LLM providers through a model-agnostic adapter system.

## Project Information

- **URL**: Not explicitly provided in context (appears to be a local development project)
- **Project Type**: Web Application (AI-powered Web App Builder / Low-code Platform)
- **Last Updated**: Based on file timestamps, actively maintained (June 2026)
- **Primary Purpose**: AI-driven web application generation and deployment platform

## Technology Stack

### Frontend Framework
- **Vite** - Build tool and development server
- **React 19** - UI library
- **TypeScript 5.8** - Typed JavaScript superset
- **TanStack Start** - Full-stack React framework (includes routing, server functions, etc.)
- **TanStack Router** - Type-safe routing
- **TanStack Query** - Data fetching and state management

### UI & Styling
- **Tailwind CSS 4** - Utility-first CSS framework
- **Radix UI** - Accessible UI primitives
- **Framer Motion** - Animation library
- **Three.js** - 3D graphics for the SpaceScene background
- **@react-three/fiber** & **@react-three/drei** - React wrappers for Three.js
- **Lenis** - Smooth scrolling library
- **shadcn-ui** - UI component library (via components.json)
- **Lucide Icons** - Icon set
- **Sonner** - Toast notifications
- **Vaul** - Drawer component
- **Cmdk** - Command palette
- **Class Variance Authority** - CSS variance utility
- **Clsx & Tailwind Merge** - Class name utilities

### State Management & Forms
- **TanStack React Query** - Server state management
- **React Hook Form** - Form handling
- **Zod** - Schema validation
- **@hookform/resolvers** - Zod integration with React Hook Form

### Backend & Infrastructure
- **Supabase** - Database, Authentication, Storage, and Edge Functions
- **E2B (Embedded 2B)** - Isolated code execution sandbox (for agent tool execution)
- **Cloudflare Pages** - Deployment target (via Wrangler)
- **Vite Plugin Cloudflare** - Cloudflare Pages integration

### Development & Tooling
- **Bun** - JavaScript runtime/package manager (bun.lock, bunfig.toml present)
- **ESLint** - Linting
- **Prettier** - Code formatting
- **TypeScript** - Type checking
- **Vitest** - Testing framework (implied by devDependencies)
- **Wrangler** - Cloudflare Pages CLI

### AI/ML Components
- **Model-agnostic LLM Adapter System** - Supports multiple providers:
  - Claude (Anthropic)
  - OpenAI (GPT-4o, etc.)
  - Gemini (Google)
  - OpenRouter (unified API)
  - Ollama (local models)
- **Agent Loop System** - 4-phase intelligent execution with self-correction
- **Tool Registry** - Dynamic tool execution system
- **Sandbox Provider** - E2B + Noop fallback for code execution

### File Structure & Organization
```
src/
├── assets/                 # Static assets (images, etc.)
├── components/             # React components
│   ├── landing/            # Landing page components
│   ├── prompt/             # Prompt engine components
│   ├── space/              # 3D space background
│   └── ui/                 # shadcn-ui components
├── hooks/                  # Custom React hooks
├── integrations/           # Third-party service integrations
│   └── supabase/           # Supabase client and types
├── lib/                    # Utility functions and contexts
├── routes/                 # TanStack Router file-based routes
├── server.ts               # Cloudflare Pages server entry
├── start.ts                # TanStack Start initialization
├── router.tsx              # Router configuration
├── routeTree.gen.ts        # Generated route types
├── styles.css              # Global CSS/Tailwind base
supabase/
├── functions/              # Supabase Edge Functions
│   └── agent-run/          # Core agent implementation
│       ├── adapters/       # LLM provider adapters
│       ├── tools/          # Filesystem and shell tools
│       ├── index.ts        # Edge function entry point
│       ├── loop.ts         # Agent loop logic
│       ├── prompts.ts      # System prompts for agent phases
│       ├── registry.ts     # Tool registry
│       ├── sandbox.ts      # E2B sandbox provider
│       └── types.ts        # Shared TypeScript types
├── migrations/             # Database schema migrations
└── config.toml             # Supabase local development config
```

## Key Features

### 1. AI Agent System (Dream Weaver)
- **Model-agnostic architecture** - Supports multiple LLM providers through adapters
- **4-phase execution loop**:
  1. **Gather Context** - Reads project files, configs, and structure
  2. **Analyze Intent** - Classifies user request (new project, feature, bug, dependency)
  3. **Execute** - Tool-calling loop with auto-correction (max 3 build attempts)
  4. **Summarize** - Provides final response in Portuguese
- **Streaming SSE** - Real-time communication of agent progress to frontend
- **Auto-correction** - Automatically retries failed builds by feeding errors back to the LLM
- **Atomic commits** - Automatically git commits after each successful file change

### 2. Tool System (8 Tools)
- **fs_read** - Read single file content
- **fs_write** - Create/overwrite file (complete content)
- **fs_delete** - Delete file permanently
- **fs_list** - List files with glob pattern support
- **fs_search** - Grep-like text search in files
- **fs_edit** - Surgical text replacement (preferred over fs_write for small changes)
- **fs_read_many** - Batch file reading with glob patterns
- **shell_exec** - Execute any shell command (git, npm, build, etc.)

### 3. Project Management
- **Project creation from prompts** - Natural language to full web app
- **Project persistence** - Supabase-backed project storage
- **Version control integration** - Automatic git commits
- **Multi-project support** - Users can have multiple projects
- **Real-time collaboration** - Realtime database subscriptions for files and messages

### 4. User Interface
- **Cinematic 3D SpaceScene** - Photorealistic deep-space background with nebula, stars, moon, sun glow, and comets
- **Custom cursor system** - Interactive dot and ring cursor with hover effects
- **Prompt Engine** - Advanced textarea with model selection, quick starts, and warp effects
- **Editor Shell** - Split-screen interface with chat, preview, and code views
- **Marketing Shell** - Consistent layout for authenticated pages (projects, settings, connectors)
- **Navigation HUD** - Altitude, velocity, and temperature telemetry display
- **Theme system** - Dark/light mode with persistent storage
- **Scramble link animations** - Text scrambling effect on hover
- **Grain overlay and vignette** - Cinematic visual effects
- **Responsive design** - Mobile-friendly layouts

### 5. Authentication & Authorization
- **Supabase Auth** - Email/password and OAuth (Google) authentication
- **Protected routes** - Middleware for auth protection
- **Session management** - Client-side token handling
- **User profiles** - Extended user information storage

### 6. Deployment & Infrastructure
- **Cloudflare Pages integration** - Edge-optimized deployment
- **Supabase as backend** - Managed PostgreSQL, Auth, Storage
- **E2B sandbox** - Secure code execution for agent tools
- **Environment variable management** - Configurable LLM providers and API keys
- **Realtime subscriptions** - Live updates for collaborative editing

### 7. Technical Implementation Details

#### Agent Loop Intelligence
- **Context gathering** - Reads key configuration files (package.json, tsconfig.json, etc.)
- **Intent analysis** - Classifies requests into types: new_project, modify, fix, add_dep, other
- **Self-correction loop** - Retries failed builds up to 3 times with error feedback
- **Tool execution registry** - Centralized tool definition and execution
- **Sandbox abstraction** - E2B with noop fallback for development

#### File System Operations
- **Atomic file writes** - Upsert operations with conflict resolution
- **Glob pattern matching** - Efficient file listing and filtering
- **Content truncation** - Large files truncated for efficiency (>10KB)
- **Surgical edits** - fs_edit preferred for minimal changes
- **Batch operations** - fs_read_many for efficient multi-file reading

#### Shell Execution
- **Sandbox synchronization** - Files synced before command execution
- **Timeout management** - Configurable command timeouts
- **Output capture** - Stdout/stderr capture with size limits
- **Exit code handling** - Success/failure determination

#### LLM Adapter System
- **Provider abstraction** - Unified interface for different LLM APIs
- **Tool calling support** - Standardized tool definition formats
- **Streaming and non-streaming modes** - Flexible response handling
- **Error handling** - Provider-specific error normalization
- **Configuration via env vars** - LLM_PROVIDER, LLM_API_KEY, LLM_MODEL, LLM_BASE_URL

#### Database Schema
- **Projects table** - Owned by users, with name, slug, description, template
- **Conversations table** - Linked to projects, stores chat history
- **Messages table** - Stores chat messages with tool calls and parts
- **Project files table** - Stores file content with project_id/path uniqueness
- **Agent plans & checkpoints** - Persistence for agent loop state
- **Connectors table** - Encrypted tokens for third-party services
- **Deployments table** - Deployment tracking and status
- **RLS policies** - Row-level security for data isolation
- **Realtime publication** - Live updates for messages and files

#### Frontend Architecture
- **TanStack Start** - Full-stack framework with server functions and API routes
- **File-based routing** - Automatic route generation from file structure
- **Server functions** - Type-safe RPCs between client and server
- **Middleware system** - Authentication and error handling middleware
- **Query client** - React Query for data fetching and caching
- **Realtime updates** - Supabase subscriptions for live data
- **Optimistic updates** - Immediate UI feedback before server confirmation

#### Build & Deployment
- **Vite configuration** - Optimized for Cloudflare Pages
- **TypeScript paths** - Path aliases (@/components, /lib, etc.)
- **Environment variable injection** - VITE_* variables for client-side
- **Build scripts** - dev, build, preview, lint, format commands
- **Wrangler integration** - Cloudflare Pages deployment configuration

## Environment Configuration

Expected environment variables (from .env.example patterns):

### Supabase
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### LLM Providers (at least one required)
```
LLM_PROVIDER=claude|openai|gemini|openrouter|ollama
LLM_API_KEY=your-api-key-here
LLM_MODEL=claude-sonnet-4-20250514|gpt-4o|gemini-2.5-flash|etc.
LLM_BASE_URL= # optional (for custom endpoints or Ollama)
```

### Optional Services
```
E2B_API_KEY= # for actual sandbox (without it, uses noop mode)
```

## Available Scripts

From package.json:
- `bun dev` - Start development server with Vite
- `bun build` - Build for production (Cloudflare Pages)
- `bun build:dev` - Build for development preview
- `bun preview` - Preview production build locally
- `bun lint` - Run ESLint for code quality
- `bun format` - Format code with Prettier

## Development Workflow

### Local Development
1. Install dependencies: `bun install`
2. Start development server: `bun dev`
3. The application will be available at http://localhost:5173 (default Vite port)

### Environment Setup
1. Copy `.env.example` to `.env` and fill in required values
2. Ensure Supabase project is set up with the required schema
3. Configure at least one LLM provider API key
4. (Optional) Set up E2B API key for actual sandbox execution

### Database Setup
1. Run Supabase migrations to create required tables:
   - profiles, user_roles, projects, project_files, project_snapshots
   - conversations, messages, connectors, mcp_servers, deployments
   - agent_plans, agent_checkpoints (for agent loop persistence)
2. Enable Realtime for messages and project_files tables
3. Set up Row Level Security policies

### Building for Production
1. Run `bun build` to create production build
2. Deploy to Cloudflare Pages using Wrangler or connect Git repository
3. Ensure environment variables are set in the deployment platform

## Important Notes

### File Paths
- All file paths in this document are relative to the project root
- Absolute path example: `/home/rdarienzo/Projetos/dreaming-doing/src/routes/index.tsx`
- When referencing files, use the exact absolute path format

### Dependencies
- The project uses Bun as the package manager (bun.lock present)
- Node.js compatibility is maintained for broader tool support
- TypeScript 5.8+ is required for latest features
- Tailwind CSS 4 uses the new Vite plugin architecture

### Browser Support
- Modern browsers that support ES modules, CSS custom properties, and modern JavaScript
- Tested in Chrome, Firefox, Safari, and Edge
- Mobile-responsive design for smartphones and tablets

### Security Considerations
- Supabase Row Level Security protects user data
- Environment variables should never be committed to version control
- E2B sandbox provides isolation for code execution (when configured)
- SQL injection prevention through parameterized queries
- XSS protection through proper escaping in templates
- CSRF protection through Supabase auth tokens

### Performance Optimizations
- Code splitting through Vite and TanStack Start
- Lazy loading of routes and components
- Efficient file reading with fs_read_many tool
- Content truncation for large files in agent context
- Debounced and throttled event handlers
- CSS containment and will-change properties for animations
- Image optimization through asset compression

### Maintenance Considerations
- Regular updates to dependencies via bun update
- Monitoring of Supabase usage and performance
- Backup strategy for Supabase projects
- Keeping LLM adapter implementations up-to-date with provider API changes
- Periodic cleanup of old sandbox instances
- Watch for breaking changes in TanStack Start/Vite updates

## Architecture Summary

**2026-06 validation note (from plan execution):** The three recurring vibe-coding breaks were addressed with architecturally robust changes:
- E2B preview creation: list-first + circuit breaker in meta (cooldown + attempts) + FE backoff/isCircuit. No more infinite creation errors/retries.
- Autonomy after questions: qualify early-returns now also mark awaiting in run meta; start guards queue on awaiting/running; worker only drains on clean !canceled ok.
- Stop: pre-checks in run-job/worker, extra isCanceled after tools in loop, **critical** removal of drain on canceled (was auto-starting next), cancel also clears pendings. FE running sync now reacts to .canceled + awaiting in progress. UI should no longer stay "working".

See the approved plan at the session plan.md for full rationale, files changed, and verification steps. These changes were made after reading code, greps, and Supabase CLI attempts (db query hit pooler circuit; functions list confirmed active services).

The Dream Doing (FORGE) platform implements a sophisticated AI-powered web application builder with:

1. **Intelligent Agent Core** - A self-correcting, tool-using LLM agent that can read, write, edit, and execute commands to build applications
2. **Full-stack Framework** - Built on TanStack Start with React 19, TypeScript, and modern tooling
3. **Realtime Collaboration** - Live updates through Supabase subscriptions
4. **Cinematic UI** - Immersive 3D space-themed interface with custom cursor and effects
5. **Flexible Deployment** - Cloudflare Pages integration for global edge distribution
6. **Extensible Architecture** - Model-agnostic LLM adapters and pluggable tool system

The platform represents a cutting-edge implementation of AI-assisted software development, combining natural language processing, automated code generation, and deployment automation in a cohesive user experience.