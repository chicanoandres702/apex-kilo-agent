import React from 'react';
import { InteractiveElementNode } from '../types';

interface BadgesOverlayProps {
  elements: InteractiveElementNode[];
  activeElementId: number | null;
  enabled: boolean;
  onBadgeClick?: (elementId: number) => void;
}

export const BadgesOverlay: React.FC<BadgesOverlayProps> = ({
  elements,
  activeElementId,
  enabled,
  onBadgeClick,
}) => {
  if (!enabled || elements.length === 0) return null;

  return (
    <div
      id="auto-agent-badge-layer"
      className="absolute inset-0 pointer-events-none z-30 overflow-visible"
      aria-hidden="true"
    >
      {elements.map((el) => {
        if (!el.rect) return null;
        const isActive = activeElementId === el.id;

        // Position coordinates relative to container
        const top = Math.max(0, el.rect.top - 6);
        const left = Math.max(0, el.rect.left - 6);

        return (
          <React.Fragment key={el.id}>
            {/* Element Highlight Box when active */}
            {isActive && (
              <div
                className="absolute border-2 border-emerald-400 bg-emerald-500/15 rounded-md pointer-events-none transition-all duration-200 z-30 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                style={{
                  top: Math.max(0, el.rect.top - 2),
                  left: Math.max(0, el.rect.left - 2),
                  width: el.rect.width + 4,
                  height: el.rect.height + 4,
                }}
              />
            )}

            {/* Visual Numbered Badge */}
            <div
              onClick={() => onBadgeClick && onBadgeClick(el.id)}
              className={`absolute font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-md pointer-events-auto cursor-pointer select-none transition-all duration-150 z-40 ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 text-white ring-2 ring-emerald-300 scale-125 shadow-emerald-900/50'
                  : 'bg-gradient-to-r from-sky-600 to-violet-600 hover:from-sky-500 hover:to-violet-500 text-white opacity-85 hover:opacity-100 hover:scale-110 shadow-black/40'
              }`}
              style={{
                top,
                left,
              }}
              title={`#${el.id}: <${el.tag}> ${el.text ? `"${el.text.slice(0, 40)}"` : ''}`}
            >
              {el.id}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
