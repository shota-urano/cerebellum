/**
 * 「オフィス」画面のデータ形と派生ロジック（docs/specs/20-web-office.md §2・§3）。
 *
 * office.json は cerebellum のサーバー API ではなく、夜勤ビューアと同じ :48310 が配信する
 * 外部データ（正本は second-brain の `.claude/scripts/build_office.py`）。したがって
 * `shared/api/types.ts`（docs/specs/03-api.md の手動同期先）には置かない（AGENTS.md ルール6）。
 *
 * このファイルは I/O を持たない（取得は `hooks/useOffice.ts`）。
 */

/** 勤務帯（automation のスケジュール）。`label` は生成側で組み済み（例 `毎日 01:00`） */
export interface OfficeShift {
  hour: number;
  minute: number;
  /** `毎日` | `平日` | `週末` | `月・水` … 生成側の表記そのまま */
  days: string;
  label: string;
}

/** 1社員 = 1 automation。並びは勤務開始時刻の昇順で返る（§2） */
export interface OfficeEmployee {
  /** 安定キー。`name` は改名されるので同一視しない（§2） */
  automation_id: string;
  name: string;
  /** prompt から取れたときだけ入る（素のシェル実行ジョブは null。名前を捏造しない・§2） */
  skill: string | null;
  enabled: boolean;
  shift: OfficeShift | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_id: string | null;
}

/**
 * 1 run。`outcome` の判定は生成側の責務で、画面は受け取った値で塗るだけ（§3.4）。
 * 既定値は `failed` | `running` | `produced` | `none` | `unknown` だが、**未知の値も届き得る**
 * （§6「`outcome` が未知の値 → unknown と同じ中立様式で描く」）ので `string` で受ける。
 */
export interface OfficeRun {
  run_id: string;
  automation_id: string;
  /** その run 当時の表示名（現在名は employee.name。同一視しない・§2） */
  title: string;
  run_number: string | null;
  scheduled_for: string | null;
  started_at: string | null;
  status: string | null;
  /** `scheduled` | `manual` */
  trigger: string | null;
  outcome: string | null;
  items: number | string | null;
  note: string | null;
  headline: string | null;
  /** 報告全文。直近3日の run にだけ入る（それより古いものは null・§2） */
  output: string | null;
  truncated: boolean | null;
}

/** office.json 全体。`runs` は新しい順（§2） */
export interface OfficeData {
  generated_at: string | null;
  window_days: number | null;
  employees: OfficeEmployee[];
  runs: OfficeRun[];
}

export type OfficeRoomId = 'library' | 'lab' | 'market' | 'studio';

export interface OfficeRoom {
  id: OfficeRoomId;
  label: string;
  name: string;
}

export const OFFICE_ROOMS: readonly OfficeRoom[] = [
  { id: 'library', label: 'LIBRARY', name: 'Library Room' },
  { id: 'lab', label: 'LAB', name: 'Laboratory' },
  { id: 'market', label: 'MARKET', name: 'Market Room' },
  { id: 'studio', label: 'STUDIO', name: 'Writing Room' },
] as const;

export function isOfficeRoomId(value: string | null): value is OfficeRoomId {
  return OFFICE_ROOMS.some((room) => room.id === value);
}

/**
 * skill 名を4つの役割空間へ畳む。状態判定ではなく表示上の分類だけを担う。
 * 未知・null は情報の集積地点である LIBRARY に置き、社員を画面から消さない。
 */
export function roomOf(employee: OfficeEmployee): OfficeRoomId {
  // skill が取れない素の automation も消さないため、現在名は分類の補助にだけ使う。
  const role = `${employee.skill ?? ''} ${employee.name}`.toLowerCase();
  if (/market|benchmark|ベンチ|フォロワー/.test(role)) return 'market';
  if (/write|publish|pdca|post|reply|quote|ポスト|リプ|引用/.test(role)) return 'studio';
  if (/harness|study|seed|experiment|incubate|blindspot|auto-plug|ハーネス|ブラインド/.test(role)) return 'lab';
  return 'library';
}

/**
 * MY DESK に届く件数。自然文は読まず、生成側の機械可読トレーラだけを使う。
 * note が完全一致で「承認待ち」の produced run を1つの依頼とし、items が正の数ならその件数。
 */
export function actionCountOf(run: OfficeRun | undefined): number {
  if (!run || run.outcome !== 'produced' || run.note !== '承認待ち') return 0;
  const items = typeof run.items === 'number' ? run.items : Number(run.items);
  return Number.isFinite(items) && items > 0 ? Math.floor(items) : 1;
}

