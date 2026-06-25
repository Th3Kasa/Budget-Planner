import React, { useEffect, useMemo } from "react";

const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
];

// A lightweight, dependency-free celebration: a burst of CSS confetti plus a
// toast that auto-dismisses. Fired when a savings goal is fully funded or a
// debt is paid off. Purely cosmetic — pointer-events stay off the confetti so
// it never blocks the UI underneath.
export default function Celebration({
  title,
  subtitle,
  onDone,
}: {
  title: string;
  subtitle?: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [onDone]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        bg: COLORS[i % COLORS.length],
        delay: Math.random() * 0.6,
        duration: 2.4 + Math.random() * 1.6,
        size: 6 + Math.random() * 6,
      })),
    [],
  );

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none overflow-hidden flex items-start justify-center">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.bg,
            width: p.size,
            height: p.size * 1.6,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
      <div className="mt-12 pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="bg-white rounded-2xl shadow-2xl border border-emerald-100 px-6 py-4 flex items-center gap-3 max-w-sm">
          <div className="text-3xl flex-shrink-0">🎉</div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900">{title}</p>
            {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onDone}
            className="ml-2 text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
