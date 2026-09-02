'use client';

import { usePathname } from 'next/navigation';
import { NavDrawer } from './NavDrawer';

/** パスから画面タグを決める（docs/design/01-shell.md）。3タブ目の追加分は ROUTINES。 */
function tagOf(pathname: string) {
  if (pathname.startsWith('/history')) return 'HISTORY';
  if (pathname.startsWith('/routines')) return 'ROUTINES';
  return 'TODAY';
}

function scopeOf(pathname: string) {
  return pathname.startsWith('/office') ? 'OFFICE' : 'DAILY';
}

export type HudStatusProps = {
  /**
   * ドロワーの「あなた待ち」に出す未決の総件数（docs/specs/25-web-inbox.md §3.5）。
   * ここは受け渡しだけを行う（HUD 自身は使わない）——ドロワーは HUD 行に同居しており、
   * 取得は app 層（`app/AppHud.tsx`）の仕事なので、シェルは数値を通すだけにする。
   */
  waitingCount?: number;
};

export function HudStatus({ waitingCount }: HudStatusProps) {
  const pathname = usePathname();
  const tag = tagOf(pathname);
  return (
    <div className="hud">
      <div className="hud__live">
        <span className="hud__dot" />
        <span className="mono label" style={{ letterSpacing: '.18em', fontSize: 11 }}>ROUTINE / {scopeOf(pathname)}</span>
      </div>
      {/* ハンバーガーは HUD 行に同居させる（行を増やさない・docs/specs/16-web-navigation.md §3.2） */}
      <div className="hud__right">
        <span className="mono label" style={{ letterSpacing: '.14em', fontSize: 11 }}>{tag}</span>
        <NavDrawer waitingCount={waitingCount} />
      </div>
    </div>
  );
}
