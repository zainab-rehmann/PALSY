'use client';

import { createPortal } from 'react-dom';

// WhatsApp-style delete choice (migration 032): Delete for everyone
// leaves a "This message was deleted" note for all participants; Delete
// for me hides it only for the person deleting it (a marker row in
// message_deletions); Cancel deletes nothing. It renders through a portal
// to document.body so it always centres on the viewport, like
// ConfirmDialog — a plain fixed element nested in a header or sidebar can
// anchor to a transformed ancestor instead and end up clipped.
export default function DeleteMessageDialog({
  count,
  onEveryone,
  onForMe,
  onCancel,
}: {
  count: number;
  onEveryone: () => void;
  onForMe: () => void;
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
        <p className="font-black theme-text">
          {count === 1 ? 'Delete message?' : `Delete ${count} messages?`}
        </p>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Choose who this is deleted for.
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={onEveryone}
            className="w-full py-3 rounded-2xl text-sm font-bold text-white"
            style={{ background: '#C62828' }}
          >
            Delete for everyone
          </button>
          <button
            onClick={onForMe}
            className="w-full py-3 rounded-2xl text-sm font-bold"
            style={{ background: 'var(--color-secondary)', color: 'var(--color-text)' }}
          >
            Delete for me
          </button>
          <button
            onClick={onCancel}
            className="w-full py-2 rounded-2xl text-sm font-bold"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
