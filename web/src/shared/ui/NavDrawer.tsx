'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { glowShadow } from '@/shared/lib';

/**
 * ヘッダーのハンバーガー＋ドロワー（docs/specs/16-web-navigation.md）。
 * 下部タブバーの置き換え。画面幅による分岐は持たない（常設サイドバー不採用・§4）。
 */

/**
 * 遷移先の追加はこの配列1箇所で完結させる（docs/specs/16 §4）。並びは使用頻度順（§3.3）。
 *
 * ダイジェスト・夜勤・学習は**常設ナビに置かない**（2026-07-29 夕方改訂・docs/specs/16 §3.6）。
 * いずれもタスク起点の詳細ビューで、入口は「今日」のタスク行（detailRef）。過去の run を
 * 後から見る入口は「開発」（docs/specs/19-web-dev-history.md）。
 * ハーネス（`/harness`・docs/specs/18-web-harness.md）と あなた待ち（`/waiting`・
 * docs/specs/23-web-waiting.md）だけは例外として常設する——いずれも毎朝の承認**操作**であり、
 * 読むだけの詳細ビューとは性質が違う（docs/specs/16 §3.6）。承認2画面は隣に並べる。
 *
 * brain（脳ビュー）は cerebellum の画面ではなく、Tailscale Serve の path マウント
 * （`/brain`→:48320・second-brain の build_brain.py が生成）で配信される外部ページ。
 * Next のルートが無いので Link でなく <a> で遷移する。URL 解決は shared/api/runs.ts の
 * viewerBase() と同じ規約（https=path マウント / http=同ホストの直ポート）。
 */
const BRAIN_PORT = '48320';
const BRAIN_HTTPS_PATH = '/brain';

function brainHref(): string {
  if (typeof window === 'undefined') return BRAIN_HTTPS_PATH;
  if (window.location.protocol === 'https:') return BRAIN_HTTPS_PATH;
  return 'http://' + window.location.hostname + ':' + BRAIN_PORT;
}
const NAV_ITEMS: { href: string; label: string; external?: boolean }[] = [
  { href: '/', label: '今日' },
  { href: '/history', label: '履歴' },
  { href: '/routines', label: 'ルーティン' },
  { href: '/waiting', label: 'あなた待ち' },
  { href: '/harness', label: 'ハーネス' },
  { href: '/dev', label: '開発' },
  { href: '/office', label: 'オフィス' },
  { href: BRAIN_HTTPS_PATH, label: 'brain', external: true },
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
              if (item.external) {
                // 外部ページ（SPA外）への遷移。active になることは無い
                return (
                  <a
                    key={item.href}
                    href={brainHref()}
                    className="mono drawer__item"
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                );
              }
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
