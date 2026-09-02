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

/**
 * 名簿の本文（docs/specs/21-web-office-roster.md §2）。
 * 正本は各 skill の `SKILL.md` frontmatter で、`build_office.py` が office.json へ運ぶ。
 * **cerebellum 側に名簿の値を持たない**（対応表をハードコードしない・21 §4）。
 */
export interface OfficeProfile {
  /** できる仕事内容・1行 */
  job: string | null;
  /** 人間が打つコマンド（例 `/x-post`）。無ければ null */
  command: string | null;
  /**
   * 担当エージェント（例 `claude-code (opus)` / `codex`・21 §2）。
   * 正本は automation の起動コマンドで、`skill`（何の手順で動くか）とは別物。
   * 取れなければ `null`——起動コマンドから推測して埋めない（21 §3.2-3）。
   */
  agent?: string | null;
  /** 実行後に人間が確認すべきこと */
  checks: string[] | null;
  /** 所属ライン（21 §2 の値域。独立は `none`） */
  line?: string | null;
  /** 直前のノード（1-hop・21 §2 の4種） */
  upstream?: string[] | null;
  /** 直後のノード（1-hop）。`place:` ノードが「確認する場所」になる（21 §3.6-5） */
  downstream?: string[] | null;
  /** 名簿の正本の在処（例 `.claude/skills/x-post/SKILL.md`）。リンクにしない（21 §3.2-4） */
  doc: string | null;
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
  /**
   * 社員の起動方式（`scheduled` | `manual`・21 §2）。
   * `runs[].trigger`（その回がスケジュール実行か手で回したか）とは**意味が違う**ので同一視しない。
   * 生成側の対応前は届かないので optional。欠落を「手動」と読み替えない（21 §3.3-1）。
   */
  trigger?: string | null;
  /** 名簿。frontmatter 未整備の社員では丸ごと欠ける（21 §2） */
  profile?: OfficeProfile | null;
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

/** 手動起動の社員（21 §3.3-1）。`shift:null` からは推測しない——`trigger` だけを根拠にする */
export function isManualEmployee(employee: OfficeEmployee): boolean {
  return employee.trigger === 'manual';
}

/**
 * 席とカードに出す勤務形態の1行（21 §3.3-1）。
 * `trigger` が欠落しているときは `shift` があればそのラベル、無ければ従来文言のまま。
 * **`shift:null` を「手動」と読み替えない**——設定漏れと手動起動を取り違えると、
 * 設定漏れが永久に見えなくなる。
 */
export function workLabelOf(employee: OfficeEmployee): string {
  if (isManualEmployee(employee)) return '手動起動';
  return employee.shift?.label ?? '勤務時間未設定';
}

/** 欠損を欠損として出せる形に畳んだ名簿（21 §3.2-3・§6）。値を捏造しない */
export interface RosterEntry {
  job: string | null;
  command: string | null;
  agent: string | null;
  checks: string[];
  /** 所属ライン。未記載は null（`'none'` は「独立」という記載であって欠損ではない） */
  line: string | null;
  upstream: string[];
  downstream: string[];
  doc: string | null;
  /** `profile` が無い／`job` が空。画面は「名簿 未記載」を出す */
  missing: boolean;
}

/**
 * `profile` を描画用に正規化する（21 §3.2-3）。
 * 空文字・非配列・欠落をすべて「無い」に寄せるだけで、**代わりの値を作らない**。
 */
export function rosterOf(employee: OfficeEmployee): RosterEntry {
  const profile = employee.profile ?? null;
  const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value : null;
  // 非配列も落とさず空扱いにする（21 §6）
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => text(item) !== null) : [];
  const job = text(profile?.job);
  return {
    job,
    command: text(profile?.command),
    agent: text(profile?.agent),
    // 件数上限で切らない（確認すべきことが黙って消える・21 §3.2-2）
    checks: list(profile?.checks),
    line: text(profile?.line),
    upstream: list(profile?.upstream),
    downstream: list(profile?.downstream),
    doc: text(profile?.doc),
    missing: job === null,
  };
}

/** ライン（`profile.line`）の日本語ラベル（21 §3.7-2）。識別子→表示語彙の対応で、名簿の値ではない */
export const OFFICE_LINE_LABELS: Readonly<Record<string, string>> = {
  knowledge: '知識',
  x: 'X運用',
  harness: 'ハーネス',
  learning: '学習',
  note: 'note',
  incubate: '着想',
  dev: '開発',
  rakuten: '楽天',
  none: '独立',
} as const;

