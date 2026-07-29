'use client';

import { usePathname } from 'next/navigation';
import { NavDrawer } from './NavDrawer';

/** パスから画面タグを決める（docs/design/01-shell.md）。3タブ目の追加分は ROUTINES。 */
function tagOf(pathname: string) {
  if (pathname.startsWith('/history')) return 'HISTORY';
  if (pathname.startsWith('/routines')) return 'ROUTINES';
  return 'TODAY';
}

export function HudStatus() {
  const tag = tagOf(usePathname());
  return (
    <div className="hud">
      <div className="hud__live">
        <span className="hud__dot" />
        <span className="mono label" style={{ letterSpacing: '.18em', fontSize: 11 }}>ROUTINE / DAILY</span>
      </div>
      {/* ハンバーガーは HUD 行に同居させる（行を増やさない・docs/specs/16-web-navigation.md §3.2） */}
      <div className="hud__right">
        <span className="mono label" style={{ letterSpacing: '.14em', fontSize: 11 }}>{tag}</span>
        <NavDrawer />
      </div>
    </div>
  );
}
