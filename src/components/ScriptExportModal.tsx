import React, { useState, useEffect } from 'react';
import {
  X,
  Puzzle,
  Code2,
  Download,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  FolderArchive,
  FileCode,
  CheckCircle2,
  Sparkles,
  Info,
} from 'lucide-react';

interface ScriptExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScriptExportModal: React.FC<ScriptExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'extension' | 'userscript'>('extension');
  const [copied, setCopied] = useState(false);
  const [scriptSnippet, setScriptSnippet] = useState<string>('// Loading userscript...');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setDownloadUrl(`${origin}/apex_kilo_autonomous_agent.user.js`);

      fetch('/api/script/raw')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.content) {
            setScriptSnippet(data.content.slice(0, 2800) + '\n\n// ... [3,600+ lines of autonomous agent engine] ...');
          }
        })
        .catch(() => {
          setScriptSnippet('// Apex Kilo Autonomous Agent Userscript (v8.14)\n// Available directly at /apex_kilo_autonomous_agent.user.js');
        });
    }
  }, [isOpen]);

  const handleCopyFull = async () => {
    try {
      const res = await fetch('/api/script/raw');
      const data = await res.json();
      if (data && data.content) {
        await navigator.clipboard.writeText(data.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadZip = () => {
    setIsDownloadingZip(true);
    window.location.href = '/api/extension/download';
    setTimeout(() => setIsDownloadingZip(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white">
              <Puzzle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Browser Extension & Userscript Hub</h3>
              <div className="text-[11px] text-slate-400 font-mono">
                Install Apex Kilo into Chrome, Edge, Brave, or Tampermonkey
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/40 px-6 pt-2">
          <button
            onClick={() => setActiveTab('extension')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'extension'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderArchive className="w-4 h-4" />
            <span>Chrome / Edge Extension (Manifest V3)</span>
            <span className="px-1.5 py-0.2 bg-cyan-950 text-cyan-300 text-[10px] font-mono rounded">
              Recommended
            </span>
          </button>
          <button
            onClick={() => setActiveTab('userscript')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'userscript'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Tampermonkey / Violentmonkey (.user.js)</span>
          </button>
        </div>

        {/* Tab 1: Chrome Extension */}
        {activeTab === 'extension' && (
          <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
            {/* Download Card */}
            <div className="p-5 bg-gradient-to-br from-cyan-950/60 via-slate-900 to-blue-950/40 border border-cyan-500/50 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-cyan-950/30">
              <div>
                <div className="font-extrabold text-white text-sm flex items-center gap-2">
                  <FolderArchive className="w-4 h-4 text-cyan-400" />
                  <span>Apex Kilo Chrome Extension ZIP</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-cyan-950 text-cyan-300 rounded border border-cyan-800">
                    v8.14
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] mt-1 max-w-md">
                  Complete unpacked extension package ready to load into Chrome, Edge, Brave, or Opera in Developer Mode.
                </p>
              </div>

              <button
                onClick={handleDownloadZip}
                disabled={isDownloadingZip}
                className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-500/20 active:scale-95 flex-shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloadingZip ? 'Preparing ZIP...' : 'Download Extension ZIP'}</span>
              </button>
            </div>

            {/* Step-by-Step Installation Guide */}
            <div className="space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>How to Install in 3 Easy Steps</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div className="font-semibold text-white">Unzip Archive</div>
                  <p className="text-[11px] text-slate-400">
                    Extract the downloaded <code className="text-cyan-300">apex-kilo-extension-v8.14.zip</code> to any folder on your computer.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <div className="font-semibold text-white">Developer Mode</div>
                  <p className="text-[11px] text-slate-400">
                    Open <code className="text-cyan-300">chrome://extensions</code> in your browser and toggle on <span className="text-slate-200 font-semibold">Developer mode</span>.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                  <div className="w-6 h-6 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <div className="font-semibold text-white">Load Unpacked</div>
                  <p className="text-[11px] text-slate-400">
                    Click <span className="text-slate-200 font-semibold">"Load unpacked"</span> and select the extracted folder containing <code className="text-cyan-300">manifest.json</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* Package Contents Checklist */}
            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
              <div className="font-semibold text-slate-300 text-xs">Included in Extension Package:</div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>manifest.json (V3)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>content_script.js</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>background.js</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <span>popup.html & popup.js</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Userscript */}
        {activeTab === 'userscript' && (
          <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="/apex_kilo_autonomous_agent.user.js"
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 bg-gradient-to-br from-cyan-950/60 to-slate-900 border border-cyan-700/50 hover:border-cyan-400 rounded-xl flex items-center justify-between group transition-all"
              >
                <div>
                  <div className="font-bold text-white text-sm flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-cyan-400" />
                    1-Click Install Script
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Opens directly in Tampermonkey / Violentmonkey
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-cyan-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>

              <button
                onClick={handleCopyFull}
                className="p-4 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between text-left transition-all"
              >
                <div>
                  <div className="font-bold text-white text-sm flex items-center gap-1.5">
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
                    {copied ? 'Copied Full Script!' : 'Copy Script to Clipboard'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    3,600+ lines of production TypeScript/JS
                  </div>
                </div>
              </button>
            </div>

            {/* Direct URL Box */}
            <div className="space-y-1.5">
              <label className="text-slate-400 font-semibold text-[11px]">
                Direct Userscript Update URL:
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2 font-mono text-[11px] text-cyan-300">
                <span className="truncate flex-1">{downloadUrl}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(downloadUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs"
                >
                  Copy URL
                </button>
              </div>
            </div>

            {/* Preview Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Script Header & Core Engine Preview</span>
                <span className="font-mono text-cyan-400">v8.14.0</span>
              </div>
              <pre className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[10px] text-slate-300 overflow-x-auto max-h-48 leading-relaxed">
                {scriptSnippet}
              </pre>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>OpenCode VIP & Gemini 2.5 compatible</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
