// PALSY — shared chat tools: history paging, transcript export, download.
import type { Message, Profile } from '@/types';

export const CHAT_PAGE_SIZE = 50;

// WhatsApp-style transcript line: 12/11/2026, 5:14 PM - Name: message
function exportLine(msg: Message, senderName: string): string {
  const d = new Date(msg.created_at);
  const date = d.toLocaleDateString('en-GB'); // DD/MM/YYYY
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let body: string;
  if (msg.is_deleted || !msg.content) {
    body = '[Message deleted]';
  } else if (msg.type === 'image') {
    body = `[Photo${msg.content && msg.content !== 'Photo' ? `: ${msg.content}` : ''}]`;
  } else if (msg.type === 'video') {
    body = '[Video]';
  } else if (msg.type === 'audio' || msg.type === 'voice') {
    body = '[Voice message]';
  } else if (msg.type === 'file') {
    body = `[File: ${msg.content}]`;
  } else {
    body = msg.content;
  }
  if (msg.edited_at && !msg.is_deleted) body += ' (edited)';
  // Indent continuation lines so multi-line messages stay readable.
  const lines = body.split('\n');
  return `${date}, ${time} - ${senderName}: ${lines[0]}` + lines.slice(1).map((l) => `\n    ${l}`).join('');
}

// Short label for a quoted message: a text preview, or a media placeholder.
export function quoteSnippet(msg: Message): string {
  if (msg.is_deleted || !msg.content) return 'Message deleted';
  if (msg.type === 'image') return '[Photo]';
  if (msg.type === 'video') return '[Video]';
  if (msg.type === 'audio' || msg.type === 'voice') return '[Voice message]';
  if (msg.type === 'file') return `[File: ${msg.content}]`;
  const one = msg.content.replace(/\s+/g, ' ').trim();
  return one.length > 80 ? one.slice(0, 80) + '…' : one;
}

export function buildTranscript(
  title: string,
  messages: Message[],
  nameOf: (msg: Message) => string,
  quoteLine?: (msg: Message) => string | null,
): string {
  const exported = new Date().toLocaleString([], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const header = [`PALSY chat export`, title, `Exported ${exported}`, ''];
  const lines: string[] = [];
  for (const m of messages) {
    const q = quoteLine?.(m);
    if (q) lines.push(q);
    lines.push(exportLine(m, nameOf(m)));
  }
  return [...header, ...lines].join('\n') + '\n';
}

export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function senderName(msg: Message, fallback: string): string {
  const s = msg.sender as Profile | undefined;
  return s?.display_name || s?.username || fallback;
}
