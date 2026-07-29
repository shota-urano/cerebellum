'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { glowShadow } from '@/shared/lib';

/**
 * ヘッダーのハンバーガー＋ドロワー（docs/specs/16-web-navigation.md）。
 * 下部タブバーの置き換え。画面幅による分岐は持たない（常設サイドバー不採用・§4）。
 */

/** 遷移先の追加はこの配列1箇所で完結させる（docs/specs/16 §4）。並びは使用頻度順（§3.3）。 */
const NAV_ITEMS = [
  { href: '/', label: '今日' },
  { href: '/history', label: '履歴' },
  { href: '/routines', label: 'ルーティン' },
  { href: '/digest', label: 'ダイジェスト' },
  { href: '/nightshift', label: '夜勤' },
];

export function NavDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Escape で閉じる（デスクトップから触るときの逃げ道。バックドロップタップと同義）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="navbtn"
        aria-label="メニュー"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="navbtn__bar" />
        <span className="navbtn__bar" />
        <span className="navbtn__bar" />
      </button>

      {open && (
        <div className="drawer">
          <button
            type="button"
            className="drawer__backdrop"
            aria-label="メニューを閉じる"
            onClick={() => setOpen(false)}
          />
          <nav className="drawer__panel" aria-label="ナビゲーション">
            <span className="mono label drawer__title">NAVIGATION</span>
            {NAV_ITEMS.map((item) => {
              // 判定は旧 TabBar と同じ前方一致（`/` のみ完全一致・docs/specs/16 §3.5）
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={'mono drawer__item' + (active ? ' drawer__item--active' : '')}
                  style={active ? { boxShadow: glowShadow(9, 0.2) } : undefined}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