/** 未知の値はラベルに変えず**値そのまま**返す（落とさない・21 §3.7-3） */
export function lineLabelOf(line: string): string {
  return OFFICE_LINE_LABELS[line] ?? line;
}

/** その社員の所属ライン。未記載は null（`'none'` は記載なので null にしない） */
export function lineOf(employee: OfficeEmployee): string | null {
  return rosterOf(employee).line;
}

/** ミニラインのノード種別（21 §2 の4種＋解決できなかったもの） */
export type LineNodeKind = 'employee' | 'manual' | 'human' | 'place' | 'unknown';

export interface LineNode {
  kind: LineNodeKind;
  /** 画面に出す文字列 */
  label: string;
  /** 元の値（key に使う） */
  raw: string;
  /** 遷移先の社員。無ければ null（`human:`・`place:`・解決できない社員） */
  employeeId: string | null;
}

/**
 * `upstream` / `downstream` の値をノードへ解く（docs/specs/21-web-office-roster.md §3.6-3）。
 *
 * **解決できないものは値をそのまま出す**（21 §3.6-4・§6）。改名・削除された automation を
 * 名前で埋めたり、未知の接頭辞を落としたりしない——ラインの穴は穴として見せる。
 */
export function lineNodesOf(values: string[], employees: OfficeEmployee[]): LineNode[] {
  return values.map((raw) => {
    if (raw.startsWith('human:')) {
      // 人間の仕事。「あなた」と書いて、止まるのが自分だと分かるようにする（21 §3.6-6）
      return { kind: 'human' as const, label: 'あなた：' + raw.slice(6), raw, employeeId: null };
    }
    if (raw.startsWith('place:')) {
      return { kind: 'place' as const, label: raw.slice(6), raw, employeeId: null };
    }
    if (raw.startsWith('manual:')) {
      const command = raw.slice(7);
      // automation として登録済みの手動社員ならカードへ飛ばす。無ければ文字だけ
      const found = employees.find((employee) => rosterOf(employee).command === command);
      return {
        kind: 'manual' as const,
        label: command,
        raw,
        employeeId: found ? found.automation_id : null,
      };
    }
    const employee = employees.find((candidate) => candidate.automation_id === raw);
    return employee
      ? { kind: 'employee' as const, label: employee.name, raw, employeeId: employee.automation_id }
      : { kind: 'unknown' as const, label: raw, raw, employeeId: null };
  });
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

/** 部署内の席のブロック（21 §3.4-1）。各ブロック内は返却順のまま */
export interface RoomBlocks {
  scheduled: OfficeEmployee[];
  manual: OfficeEmployee[];
  stopped: OfficeEmployee[];
  /** 2列グリッドの総行数。部屋画像の奥行き計算に使う（21 §3.4-4） */
  rows: number;
}

/**
 * 部署の社員を 勤務帯 → 手動起動 → 停止中 の3ブロックへ分ける（21 §3.4-1）。
 * ブロック内は `employees` の返却順（勤務開始時刻の昇順）のまま——再ソートしない（§3.1-1）。
 *
 * 行数はブロックごとに切り上げて合算する。ブロックが変わると行が切り替わるので、
 * 総人数から割ると実際より少なく出て**最終行が部屋の下壁の外に出る**（21 §3.4-4）。
 */
export function roomBlocksOf(
  onDuty: OfficeEmployee[],
  stopped: OfficeEmployee[],
  roomId: OfficeRoomId,
): RoomBlocks {
  return blocksOf(onDuty, stopped, (employee) => roomOf(employee) === roomId);
}

/**
 * ライン絞り込み（21 §3.7-1）。部屋（役割）とは別軸だが、**席の並びは部署ルームと同一規則**
 * ——見た目と順序を作り分けない（別の画面ではなく絞り込みだから）。
 */
export function lineBlocksOf(
  onDuty: OfficeEmployee[],
  stopped: OfficeEmployee[],
  lineId: string,
): RoomBlocks {
  return blocksOf(onDuty, stopped, (employee) => lineOf(employee) === lineId);
}

function blocksOf(
  onDuty: OfficeEmployee[],
  stopped: OfficeEmployee[],
  belongs: (employee: OfficeEmployee) => boolean,
): RoomBlocks {
  const members = onDuty.filter(belongs);
  const blocks = {
    scheduled: members.filter((employee) => !isManualEmployee(employee)),
    manual: members.filter(isManualEmployee),
    stopped: stopped.filter(belongs),
  };
  const rows = [blocks.scheduled, blocks.manual, blocks.stopped].reduce(
    (sum, block) => sum + Math.ceil(block.length / 2),
    0,
  );
  return { ...blocks, rows };
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
