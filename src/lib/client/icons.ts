// Inline SVG icons (trusted constants, rendered with {@html}).
export const icon = {
  flame: `<svg viewBox="0 0 24 24" fill="#fd7e14" aria-hidden="true"><path d="M12 2c1 3.5 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1.2 2.6 2.3 2.8C10.5 8.5 11 5 12 2z"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="#fab005" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.3 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.7 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21z"/></svg>`,
  speaker: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>`,
  mute: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/></svg>`,
  turtle: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 6c-4 0-7 3-7.5 7H3v2h2l-1 3h2.2l1-2.6c1.4.7 3 1.1 4.8 1.1s3.4-.4 4.8-1.1l1 2.6H20l-1-3h1.5c1.4 0 2.5-1.1 2.5-2.5S21.9 11 20.5 11h-1C18.6 8 15.6 6 12 6z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3 6.9 7.5.6-5.7 5 1.7 7.4L12 18l-6.5 3.9 1.7-7.4-5.7-5 7.5-.6z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 9V7A5 5 0 0 0 7 7v2H5v12h14V9h-2zm-8 0V7a3 3 0 1 1 6 0v2H9z"/></svg>`,
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3c2 6 9 9 9 17a9 9 0 0 1-18 0c0-4 2-6 4-8 0 3 2 5 4 5-2-5-1-10 1-14z" fill="var(--accent)"/><path d="M16 17c1 3 4 4 4 7a4 4 0 0 1-8 0c0-2 2-4 4-7z" fill="#fab005"/></svg>`,
  sparkle: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 15l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></svg>`,
};

export const SUBJECT_ICON: Record<string, string> = { language: "🗣️", science: "🔬", math: "📐", code: "💻", other: "✨" };
export const SUBJECT_LABEL: Record<string, string> = {
  language: "Languages",
  science: "Science",
  math: "Math",
  code: "Code",
  other: "Other",
};
