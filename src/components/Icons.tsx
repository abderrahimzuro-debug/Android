import type { ReactNode, SVGProps } from 'react';

const paths: Record<string, ReactNode> = {
  solve: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h3m2 0h3M8 16h3m2 0h3" /></>,
  graph: <><path d="M3 19h18M5 19V5M5 15l4-5 4 3 6-8" /><circle cx="9" cy="10" r="1" /><circle cx="19" cy="5" r="1" /></>,
  camera: <><path d="M3 8h3l1.5-2h9L18 8h3v11H3z" /><circle cx="12" cy="13" r="3.5" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8M12 7.5V12l3 2" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.6v2.3M12 19.1v2.3M4.7 7.3l2 1.1M17.3 15.6l2 1.1M4.7 16.7l2-1.1M17.3 8.4l2-1.1M2.6 12h2.3M19.1 12h2.3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></>,
  offline: <><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 6-2.9M8.5 15.5a6 6 0 0 1 3-1.6M12 19h.01M3 3l18 18" /></>,
  online: <><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0" /><circle cx="12" cy="19" r=".6" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m4 12 5 5L20 6" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  alert: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 9v5m0 3h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  share: <><path d="M12 16V3m0 0L8 7m4-4 4 4" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3z" />,
  trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7" /><path d="M10 11v6m4-6v6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 17v3h16v-3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  reset: <><path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7" /><path d="M4 4v4.7h4.7" /></>,
  backspace: <><path d="M9 5h11v14H9L2 12l7-7z" /><path d="m12 9 6 6m0-6-6 6" /></>,
  upload: <><path d="M12 17V5m0 0 4 4m-4-4L8 9" /><path d="M4 16v4h16v-4" /></>,
  crop: <><path d="M6 2v16h16M2 6h16v16" /></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-4L4 9" /><path d="M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2" /><path d="M20 20v-5h-5" /></>,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  arrowRight: <path d="M4 12h16m0 0-6-6m6 6-6 6" />,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M8 16h8" /></>,
  sparkles: <><path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8L12 3z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" /></>,
  lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  install: <><path d="M12 3v11m0 0 4-4m-4 4-4-4" /><path d="M4 17v3h16v-3" /><path d="M4 7h16" /></>,
  book: <><path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z" /><path d="M20 4h-3a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h3z" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M3 3l18 18" /><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.2 3.7M6.2 7.7A15.6 15.6 0 0 0 2 12s3.5 6 10 6a9.5 9.5 0 0 0 3.6-.7" /></>,
  play: <path d="M8 5v14l11-7z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export type IconName = keyof typeof paths;

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  filled?: boolean;
}

export function Icon({ name, size = 20, filled = false, ...props }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" {...props}
    >
      {paths[name]}
    </svg>
  );
}

/** Original MathFlow mark: a flowing curve crossing a calm horizon. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="mf-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#35c9bd" />
          <stop offset="100%" stopColor="#0b8f8a" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="#0b1f31" />
      <path d="M7 30c5 0 6-12 11-12s6 12 11 12 6-12 12-12" fill="none" stroke="url(#mf-brand)" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M9 36h30" stroke="#f3c67a" strokeWidth="2" strokeLinecap="round" opacity=".9" />
      <circle cx="35.5" cy="18" r="3.4" fill="#f3c67a" />
    </svg>
  );
}
