import React, { useState } from 'react';
import {
  Play,
  Pause,
  Square,
  StepForward,
  Terminal,
  Settings,
  ChevronDown,
  ChevronUp,
  Cpu,
  Sparkles,
  RefreshCw,
  Eye,
  EyeOff,
  Code2,
  CheckCircle2,
  AlertCircle,
  Crosshair,
  Puzzle,
} from 'lucide-react';
import { AgentMood } from '../types';

interface AgentHudProps {
  isRunning: boolean;
  isPaused: boolean;
  mood: AgentMood;
  statusText: string;
  stepCount: number;
  maxSteps: number;
  activeElementId: number | null;
  activeElementText?: string;
  goal: string;
  onGoalChange: (goal: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onStepOnce: () => void;
  onRescan: () => void;
  badgesEnabled: boolean;
  onToggleBadges: () => void;
  onOpenConsole: () => void;
  onOpenSettings: () => void;
  onOpenScriptExport: () => void;
  inspectMode?: boolean;
  onToggleInspectMode?: () => void;
  provider: string;
  model: string;
}

export const AgentHud: React.FC<AgentHudProps> = ({
  isRunning,
  isPaused,
  mood,
  statusText,
  stepCount,
  maxSteps,
  activeElementId,
  activeElementText,
  goal,
  onGoalChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onStepOnce,
  onRescan,
  badgesEnabled,
  onToggleBadges,
  onOpenConsole,
  onOpenSettings,
  onOpenScriptExport,
  inspectMode = false,
  onToggleInspectMode,
  provider,
  model,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [dockPosition, setDockPosition] = useState<'center' | 'corner'>('center');

  // Mood color and badge styling
  const getMoodConfig = () => {
    switch (mood) {
      case 'scanning':
        return { color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/40', label: 'SCANNING DOM' };
      case 'reasoning':
        return { color: 'text-purple-400', bg: 'bg-purple-500/20 border-purple-500/40', label: 'AI REASONING' };
      case 'acting':
        return { color: 'text-cyan-400', bg: 'bg-cyan-500/20 border-cyan-500/40', label: 'EXECUTING ACTION' };
      case 'verifying':
        return { color: 'text-teal-400', bg: 'bg-teal-500/20 border-teal-500/40', label: 'VERIFYING STATE' };
      case 'success':
        return { color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/40', label: 'GOAL COMPLETED' };
      case 'error':
        return { color: 'text-rose-400', bg: 'bg-rose-500/20 border-rose-500/40', label: 'ERROR HALTED' };
      case 'paused':
        return { color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/40', label: 'PAUSED' };
      default:
        return { color: 'text-slate-400', bg: 'bg-slate-800/60 border-slate-700/60', label: 'READY' };
    }
  };

  const moodConfig = getMoodConfig();

  if (isMinimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 bg-slate-900/95 backdrop-blur-xl border border-cyan-500/60 rounded-full px-4 py-2.5 shadow-2xl shadow-cyan-950/60 transition-all duration-200 cursor-pointer hover:border-cyan-400"
           onClick={() => setIsMinimized(false)}>
        <div className={`w-3 h-3 rounded-full ${mood === 'idle' ? 'bg-cyan-500' : 'bg-cyan-400 animate-ping'}`} />
        <span className="text-xs font-bold text-white tracking-wide">Apex Kilo</span>
        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${moodConfig.bg} ${moodConfig.color}`}>
          {moodConfig.label}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(false);
          }}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white"
          title="Expand HUD"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const dockClass = dockPosition === 'center'
    ? 'bottom-4 left-1/2 -translate-x-1/2 w-11/12 max-w-4xl'
    : 'bottom-4 right-4 w-full max-w-lg';

  return (
    <div className={`fixed z-50 ${dockClass} bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/90 transition-all duration-200 overflow-hidden ring-1 ring-slate-800`}>
      {/* HUD Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/70 border-b border-slate-800/80 text-xs select-none">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-bold tracking-tight text-white">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />
            <span>APEX KILO</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-cyan-950 text-cyan-300 border border-cyan-800/50 rounded font-mono">
              In-Page HUD
            </span>
          </div>

          <div className="h-3.5 w-px bg-slate-800 hidden sm:block" />

          {/* Provider badge */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400">
            <Cpu className="w-3 h-3 text-cyan-400" />
            <span className="capitalize">{provider}</span>
            <span className="text-slate-600">/</span>
            <span className="font-mono text-[10px] text-slate-300">{model}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Active Target Indicator */}
          {activeElementId !== null && (
            <div className="flex items-center gap-1 text-[11px] font-mono bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 px-2 py-0.5 rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Target: #{activeElementId}</span>
              {activeElementText && (
                <span className="max-w-[100px] truncate text-emerald-200/70 hidden md:inline">
                  ("{activeElementText}")
                </span>
              )}
            </div>
          )}

          {/* Step Counter */}
          <div className="text-[11px] font-mono text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60">
            Step {stepCount}/{maxSteps}
          </div>

          {/* Mood status pill */}
          <div className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${moodConfig.bg} ${moodConfig.color}`}>
            {moodConfig.label}
          </div>

          <button
            onClick={() => setDockPosition(dockPosition === 'center' ? 'corner' : 'center')}
            className="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors hidden sm:block"
            title="Toggle dock position"
          >
            {dockPosition === 'center' ? 'Dock Right' : 'Dock Center'}
          </button>

          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors ml-1"
            title="Minimize HUD"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main HUD Body */}
      <div className="p-3 space-y-2.5">
        {/* Goal Input & Primary Control Row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={goal}
              disabled={isRunning && !isPaused}
              onChange={(e) => onGoalChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isRunning) {
                  onStart();
                }
              }}
              placeholder="Enter goal (e.g. 'Search flights to Tokyo and book first flight')..."
              className="w-full bg-slate-950/90 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 outline-none transition-all disabled:opacity-60"
            />
            {goal && !isRunning && (
              <button
                onClick={() => onGoalChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            )}
          </div>

          {/* Start / Pause / Resume / Stop Button Group */}
          {!isRunning ? (
            <button
              onClick={onStart}
              disabled={!goal.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-cyan-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Launch</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {isPaused ? (
                <button
                  onClick={onResume}
                  className="flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md transition-all"
                  title="Resume Run"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={onPause}
                  className="flex items-center gap-1 px-3 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 rounded-xl text-xs font-semibold transition-all"
                  title="Pause Agent"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
              )}
              <button
                onClick={onStop}
                className="flex items-center gap-1 px-3 py-2 bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 rounded-xl text-xs font-semibold transition-all"
                title="Stop Agent"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          )}
        </div>

        {/* Status Text & Secondary Toolbar Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          {/* Status Reasoning Text */}
          <div className="flex items-center gap-2 text-xs text-slate-300 truncate max-w-xl">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
            <span className="font-mono text-[11px] text-slate-400 truncate">{statusText}</span>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-1 flex-wrap">
            {/* Step Once */}
            <button
              onClick={onStepOnce}
              disabled={isRunning && !isPaused}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700/60 disabled:opacity-40"
              title="Execute a single reasoning step"
            >
              <StepForward className="w-3 h-3 text-cyan-400" />
              <span>Step</span>
            </button>

            {/* Rescan DOM */}
            <button
              onClick={onRescan}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors border border-slate-700/60"
              title="Rescan interactive elements"
            >
              <RefreshCw className="w-3 h-3 text-cyan-400" />
              <span className="hidden md:inline">Rescan</span>
            </button>

            {/* Crosshair Inspect Toggle */}
            {onToggleInspectMode && (
              <button
                onClick={onToggleInspectMode}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  inspectMode
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/60'
                }`}
                title="Inspect in-page DOM elements"
              >
                <Crosshair className="w-3 h-3" />
                <span>Inspect</span>
              </button>
            )}

            {/* Badges Toggle */}
            <button
              onClick={onToggleBadges}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                badgesEnabled
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-700/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700/60'
              }`}
              title="Toggle numbered badges"
            >
              {badgesEnabled ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3 text-slate-400" />}
              <span className="hidden md:inline">Badges</span>
            </button>

            {/* Console */}
            <button
              onClick={onOpenConsole}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700/60"
              title="Open Live Debug Console"
            >
              <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            </button>

            {/* Extension Hub */}
            <button
              onClick={onOpenScriptExport}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700/60"
              title="Get Extension or Userscript"
            >
              <Puzzle className="w-3.5 h-3.5 text-cyan-400" />
            </button>

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700/60"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
