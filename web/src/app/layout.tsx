import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Noto_Sans_JP } from 'next/font/google';
import { HudStatus, TabBar } from '@/shared/ui';
import './globals.css';

const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-jetbrains-mono' });
const sans = Noto_Sans_JP({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-noto-sans-jp' });

export const metadata: Metadata = {
  title: '日次ルーティン',
  description: '日次ルーティン消し込みダッシュボード',
};

export const viewport: Viewport = {
  themeColor: '#050B1A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={mono.variable + ' ' + sans.variable}>
      <body>
        <div className="shell">
          <div className="col">
            <HudStatus />
            {children}
          </div>
          <TabBar />
        </div>
      </body>
    </html>
  );
}
