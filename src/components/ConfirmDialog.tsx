'use client';

import { createPortal } from 'react-dom';

// Small cute confirmation dialog used before destructive actions (chat
// clear/delete, clearing all notifications). It renders through a portal
// to document.body so it always centres on the viewport: nested inside a
// header or sidebar, a plain fixed element can anchor to a transformed
// ancestor instead and end up clipped at the top of the screen. The
// dialog only ever renders after a click, so document.body exists.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(74, 36, 54, 0.45)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-5 space-y-3"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-black theme-text">{title}</p>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {message}
        </p>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold"
            style={{ background: 'var(--color-secondary)', color: 'var(--color-text)' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white"
            style={{ background: '#FF6B6B' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
