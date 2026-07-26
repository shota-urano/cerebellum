'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { glowShadow } from '@/shared/lib';

const TABS = [
  { href: '/', label: '今日' },
  { href: '/history', label: '履歴' },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabs">
      <div className="tabs__inner">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={'mono tab' + (active ? ' tab--active' : '')}
              style={active ? { boxShadow: glowShadow(9, 0.2) } : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
