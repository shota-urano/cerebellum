import type { InboxKind, InboxOpenCountDto, InboxSourceSummaryDto } from '@/shared/api';
import type { InboxMissingSource } from './missing';

/**
 * 「今日」第3段（WAITING）が読む集計（docs/specs/25-web-inbox.md §3.1）。
 *
 * 入力は `GET /api/inbox/summary`（送信元ごとの最終受信と kind 別未決件数・
 * docs/specs/24-inbox.md §3.5）と、名簿突合の結果（§3.3 の未着）だけ。
 * **画面のための再集計しかしない**——サーバーの返す件数を足すだけで、
 * 項目そのものは引かない（第3段は件数と導線で、中身は「あなた待ち」で読む）。
 *
 * I/O は持たない（取得は `hooks/`）。
 */

/** 第3段に並べる4つの見出し（§3.1 の確定文言。`⚠` だけ絵文字が付く） */
export function stripKindLabel(kind: InboxKind) {
  switch (kind) {
    case 'alert':
      return '⚠ 異常';
    case 'approve':
      return '承認';
    case 'choose':
      return '選択';
    default:
      return '読む';
  }
}

/**
 * kind 別の未決件数を全送信元で合計する（§3.1「確認待ちの件数を kind 別に4つ並べる」）。
 *
 * `undefined`（まだ `summary` が取れていない）は 0 に潰さない——0件は「確認待ちが無い」
 * という意味を持つ表示なので、取得前に 0 を出すと嘘になる。
 */
export function openCounts(
  sources: InboxSourceSummaryDto[] | undefined,
): InboxOpenCountDto | undefined {
  if (!sources) return undefined;
  return sources.reduce<InboxOpenCountDto>(
    (total, source) => ({
      approve: total.approve + source.openCount.approve,
      choose: total.choose + source.openCount.choose,
      read: total.read + source.openCount.read,
      alert: total.alert + source.openCount.alert,
    }),
    { approve: 0, choose: 0, read: 0, alert: 0 },
  );
}

/**
 * ヘッダの赤点を出すか（§3.1「第3段の異常が1件でもあれば ProgressHeader の右端に赤い点」）。
 *
 * 異常は3つだけ——`alert` の未決・未着の送信元・`applyState = failed`。
 * **`approve` / `choose` / `read` の未決は異常ではない**（順番に片付ければよいもので、
 * 赤点にすると常時点灯して合図が死ぬ）。
 *
 * **ALL CLEAR の判定には混ぜない**（§3.1）。日課の完了と AI 側の異常は別の話で、
 * 混ぜると「日課を全部終えたのに ALL CLEAR が出ない」になり第1段の意味が壊れる。
 * 第2段（学習）の未着も含めない——赤点は第3段の異常だけを表す合図。
 */
export function hasInboxAlert(
  sources: InboxSourceSummaryDto[] | undefined,
  missing: InboxMissingSource[],
): boolean {
  if (missing.length > 0) return true;
  if (!sources) return false;
  return sources.some((source) => source.openCount.alert > 0 || source.failedCount > 0);
}
