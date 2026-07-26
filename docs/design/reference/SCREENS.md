# 採用画面 → ファイル対応表（design-writer の入力契約）

採用: **系統B（Claude design コードプロトタイプ・Next.js 版）**・全画面。
出典: claude.ai/design プロジェクト `86a73959-42e7-4279-b568-a165fe0815b5` の `nextjs/` ツリー（2026-07-26 取り込み。
初回取り込みの単一 HTML 版 dc.html は本ツリーで置き換え済み——旧版はコミット a33252e 参照）。
詳細な要素対応・トークン所在は [`nextjs/README.md`](./nextjs/README.md) の表を参照。

| 画面 | 対応spec | 素材ファイル |
|---|---|---|
| 今日（消し込み） | `docs/specs/08-web-today.md` | `docs/design/reference/nextjs/app/page.tsx`（＋ components/HeaderPanel・SegmentBar・TaskList・TaskRow・CheckRing・AllClear・EmptyState・ErrorBanner、lib/useTodayTasks・data・date・theme） |
| 履歴（読み取り専用＋サマリ） | `docs/specs/09-web-history.md` | `docs/design/reference/nextjs/app/history/page.tsx`（＋ components/DateNav・WeekSummary・TaskList・TaskRow・CheckRing・EmptyState、lib/data・date・theme） |
| 共通シェル（両画面が依存） | `docs/specs/07-web-foundation.md` | `docs/design/reference/nextjs/app/layout.tsx`・`app/globals.css`（トークン :root）・`components/HudStatus.tsx`・`components/TabBar.tsx` |

- 単一プロトタイプのため共有コード（components/・lib/）は両画面から参照される。画面単位の特定は README の対応表で行う
- 不採用案: 系統A（gpt-image）2枚は `docs/design/candidates/a-image/` に残置（design-writer は読まない）
- `mockups/` は空（採用A なし）。**同一画面を mockups/ と reference/ の両方に置かないこと**
