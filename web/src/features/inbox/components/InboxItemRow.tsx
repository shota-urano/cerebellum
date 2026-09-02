'use client';

import type { InboxDecisionInput, InboxItemDto } from '@/shared/api';
import { CheckRing, Markdown } from '@/shared/ui';
import { decidedLabel, isFrozen, type InboxSender } from '../lib/item';

type Props = {
  item: InboxItemDto;
  /** 送信元の見せ方（名簿と突き合わせた結果・docs/specs/25-web-inbox.md §3.2・§3.4） */
  sender: InboxSender;
  /** 業務日を添えるか（今日でなければ添える。失敗枠は日をまたぐので常に添える） */
  showDate?: boolean;
  /** 決定済みとして畳んで出す（下部「今日決めたもの」と失敗枠） */
  decided?: boolean;
  /** `bodyMd` を開いているか（開閉の状態は一覧側が持つ） */
  open: boolean;
  onToggleBody: () => void;
  onDecide: (id: number, decision: InboxDecisionInput) => void;
};

/**
 * 適用失敗の帯（docs/specs/25-web-inbox.md §3.2「失敗枠」）。
 * `apply_error` は**等幅で全文**出す——原因が切れると人間が手で直せず、
 * 失敗を見せている意味が無くなる（docs/specs/18-web-harness.md §3.3 と同じ判断）。
 */
function ApplyFailure({ item }: { item: InboxItemDto }) {
  if (item.applyState !== 'failed') return null;

  return (
    <div className="wt__result" role="alert">
      <span className="wt__result__tag">🚨</span>
      <div className="wt__result__body">
        <p className="dg__text">適用失敗</p>
        {item.error && <p className="mono wt__err">{item.error}</p>}
      </div>
    </div>
  );
}

/** 未決の行の操作（docs/specs/25-web-inbox.md §3.2 の表・kind で固定）。 */
function Actions({ item, onDecide }: Pick<Props, 'item' | 'onDecide'>) {
  if (item.kind === 'alert') {
    return (
      <div className="wt__acts">
        <button
          type="button"
          className="wt__check"
          onClick={() => onDecide(item.id, { status: 'acknowledged' })}
        >
          <CheckRing done={false} />
          <span>確認</span>
        </button>
      </div>
    );
  }

  if (item.kind === 'read') {
    return (
      <div className="wt__acts">
        <button
          type="button"
          className="wt__check"
          onClick={() => onDecide(item.id, { status: 'read' })}
        >
          <CheckRing done={false} />
          <span>読んだ</span>
        </button>
      </div>
    );
  }

  if (item.kind === 'choose') {
    return (
      <>
        {/* `options` はラジオで並べ、選択した時点で `chosen`＋`choice` を送る（§3.2 の表） */}
        <div className="wt__opts" role="radiogroup" aria-label={item.title + 'の選択肢'}>
          {(item.options ?? []).map((option) => (
            <label className="wt__opt" key={option.id}>
              <input
                type="radio"
                name={'inbox-choice-' + item.id}
                value={option.id}
                checked={item.choice === option.id}
                onChange={() => onDecide(item.id, { status: 'chosen', choice: option.id })}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="wt__acts">
          <button
            type="button"
            className="mono btn wt__reject"
            onClick={() => onDecide(item.id, { status: 'rejected' })}
          >
            ❌ 却下
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="wt__acts">
      <button
        type="button"
        className="wt__check"
        onClick={() => onDecide(item.id, { status: 'approved' })}
      >
        <CheckRing done={false} />
        <span>✅ 承認</span>
      </button>
      <button
        type="button"
        className="mono btn wt__reject"
        onClick={() => onDecide(item.id, { status: 'rejected' })}
      >
        ❌ 却下
      </button>
    </div>
  );
}

/**
 * 人間待ち項目の1行（docs/specs/25-web-inbox.md §3.2）。
 * 上から 適用失敗の帯（あれば）→ 送信元＋業務日 → `title` → 操作。
 * `bodyMd` があれば `title` のタップで展開する（同 §3.2）。
 *
 * 決定済みの行は「何を決めたか」＋取り消しだけを出す（畳んだ形）。**消さない**のは、
 * ✅/❌の直後に消えると誤タップを取り消せなくなるため（同 §3.2・
 * docs/specs/17-harness-approval.md §3.3-1 と同じ救済路）。
 */
export function InboxItemRow({
  item,
  sender,
  showDate,
  decided,
  open,
  onToggleBody,
  onDecide,
}: Props) {
  // 適用が動いた行は `open` へ戻せない（サーバーも `bad_request`）。§3.2 の「その旨を出す」
  const frozen = isFrozen(item);

  return (
    <section
      className={'panel dg wt__card' + (decided ? ' wt__card--decided' : '')}
      aria-label={item.title}
    >
      <ApplyFailure item={item} />

      <p className="wt__from">
        <span className={sender.mono ? 'mono wt__from__id' : 'wt__from__name'}>{sender.label}</span>
        {/* 名簿に無い送信元も**受信は正常に扱う**。バッジは
            「`SKILL.md` frontmatter に `office:` を書け」の催促（§3.4） */}
        {sender.unregistered && <span className="mono wt__badge">名簿未登録</span>}
        {showDate && <span className="mono wt__date">{item.date}</span>}
      </p>

      {item.bodyMd ? (
        <button type="button" className="wt__title" aria-expanded={open} onClick={onToggleBody}>
          {item.title}
        </button>
      ) : (
        <p className="wt__title wt__title--flat">{item.title}</p>
      )}

      {open && item.bodyMd && (
        <div className="wt__body">
          <Markdown md={item.bodyMd} />
        </div>
      )}

      {/* `refPath` は等幅で表示のみ・リンクにしない（§3.2）。cerebellum は Vault を参照しないので
          開くのはターミナル／Obsidian の仕事。**`bodyMd` とは独立した任意フィールド**
          （docs/specs/03-api.md §3）なので、本文が無い行でも在処は消さずに出す */}
      {item.refPath && <p className="mono wt__ref">{item.refPath}</p>}

      {decided ? (
        <div className="wt__acts">
          <span className="mono wt__verdict">{decidedLabel(item)}</span>
          {frozen ? (
            <span className="wt__frozen">適用が動いた行は取り消せません</span>
          ) : (
            <button
              type="button"
              className="mono btn"
              onClick={() => onDecide(item.id, { status: 'open' })}
            >
              取り消す
            </button>
          )}
        </div>
      ) : (
        <Actions item={item} onDecide={onDecide} />
      )}
    </section>
  );
}
