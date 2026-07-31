import type {
  HarnessKind,
  HarnessProposalDto,
  HarnessProposalsResponse,
  HarnessStatus,
} from '@/shared/api';

/** 見出し（docs/specs/18-web-harness.md §3・§4）。`kind` で言い換えるだけで構造は同じ。 */
export function headingOf(kind: HarnessKind) {
  switch (kind) {
    case 'prune':
      return '資産剪定';
    case 'model_switch':
      return '補助輪の点検';
    default:
      return 'ハーネス取り込み';
  }
}

/** 判定バッジ（docs/specs/18-web-harness.md §3.1 の表）。`adopt` は category を併記する。 */
export function badgeOf(proposal: HarnessProposalDto) {
  switch (proposal.verdict) {
    case 'adopt':
      return '🟢 採用提案' + (proposal.category ? '　' + proposal.category : '');
    case 'experiment':
      return '🧪 実験提案';
    default:
      return '⚫️ 見送り';
  }
}

/** 敵対レビューの結論（docs/specs/17-harness-approval.md §3.1）。 */
export function challengeLabel(verdict: NonNullable<HarnessProposalDto['challengeVerdict']>) {
  switch (verdict) {
    case 'hold':
      return '崩せず';
    case 'weaken':
      return '条件付き';
    default:
      return '反証あり';
  }
}

/**
 * 承認操作を受け付ける行か（docs/specs/18-web-harness.md §3.1・§4）。
 * `killed` は判定として却下済みで人間の承認対象ではなく、`applyState` が `pending` 以外の
 * 行は適用が終わっているので後から変えられない（サーバーも `bad_request` を返す）。
 */
export function isOperable(proposal: HarnessProposalDto) {
  return proposal.verdict !== 'killed' && proposal.applyState === 'pending';
}

/**
 * 表示の二段構え（docs/specs/18-web-harness.md §3.3）。
 *
 * `applyState = failed` の行は「未処理の失敗」枠として一覧の**上**に固定する
 * （失敗が下に埋もれると Slack 廃止後に気づけない）。取得元は当日一覧とは別の
 * `GET /api/harness/proposals?applyState=failed`（日付問わず・新しい順）なので、
 * **過去日の失敗も当日の画面に出る**。当日一覧側からは失敗行を落として重複を避ける。
 *
 * `failed` の取得に失敗した場合でも当日分の失敗は落とさない（同日分は当日一覧にも
 * 含まれているので、id で重ねて拾い直す）。
 */
export function splitByFailure(
  proposals: HarnessProposalDto[],
  failedAcrossDates: HarnessProposalDto[],
) {
  const seen = new Set(failedAcrossDates.map((item) => item.id));
  const sameDayFailed = proposals.filter((item) => item.applyState === 'failed' && !seen.has(item.id));
  return {
    failed: [...failedAcrossDates, ...sameDayFailed],
    rest: proposals.filter((item) => item.applyState !== 'failed'),
  };
}

/** optimistic 表示用に1件の `status` だけ差し替えた一覧を作る。 */
export function withStatus(
  list: HarnessProposalsResponse,
  id: number,
  status: HarnessStatus,
): HarnessProposalsResponse {
  return {
    ...list,
    proposals: list.proposals.map((item) => (item.id === id ? { ...item, status } : item)),
  };
}

/** サーバーが返した1件で一覧を置き換える（decision のレスポンスは単体なので合流させる）。 */
export function withProposal(
  list: HarnessProposalsResponse,
  proposal: HarnessProposalDto,
): HarnessProposalsResponse {
  return {
    ...list,
    proposals: list.proposals.map((item) => (item.id === proposal.id ? proposal : item)),
  };
}
