import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Noto_Sans_JP } from 'next/font/google';
import { AppHud } from './AppHud';
import './globals.css';

const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-jetbrains-mono' });
const sans = Noto_Sans_JP({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-noto-sans-jp' });

export const metadata: Metadata = {
  title: '日次ルーティン',
  description: '日次ルーティン消し込みダッシュボード',
  // PWA はホーム画面追加まで（docs/specs/07 §4）
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '日次ルーティン', statusBarStyle: 'black-translucent' },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
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
            {/* HUD 行（ドロワー同居）。未決バッジの件数を渡すため app 層で包む
                （docs/specs/25-web-inbox.md §3.5） */}
            <AppHud />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
