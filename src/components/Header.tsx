import React, { useState, useEffect } from 'react';
import {
  Bot,
  Terminal,
  Settings,
  Puzzle,
  ExternalLink,
  Layers,
  Sparkles,
  Wifi,
  Download,
  CheckCircle2,
} from 'lucide-react';

interface HeaderProps {
  elementCount: number;
  onOpenConsole: () => void;
  onOpenSettings: () => void;
  onOpenExtensionHub: () => void;
  logCount: number;
  provider: string;
}

export const Header: React.FC<HeaderProps> = ({
  elementCount,
  onOpenConsole,
  onOpenSettings,
  onOpenExtensionHub,
  logCount,
  provider,
}) => {
  const [backendLatency, setBackendLatency] = useState<number | null>(null);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'fallback'>('checking');

  useEffect(() => {
    fetch('/api/opencode/status')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.ok) {
          setBackendLatency(data.latencyMs);
          setBackendStatus('online');
        } else {
          setBackendStatus('fallback');
        }
      })
      .catch(() => {
        setBackendStatus('fallback');
      });
  }, []);

  return (
    <header className="w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-2.5 flex items-center justify-between z-20">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-sky-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-950/60 ring-1 ring-cyan-400/30">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-extrabold text-white tracking-tight">
              Apex Kilo Autonomous Agent
            </h1>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 rounded">
              v8.15
            </span>
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 bg-blue-950/80 text-blue-300 border border-blue-800/40 rounded-full">
              Browser Extension
            </span>
          </div>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            In-Browser DOM Scanning • Numbered Target Badges • Autonomous LLM Action Planning
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Backend Connectivity Status Pill */}
        <div
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono"
          title="OpenCode AI VIP Connection Status"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              backendStatus === 'online'
                ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                : backendStatus === 'checking'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-blue-400'
            }`}
          />
          <span className="text-slate-300 text-[11px]">
            {backendStatus === 'online'
              ? `OpenCode VIP (${backendLatency}ms)`
              : backendStatus === 'checking'
                ? 'Checking...'
                : 'Server Gemini'}
          </span>
        </div>

        {/* Scanned Element Counter */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-cyan-300 font-bold">{elementCount}</span>
          <span className="text-slate-400 hidden sm:inline">Nodes</span>
        </div>

        {/* Live Console Button */}
        <button
          onClick={onOpenConsole}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors border border-slate-700/60"
          title="Open Live Debug Console"
        >
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Console</span>
          {logCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-950 text-slate-300 rounded-full">
              {logCount}
            </span>
          )}
        </button>

        {/* Extension Hub / Download Button */}
        <button
          onClick={onOpenExtensionHub}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-950 via-sky-950 to-slate-900 hover:border-cyan-400 border border-cyan-700/60 text-cyan-200 rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-950/40"
          title="Download Chrome Extension ZIP or Userscript"
        >
          <Puzzle className="w-3.5 h-3.5 text-cyan-400" />
          <span>Get Extension</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs transition-colors border border-slate-700/60"
          title="Agent Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* GitHub Source Link */}
        <a
          href="https://github.com/chicanoandres702/apex-kilo-agent"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors hidden sm:block"
          title="Original GitHub Repository"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </header>
  );
};
