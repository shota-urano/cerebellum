'use client';

import { usePathname } from 'next/navigation';

export default function HudStatus() {
  const tag = usePathname().startsWith('/history') ? 'HISTORY' : 'TODAY';
  return (
    <div className="hud">
      <div className="hud__live">
        <span className="hud__dot" />
        <span className="mono label" style={{ letterSpacing: '.18em', fontSize: 11 }}>ROUTINE / DAILY</span>
      </div>
      <span className="mono label" style={{ letterSpacing: '.14em', fontSize: 11 }}>{tag}</span>
    </div>
  );
}
