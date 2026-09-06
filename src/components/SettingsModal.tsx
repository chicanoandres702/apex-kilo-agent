import React, { useState } from 'react';
import {
  X,
  Cpu,
  Sliders,
  Shield,
  Sparkles,
  Activity,
  CheckCircle2,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import { AgentConfig } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AgentConfig;
  onChangeConfig: (newConfig: AgentConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
}) => {
  const [testingStatus, setTestingStatus] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    agents?: string[];
    models?: string[];
    error?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTestingStatus(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/opencode/status');
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || 'Connection failed' });
    } finally {
      setTestingStatus(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-base text-white">Agent & Backend Configuration</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* Live Diagnostics Card */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs text-white">OpenCode VIP Backend Diagnostics</span>
              </div>
              <button
                onClick={handleTestConnection}
                disabled={testingStatus}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <RotateCw className={`w-3 h-3 ${testingStatus ? 'animate-spin' : ''}`} />
                <span>{testingStatus ? 'Testing...' : 'Test Ping'}</span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-lg text-xs font-mono border ${
                  testResult.ok
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                }`}
              >
                {testResult.ok ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Online ({testResult.latencyMs}ms latency)</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Agents: {(testResult.agents || []).slice(0, 5).join(', ')} • Connected: kilo
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>{testResult.error || 'Server error'}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              Reasoning Engine / Provider
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'gemini', title: 'Google Gemini', desc: 'Server proxy (Default / Fastest)' },
                { id: 'devproject', title: 'DevProject /ai', desc: 'OpenCode Session API (Port 4096)' },
                { id: 'kilo', title: 'Kilo Code v1', desc: 'Port 4097 /v1/chat' },
                { id: 'heuristic', title: 'Heuristic Engine', desc: '100% Offline / Zero API Key' },
              ].map((p) => {
                const isSelected = config.provider === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      onChangeConfig({
                        ...config,
                        provider: p.id as any,
                        model:
                          p.id === 'gemini'
                            ? 'gemini-2.5-flash'
                            : p.id === 'heuristic'
                              ? 'built-in'
                              : 'kilo-auto/free',
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-950/40 text-white shadow-sm'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-xs text-white">{p.title}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{p.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Specification with Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Model Name</label>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...config, model: 'gemini-2.5-flash' })}
                  className="text-cyan-400 hover:underline"
                >
                  gemini-2.5-flash
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...config, model: 'kilo-auto/free' })}
                  className="text-cyan-400 hover:underline"
                >
                  kilo-auto/free
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...config, model: 'google/gemini-3.8-flash' })}
                  className="text-cyan-400 hover:underline"
                >
                  gemini-3.8
                </button>
              </div>
            </div>
            <input
              type="text"
              value={config.model}
              onChange={(e) => onChangeConfig({ ...config, model: e.target.value })}
              placeholder="e.g. gemini-2.5-flash or kilo-auto/free"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 font-mono focus:border-cyan-500 outline-none"
            />
          </div>

          {/* Execution Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Max Steps</label>
              <input
                type="number"
                min={1}
                max={100}
                value={config.maxSteps}
                onChange={(e) => onChangeConfig({ ...config, maxSteps: parseInt(e.target.value, 10) || 30 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-cyan-500 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Step Delay (ms)</label>
              <input
                type="number"
                min={100}
                max={5000}
                step={100}
                value={config.stepDelayMs}
                onChange={(e) => onChangeConfig({ ...config, stepDelayMs: parseInt(e.target.value, 10) || 750 })}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono focus:border-cyan-500 outline-none"
              />
            </div>
          </div>

          {/* Safety Toggles */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-200">Heuristic Fallback</div>
                <div className="text-[11px] text-slate-400">
                  Allow in-browser heuristic engine if remote LLM encounters HTTP 500
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.allowHeuristicFallback}
                onChange={(e) =>
                  onChangeConfig({ ...config, allowHeuristicFallback: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-200">Interactive DOM Badges</div>
                <div className="text-[11px] text-slate-400">
                  Render numbered badges on interactive scanned DOM nodes
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.enableBadges}
                onChange={(e) =>
                  onChangeConfig({ ...config, enableBadges: e.target.checked })
                }
                className="w-4 h-4 rounded border-slate-700 text-cyan-600 focus:ring-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-xs transition-colors shadow-sm"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
};
