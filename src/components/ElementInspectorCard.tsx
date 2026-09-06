import React from 'react';
import {
  Crosshair,
  X,
  MousePointer,
  Keyboard,
  Eye,
  CheckCircle,
  Copy,
} from 'lucide-react';
import { InteractiveElementNode } from '../types';

interface ElementInspectorCardProps {
  element: InteractiveElementNode | null;
  onClose: () => void;
  onTestClick: (elementId: number) => void;
  onTestType: (elementId: number, text: string) => void;
}

export const ElementInspectorCard: React.FC<ElementInspectorCardProps> = ({
  element,
  onClose,
  onTestClick,
  onTestType,
}) => {
  const [testInput, setTestInput] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  if (!element) return null;

  const handleCopySelector = () => {
    const selector = `${element.tag}${element.id ? `[id="${element.id}"]` : ''}${element.name ? `[name="${element.name}"]` : ''}`;
    navigator.clipboard.writeText(selector);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="absolute top-4 right-4 z-40 w-80 bg-slate-900/95 backdrop-blur-md border border-cyan-500/60 rounded-xl shadow-2xl shadow-cyan-950/50 p-4 text-xs animate-fade-in text-slate-200">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-mono font-bold text-[11px] border border-cyan-500/40">
            {element.id}
          </div>
          <span className="font-bold text-white tracking-wide">DOM Inspector</span>
          <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 font-mono text-[10px] rounded uppercase">
            {element.tag}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 mb-3">
        {element.name && (
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Name:</span>
            <span className="font-mono text-cyan-300 truncate max-w-[170px]">{element.name}</span>
          </div>
        )}
        {element.role && (
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Role:</span>
            <span className="font-mono text-slate-300">{element.role}</span>
          </div>
        )}
        {element.text && (
          <div className="flex items-start justify-between gap-2">
            <span className="text-slate-400 flex-shrink-0">Text:</span>
            <span className="font-mono text-slate-200 text-right truncate max-w-[170px]">
              "{element.text}"
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Bounds:</span>
          <span className="font-mono text-slate-400 text-[10px]">
            {Math.round(element.rect.left)},{Math.round(element.rect.top)} ({Math.round(element.rect.width)}x{Math.round(element.rect.height)})
          </span>
        </div>
      </div>

      {/* Quick Test Actions */}
      <div className="pt-2 border-t border-slate-800/80 space-y-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onTestClick(element.id)}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold transition-colors shadow-sm"
          >
            <MousePointer className="w-3 h-3" />
            <span>Test Click</span>
          </button>
          <button
            onClick={handleCopySelector}
            className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            title="Copy element selector"
          >
            {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {(element.tag === 'input' || element.tag === 'textarea') && (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Test typing text..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 text-xs outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => {
                if (testInput) {
                  onTestType(element.id, testInput);
                  setTestInput('');
                }
              }}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg font-semibold"
            >
              Type
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
