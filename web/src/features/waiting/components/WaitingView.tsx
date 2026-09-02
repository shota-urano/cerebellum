'use client';

import { ErrorBanner, Toast } from '@/shared/ui';
import { useFailedCandidates, useIntakeCandidates } from '../hooks/useIntakeCandidates';
import { useIntakeDecision } from '../hooks/useIntakeDecision';
import {
  deliveryStateOf,
  groupByLane,
  hasMultipleDates,
  laneEffect,
  laneLabel,
  localToday,
} from '../lib/candidate';
import { CandidateCard } from './CandidateCard';

function Skeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      {[0, 1, 2].map((index) => (
        <section className="panel dg wt__card" key={index}>
          <p className="wt__text">
            <span className="skel" style={{ width: '88%' }}>&nbsp;</span>
          </p>
          <p className="wt__note">
            <span className="skel" style={{ width: '46%' }}>&nbsp;</span>
          </p>
        </section>
      ))}
    </div>
  );
}

/**
 * 未着の赤帯（docs/specs/23-web-waiting.md §4・docs/specs/22-daily-intake.md §3.5）。
 *
 * **空リストを「今日は候補なし」と書かない**。0件の日は正常であり、異常は「今晩の抽出が
 * 届いていない」ほう。両者は `latestReceivedAt` でしか区別できない。
 */
function NotReceived() {
  return (
    <div className="banner wt__missing" role="alert">
      <span className="mono banner__tag">🚨</span>
      <span className="banner__text">
        今晩の抽出が届いていません（daily-harness の停止か POST 失敗。ログ:{' '}
        <code className="mono dg__code">~/Library/Logs/second-brain-daily-intake.log</code>）
      </span>
    </div>
  );
}

/** 「あなた待ち」画面本体（docs/specs/23-web-waiting.md §3）。 */
export function WaitingView() {
  const { list, error, isLoading, mutate } = useIntakeCandidates();
  const { failed, failedError } = useFailedCandidates();
  const { decide, failure, retry, dismiss } = useIntakeDecision(list, mutate);

  if (error) return <ErrorBanner message={error.message} />;
  if (!list) return isLoading ? <Skeleton /> : null;

  const delivery = deliveryStateOf(list, localToday());
  const groups = groupByLane(list.items);
  const showDate = hasMultipleDates(list.items);

  return (
    <>
      <h1 className="wt__head">あなた待ち</h1>

      {delivery === 'missing' && <NotReceived />}

      {/* 失敗一覧の取得エラーは黙らせない（§3.4 の枠が「気づくため」の仕掛けなので、
          取得が落ちたこと自体を出す）。未決の一覧はそのまま下に出し、承認作業は続けられる */}
      {failedError && (
        <ErrorBanner message={'反映失敗を取得できませんでした: ' + failedError.message} />
      )}

      {/* 未処理の失敗（§3.4）。取得元は `?applyState=failed` なので過去日の失敗もここに出る。
          失敗行は `status = approved` なので未決一覧には現れず、重複しない */}
      {failed.length > 0 && (
        <section className="wt__failed" aria-label="未処理の失敗">
          <p className="mono wt__group">未処理の失敗</p>
          {failed.map((candidate) => (
            <CandidateCard key={candidate.id} candidate={candidate} showDate onDecide={decide} />
          ))}
        </section>
      )}

      {/* 拾う行が0件だった日は**正常**（§4）。異常表示にしない */}
      {delivery === 'empty' && groups.length === 0 && (
        <p className="empty">前夜のノートから拾う行はありませんでした。</p>
      )}

      {delivery === 'received' && groups.length === 0 && (
        <p className="empty">今朝の分は片付いています。</p>
      )}

      {groups.map((group) => (
        <section className="wt__lane" key={group.lane} aria-label={laneLabel(group.lane)}>
          <p className="mono wt__group wt__group--lane">
            {laneLabel(group.lane)}
            <span className="wt__count">{group.items.length}</span>
          </p>
          {/* 押した先で何が起きるかを画面上で明示する（§3.1） */}
          <p className="wt__effect">{laneEffect(group.lane)}</p>
          {group.items.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              showDate={showDate}
              onDecide={decide}
            />
          ))}
        </section>
      ))}

      {/* ✅の締切と、❌・無操作の違いを常時出す（§3.2・§3.3）。
          ハーネス承認（翌朝06:20）と時刻が違うので文言を使い回さない */}
      <p className="wt__foot">
        ✅したものが今晩00:40に反映されます。
        <br />
        捨てた行はここから消えるだけで、何も起きません。無操作の行は明日以降も残ります。
      </p>

      {/* decision の POST 失敗はトーストで再試行（§4）。巻き戻して終わりにしない */}
      {failure && (
        <Toast
          message={'記録できませんでした: ' + failure.message}
          actionLabel="再試行"
          onAction={() => void retry()}
          onDismiss={dismiss}
        />
      )}
    </>
  );
}
