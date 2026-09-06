import React, { useState, useMemo } from 'react';
import {
  Terminal,
  X,
  Trash2,
  Copy,
  Check,
  Search,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { LogEntry } from '../types';

interface LiveConsoleProps {
  logs: LogEntry[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
}

export const LiveConsole: React.FC<LiveConsoleProps> = ({
  logs,
  isOpen,
  onClose,
  onClear,
}) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      const matchesLevel = filterLevel === 'ALL' || l.level === filterLevel;
      const matchesSearch =
        !searchQuery ||
        l.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.details && JSON.stringify(l.details).toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesLevel && matchesSearch;
    });
  }, [logs, filterLevel, searchQuery]);

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.time}] [${l.level}] ${l.message} ${l.details ? JSON.stringify(l.details) : ''}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  const getLevelColor = (lvl: string) => {
    switch (lvl) {
      case 'DOM':
        return 'text-sky-400 bg-sky-950/60 border-sky-800/40';
      case 'PLAN':
        return 'text-purple-400 bg-purple-950/60 border-purple-800/40';
      case 'ACT':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-800/40';
      case 'NET':
        return 'text-cyan-400 bg-cyan-950/60 border-cyan-800/40';
      case 'ERR':
        return 'text-rose-400 bg-rose-950/60 border-rose-800/40';
      case 'WARN':
        return 'text-amber-400 bg-amber-950/60 border-amber-800/40';
      default:
        return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-slate-950/95 backdrop-blur-2xl border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-300">
      {/* Console Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-sm text-slate-100">Live Agent Console</span>
          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
            {logs.length} entries
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyLogs}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1"
            title="Copy Logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClear}
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Clear Logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-900/40 space-y-2">
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
          {['ALL', 'DOM', 'PLAN', 'ACT', 'NET', 'ERR'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2.5 py-1 rounded font-mono font-semibold transition-colors ${
                filterLevel === lvl
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800/70 text-slate-400 hover:text-slate-200'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs by keyword or payload..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-500 font-mono"
          />
        </div>
      </div>

      {/* Log Output Stream */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-600">No matching log lines captured.</div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const hasDetails = Boolean(log.details);

            return (
              <div
                key={log.id}
                className="group border border-slate-800/70 bg-slate-900/40 hover:bg-slate-900/80 rounded-lg p-2.5 transition-colors"
              >
                <div
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => hasDetails && setExpandedLogId(isExpanded ? null : log.id)}
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span className="text-[10px] text-slate-500 shrink-0 pt-0.5">{log.time}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border uppercase shrink-0 ${getLevelColor(
                        log.level
                      )}`}
                    >
                      {log.level}
                    </span>
                    <span className="text-slate-200 break-words flex-1 leading-relaxed">
                      {log.message}
                    </span>
                  </div>

                  {hasDetails && (
                    <button className="text-slate-500 group-hover:text-slate-300 p-0.5 shrink-0">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>

                {/* Expanded Details JSON */}
                {isExpanded && log.details && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/60">
                    <pre className="text-[10px] text-cyan-300/90 bg-slate-950 p-2 rounded overflow-x-auto border border-slate-800/60 max-h-48 leading-tight">
                      {typeof log.details === 'object'
                        ? JSON.stringify(log.details, null, 2)
                        : String(log.details)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