/** 状態表示の色調（§3.2）。`neutral` は「色で語らない」＝ muted で headline を読ませる */
export type StateTone = 'bad' | 'live' | 'good' | 'neutral';

/** 行の右肩に出す「直近 run の状態」（§3.2 の表を1つに畳んだもの） */
export interface ShiftState {
  /** 状態ラベル。空文字なら描かない */
  label: string;
  tone: StateTone;
  /** 併記する補足（`note`・次回予定など）。無ければ null */
  note: string | null;
  /** 当日 run が無いときの直近実行日（§3.2 末尾の補助表示）。当日なら null */
  lastDate: string | null;
}

/**
 * ローカル（Asia/Tokyo）の `YYYY-MM-DD`。
 *
 * この画面は cerebellum のサーバーを経由しない（§2）ので、`GET /api/days/today` の
 * サーバー由来の日付は使えない。日付境界は深夜0時・ローカルタイム（AGENTS.md）なので
 * 端末時計のローカル日付で判定する。鮮度判定（§6）も同じ理由で端末時計を使う。
 */
export function localDate(now: Date): string {
  const p = (v: number) => String(v).padStart(2, '0');
  return now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
}

/**
 * ISO 文字列の日付部分。office.json の時刻は生成側で Asia/Tokyo に解決済みなので、
 * **画面で時差計算をしない**（§2）——先頭10文字をそのまま使う。
 */
function dateOf(iso: string | null): string | null {
  return iso && iso.length >= 10 ? iso.slice(0, 10) : null;
}

/** ISO 文字列の `MM/DD HH:MM`（次回予定の表示用）。 */
function whenOf(iso: string | null): string | null {
  const date = dateOf(iso);
  if (!date || !iso || iso.length < 16) return date;
  return date.slice(5) + ' ' + iso.slice(11, 16);
}

/**
 * 生成が古いときの経過時間（§6）。24時間未満なら null（警告を出さない）。
 * エラーにはしない——生成の停止に気付けるようにするための表示。
 */
export function staleHours(generatedAt: string | null, now: number): number | null {
  if (!generatedAt) return null;
  const at = Date.parse(generatedAt);
  if (Number.isNaN(at)) return null;
  const hours = Math.floor((now - at) / 3_600_000);
  return hours >= 24 ? hours : null;
}

/**
 * 在籍と停止中に分ける（§3.1-4）。`enabled: false` は帯に混ぜず最後にまとめる。
 * どちらも**返却順のまま**（勤務開始時刻の昇順。クライアントで再ソートしない・§3.1-1）。
 */
export function splitByEnabled(employees: OfficeEmployee[]) {
  return {
    onDuty: employees.filter((employee) => employee.enabled !== false),
    stopped: employees.filter((employee) => employee.enabled === false),
  };
}

/** その社員の直近 run（`runs` は新しい順なので先頭一致で足りる・§3.2） */
export function lastRunOf(runs: OfficeRun[], automationId: string): OfficeRun | undefined {
  return runs.find((run) => run.automation_id === automationId);
}

/**
 * 直近 run の状態表示を1つ決める（§3.2 の優先順）。
 * `outcome` が未知の値のときは中立様式（§6）。0件（`none`）はエラーにしない（§4）。
 */
export function shiftStateOf(
  employee: OfficeEmployee,
  run: OfficeRun | undefined,
  today: string,
): ShiftState {
  if (!run) {
    const next = whenOf(employee.next_run_at);
    return {
      label: 'まだ実行なし',
      tone: 'neutral',
      note: next ? '次回 ' + next : null,
      lastDate: null,
    };
  }

  // 当日分が無い社員（週次・平日限定）が毎日「未実行」に見えないようにする（§3.2 末尾）
  const runDate = dateOf(run.scheduled_for) ?? dateOf(run.started_at);
  const lastDate = runDate && runDate !== today ? runDate : null;

  switch (run.outcome) {
    case 'failed':
      return { label: '失敗', tone: 'bad', note: run.note, lastDate };
    case 'running':
      return { label: '実行中', tone: 'live', note: null, lastDate };
    case 'produced':
      return {
        label: run.items === null ? '成果あり' : '成果あり ' + String(run.items) + '件',
        tone: 'good',
        note: run.note,
        lastDate,
      };
    case 'none':
      return { label: '今日は無し', tone: 'neutral', note: null, lastDate };
    default:
      // unknown・未知の値（§6）。色で語らず headline を読ませるので、ラベルは
      // 判定を含まない事実（実行時刻）だけにする。当日でなければ日付側に譲る
      return {
        label: lastDate ? '' : (run.started_at ?? run.scheduled_for ?? '').slice(11, 16),
        tone: 'neutral',
        note: null,
        lastDate,
      };
  }
}
