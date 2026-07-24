import React from 'react';
import { ExternalLink } from 'lucide-react';

const HomeLink: React.FC<{ className?: string }> = ({ className = '' }) => (
  <a
    href="https://kazeabc.com"
    target="_blank"
    rel="noopener noreferrer"
    className={`group inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/[.07] px-5 py-2.5 font-black tracking-[.18em] text-cyan-100 shadow-[0_8px_30px_rgba(34,211,238,.08)] transition hover:border-cyan-200/45 hover:bg-cyan-300/[.13] hover:text-white active:scale-95 ${className}`}
  >
    <span>聴風</span>
    <ExternalLink className="h-4 w-4 opacity-60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
  </a>
);

export default HomeLink;
