import React, { useState } from 'react';
import {
  Lock,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  Puzzle,
  Laptop,
  Smartphone,
  Maximize2,
  Crosshair,
  ExternalLink,
  CheckCircle2,
  Layers,
  Sparkles,
} from 'lucide-react';

interface BrowserExtensionFrameProps {
  children: React.ReactNode;
  elementCount: number;
  onRescan: () => void;
  inspectMode: boolean;
  onToggleInspectMode: () => void;
  onOpenExtensionHub: () => void;
  activeScenarioTitle: string;
  onSelectScenario: (id: string) => void;
  currentScenarioId: string;
  scenarios: Array<{ id: string; title: string; category: string }>;
}

export const BrowserExtensionFrame: React.FC<BrowserExtensionFrameProps> = ({
  children,
  elementCount,
  onRescan,
  inspectMode,
  onToggleInspectMode,
  onOpenExtensionHub,
  activeScenarioTitle,
  onSelectScenario,
  currentScenarioId,
  scenarios,
}) => {
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'popup'>('desktop');
  const [isRotating, setIsRotating] = useState(false);
  const [showPopupPreview, setShowPopupPreview] = useState(false);

  const handleRefresh = () => {
    setIsRotating(true);
    onRescan();
    setTimeout(() => setIsRotating(false), 600);
  };

  const getViewportMaxWidth = () => {
    switch (viewportMode) {
      case 'popup':
        return 'max-w-[420px]';
      case 'tablet':
        return 'max-w-3xl';
      case 'desktop':
      default:
        return 'max-w-7xl';
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center px-4 py-3 min-h-0">
      {/* Outer Browser Window Frame */}
      <div
        className={`w-full ${getViewportMaxWidth()} flex-1 flex flex-col bg-slate-950 border border-slate-800/90 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden transition-all duration-300 relative`}
      >
        {/* Window Chrome Title Bar with Tabs */}
        <div className="bg-slate-900/95 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between select-none">
          {/* Mac OS Window Controls */}
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600/40" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600/40" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/40" />

            {/* Scenario Tabs in Browser */}
            <div className="flex items-center gap-1 ml-4 overflow-x-auto no-scrollbar py-0.5">
              {scenarios.map((s) => {
                const isActive = s.id === currentScenarioId;
                return (
                  <button
                    key={s.id}
                    onClick={() => onSelectScenario(s.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? 'bg-slate-800 text-cyan-300 border border-slate-700/80 shadow-inner'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="truncate max-w-[120px]">{s.title}</span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Viewport & Inspection Controls */}
          <div className="flex items-center gap-1.5">
            {/* Crosshair Inspect Element Toggle */}
            <button
              onClick={onToggleInspectMode}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                inspectMode
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
              }`}
              title="Toggle DOM Element Inspector crosshair"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Inspect</span>
            </button>

            {/* Viewport size toggles */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-slate-400">
              <button
                onClick={() => setViewportMode('desktop')}
                className={`p-1 rounded ${viewportMode === 'desktop' ? 'bg-slate-800 text-cyan-300' : 'hover:text-white'}`}
                title="Desktop View (Full)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewportMode('tablet')}
                className={`p-1 rounded ${viewportMode === 'tablet' ? 'bg-slate-800 text-cyan-300' : 'hover:text-white'}`}
                title="Tablet View (768px)"
              >
                <Laptop className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewportMode('popup')}
                className={`p-1 rounded ${viewportMode === 'popup' ? 'bg-slate-800 text-cyan-300' : 'hover:text-white'}`}
                title="Extension Popup View (400px)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Browser Omnibox / URL Bar & Extension Toolbar */}
        <div className="bg-slate-950/90 px-4 py-2 border-b border-slate-800/80 flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 text-slate-500">
            <button
              onClick={handleRefresh}
              className="p-1 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Previous Page"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              className="p-1 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Next Page"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              className={`p-1 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors ${
                isRotating ? 'animate-spin text-cyan-400' : ''
              }`}
              title="Refresh and Rescan DOM"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* URL Bar */}
          <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-300 font-mono text-[11px]">
            <Lock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span className="text-emerald-400 font-sans font-medium text-[10px] px-1 bg-emerald-950/60 rounded">
              HTTPS
            </span>
            <span className="text-slate-400">https://</span>
            <span className="text-slate-100 font-semibold">apex-autonomous.target.local</span>
            <span className="text-cyan-400">/{currentScenarioId}</span>
          </div>

          {/* Browser Extension Action Button (Puzzle / Kilo Icon) */}
          <div className="relative">
            <button
              onClick={() => setShowPopupPreview(!showPopupPreview)}
              className="relative flex items-center gap-1.5 px-2.5 py-1.5 bg-gradient-to-r from-cyan-950 to-blue-950 hover:from-cyan-900 hover:to-blue-900 border border-cyan-700/60 rounded-xl text-cyan-200 font-medium transition-all shadow-sm group"
              title="Apex Kilo Browser Extension Icon (Click to toggle popup preview)"
            >
              <Puzzle className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-12 transition-transform" />
              <span className="text-[11px] font-semibold hidden md:inline">Apex Kilo</span>
              {/* Badge indicating element count */}
              <span className="px-1.5 py-0.2 bg-cyan-500 text-slate-950 text-[10px] font-mono font-bold rounded-full">
                {elementCount}
              </span>
            </button>

            {/* Extension Popup Preview Dropdown */}
            {showPopupPreview && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 p-3.5 animate-fade-in text-slate-200">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-cyan-600 flex items-center justify-center text-[11px] font-bold text-white">
                      K
                    </div>
                    <span className="font-bold text-xs">Apex Kilo Extension</span>
                  </div>
                  <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.5 rounded">
                    Active
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  This extension is active in this tab with <span className="text-cyan-300 font-semibold">{elementCount}</span> interactive DOM nodes indexed.
                </p>
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      setShowPopupPreview(false);
                      onOpenExtensionHub();
                    }}
                    className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Puzzle className="w-3.5 h-3.5" />
                    <span>Download Extension ZIP</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowPopupPreview(false);
                      onRescan();
                    }}
                    className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                  >
                    Rescan DOM Elements
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Browser Content Area */}
        <div className="flex-1 overflow-y-auto relative bg-slate-950">
          {children}
        </div>
      </div>
    </div>
  );
};
