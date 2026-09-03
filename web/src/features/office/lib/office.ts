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
  /**
   * 人間確認の契約（docs/specs/24-inbox.md §9）。`kinds` はその skill が送る kind、
   * `cadence` は `shift`（勤務帯どおりに毎回届くべき）か `adhoc`（不定期）。
   * **`cadence: shift` の社員だけが「あなた待ち」の未着判定の対象**になる
   * （docs/specs/25-web-inbox.md §3.3）。生成側（`build_office.py`）の対応前は
   * 届かないので optional——欠落を `shift` と読み替えない。
   */
  review?: OfficeReview | null;
  /**
   * 所属部署（docs/specs/26-web-office-company.md §3.1。値域は同 §4 の8部署 id）。
   * 正本は各 skill の `SKILL.md` frontmatter で、**cerebellum に対応表を持たない**——
   * 画面は値域を検査も翻訳もしない（未知の値も文字列のまま出す・26 §6）。
   * 生成側の対応前は届かないので optional。**`line` や skill 名から推測して埋めない**（26 §9）。
   */
  dept?: string | null;
  /** 名簿の正本の在処（例 `.claude/skills/x-post/SKILL.md`）。リンクにしない（21 §3.2-4） */
  doc: string | null;
}

/**
 * 人間確認の契約（docs/specs/24-inbox.md §9）。値の正本は各 skill の `SKILL.md` frontmatter で、
 * cerebellum は受け取って使うだけ（21 §4・**対応表を持たない**）。
 * 未知の `cadence` 値も届き得るので `string` で受ける（落とさない・20 §6 と同じ姿勢）。
 */
export interface OfficeReview {
  kinds?: string[] | null;
  cadence?: string | null;
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

/**
 * 部署一覧（docs/specs/27-web-office-departments.md §2・§4）。
 *
 * 正本は second-brain の編成表で、`build_office.py` が office.json のトップレベルへ載せる
 * （同 §9 の提案）。**cerebellum に部署の順序表・日本語ラベル表を持たない**ので、
 * 届かないあいだは無いものとして扱う（見出しは id・並びは返却順・§3.1-4）。
 * 画面は値を検査しない・翻訳しない（§4）。
 */
export interface OfficeDepartment {
  id: string;
  label: string;
  /** 正本の編成表の並び（1始まりの整数） */
  order: number;
}

/** office.json 全体。`runs` は新しい順（§2） */
export interface OfficeData {
  generated_at: string | null;
  window_days: number | null;
  employees: OfficeEmployee[];
  runs: OfficeRun[];
  /** 部署一覧（27 §2）。生成側の対応前は届かない——欠落を暫定の表で埋めない（27 §3.1-4） */
  departments?: OfficeDepartment[] | null;
}

/**
 * 「部署 未記載」の部屋 id（docs/specs/27-web-office-departments.md §4）。
 * `dept` の値域と衝突しない予約語で、second-brain 側でこの id を部署に使わない。
 */
export const OFFICE_UNASSIGNED_DEPT_ID = 'unassigned';

/** 「部署 未記載」の部屋の見出し（27 §3.1-2）。部署の日本語ラベル表ではない */
export const OFFICE_UNASSIGNED_DEPT_LABEL = '部署 未記載';

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
  /** 所属部署。未記載は null（26 §3.1-3。skill 名や `line` から推測して埋めない） */
  dept: string | null;
  /**
   * 人間確認の契約（26 §3.1-1）。`null` は**欠損ではなく「人間確認なし」という正常な状態**
   * （24 §9）なので、`missing` と同じ「未記載」様式に寄せない。
   */
  review: OfficeReview | null;
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
    dept: text(profile?.dept),
    // `review` は形をそのまま持ち回る（値域の検査は生成側の責務・26 §4）
    review: profile?.review ?? null,
    doc: text(profile?.doc),
    missing: job === null,
  };
}

/** `cadence` の表示語（26 §3.1-1）。未知の値はそのまま出す（落とさない・20 §6 と同じ姿勢） */
function cadenceLabelOf(cadence: string): string {
  if (cadence === 'shift') return '勤務帯どおり毎回';
  if (cadence === 'adhoc') return '不定期';
  return cadence;
}

/**
 * 社員カード・会社案内に出す「人間確認」の1行（docs/specs/26-web-office-company.md §3.1-1）。
 *
 * `review` から**機械的に**決める。`kinds` は画面で翻訳しない（`approve` / `choose` / `read` /
 * `alert` のまま出す・§3.1-2）——「あなた待ち」（25）と語を揃えるため。
 * `null` は「人間確認: なし」で、**欠損ではなく正常な状態**（24 §9）なので
 * 21 §3.2-3 の「未記載」様式に寄せない（§3.1-1）。
 */
export function reviewLabelOf(review: OfficeReview | null | undefined): string {
  if (!review) return '人間確認: なし';
  const kinds = Array.isArray(review.kinds)
    ? review.kinds.filter((kind): kind is string => typeof kind === 'string' && kind.trim() !== '')
    : [];
  const cadence = typeof review.cadence === 'string' && review.cadence.trim() !== '' ? review.cadence : null;
  // `alert` のみ＝人間の判断を求めず異常だけ知らせる契約。ここだけ言い換える（§3.1-1）
  const body = kinds.length === 0 ? 'あり' : kinds.length === 1 && kinds[0] === 'alert' ? '異常のみ通知' : kinds.join('・');
  return '人間確認: ' + body + (cadence === null ? '' : '（' + cadenceLabelOf(cadence) + '）');
}

/** `review` を持つ社員（26 §3.2-1 の「人間確認あり n名」）。値の中身は問わない */
export function hasReview(employee: OfficeEmployee): boolean {
  return rosterOf(employee).review !== null;
}

/**
 * 名簿（`profile`）そのものが無い社員（docs/specs/26-web-office-company.md §3.2-2 の
 * 「名簿未記載 m名」）。数えるのは正本の「**カードが書けない一体**」＝ `profile` 不在だけ。
 *
 * `rosterOf().missing`（21 §3.2-3）とは**別の述語**。あちらは社員カードの表示用で
 * 「`profile` が無い／`job` が空」の両方を「名簿 未記載」に畳むが、`job` だけが空の社員は
 * カードが書けている（frontmatter はある）ので §3.2-2 の集計には入れない。
 */
export function hasNoProfile(employee: OfficeEmployee): boolean {
  return (employee.profile ?? null) === null;
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

/**
 * その社員の所属部署（docs/specs/26-web-office-company.md §3.3-1）。未記載は null。
 * **`line` や skill 名から推測して埋めない**（26 §9）——対応表を持たないので推測もできない。
 */
export function deptOf(employee: OfficeEmployee): string | null {
  return rosterOf(employee).dept;
}

/** ミニラインのノード種別（21 §2 の5種＋解決できなかったもの） */
export type LineNodeKind = 'employee' | 'manual' | 'human' | 'place' | 'dest' | 'unknown';

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
    if (raw.startsWith('dest:')) {
      // 成果物の行き先。人間が開く場所ではないので「見る場所」を付けない（21 §3.6-5・§9.2）
      return { kind: 'dest' as const, label: raw.slice(5), raw, employeeId: null };
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

/**
 * 部署絞り込み（docs/specs/26-web-office-company.md §3.3-1）。ライン絞り込みと**同型**で、
 * 部屋をまたいで `dept` 一致の社員を1フロアに出す。席・ブロック分け・状態表示は部署ルームと
 * 同一規則を流用する（別軸のグルーピングであって別の画面ではない・26 §5）。
 */
export function deptBlocksOf(
  onDuty: OfficeEmployee[],
  stopped: OfficeEmployee[],
  deptId: string,
): RoomBlocks {
  return blocksOf(onDuty, stopped, deptMemberOf(deptId));
}

/**
 * その部署（＝全景の部屋・27 §3.1-1）に属するか。`unassigned` は予約語で
 * 「`dept` が `null`／`profile` が無い」社員の束を指す（27 §3.1-2・§4）。
 */
function deptMemberOf(deptId: string): (employee: OfficeEmployee) => boolean {
  return deptId === OFFICE_UNASSIGNED_DEPT_ID
    ? (employee) => deptOf(employee) === null
    : (employee) => deptOf(employee) === deptId;
}

/**
 * 全景の1部屋（docs/specs/27-web-office-departments.md §3.1）。
 * 席・内訳は部署ルームと同じ部品で組めるように `RoomBlocks` を持つ（§3.1-6・§5）。
 */
export interface OfficeDeptRoom {
  /** 部屋 id ＝ `dept` の id。「部署 未記載」の部屋は `unassigned`（§3.2-1・§4） */
  id: string;
  /**
   * 見出しの表示名。`departments` に載っている部署だけ入る。
   * `null` の部屋は見出しに id をそのまま出す（§3.1-4）——id から表示名を推測しない。
   */
  label: string | null;
  /** 勤務帯・手動・停止中の3ブロック（返却順のまま） */
  blocks: RoomBlocks;
}

/** 部署の並びの1枠（`officeDeptRoomsOf` と `companyDeptsOf` の共通形） */
interface DeptSlot {
  id: string;
  /** `departments` に載っている部署だけ入る。`null` は「見出しに id を出す」（§3.1-4） */
  label: string | null;
}

/**
 * 部署の並び（docs/specs/27-web-office-departments.md §3.1-3）。
 *
 * `departments[].order` 昇順 → `departments` に無い `dept` 値（未知の部署）を `employees` の
 * 返却順で。`departments` が届いていないときは全部が「未知」になるので、結果として
 * **返却順で最初に現れた順**になる（§3.1-4・26 §3.4-2 のフォールバック）。
 * 値域の検査・翻訳はしない（§4）——`order` が数でないものだけ末尾へ送る。
 *
 * 「部署 未記載」は末尾に置くこと（§3.1-3）だけが共通で、束の表し方は全景（予約語
 * `unassigned` の部屋）と会社案内（`id: null` の束）で違うので、有無だけを返して
 * 呼び出し側に足させる。**全景と会社案内で並び規則を2箇所に書かない**（§3.3-1）。
 */
function orderedDeptSlotsOf(
  employees: OfficeEmployee[],
  departments: OfficeDepartment[] | null | undefined,
): { slots: DeptSlot[]; hasUnassigned: boolean } {
  const seen = new Set<string>();
  const listed = (Array.isArray(departments) ? departments : []).filter(
    (dept): dept is OfficeDepartment => {
      if (typeof dept?.id !== 'string' || dept.id.trim() === '' || seen.has(dept.id)) return false;
      // 同じ id が2回来ても部屋は1つ（社員を二重に数えない）
      seen.add(dept.id);
      return true;
    },
  );
  const rank = (dept: OfficeDepartment) =>
    typeof dept.order === 'number' && Number.isFinite(dept.order) ? dept.order : Number.MAX_SAFE_INTEGER;
  // Array#sort は安定なので、同じ order・`order` 欠落は届いた順のまま残る
  const ordered = [...listed].sort((a, b) => rank(a) - rank(b));
  const known = new Set(ordered.map((dept) => dept.id));

  // 未知の部署と「部署 未記載」の有無は返却順で拾う（停止中も数える。26 §3.4-2 と同じ理由）
  const unknown: string[] = [];
  let hasUnassigned = false;
  for (const employee of employees) {
    const dept = deptOf(employee);
    if (dept === null) hasUnassigned = true;
    else if (!known.has(dept) && !unknown.includes(dept)) unknown.push(dept);
  }

  return {
    slots: [
      ...ordered.map((dept) => ({
        id: dept.id,
        label: typeof dept.label === 'string' && dept.label.trim() !== '' ? dept.label : null,
      })),
      ...unknown.map((id) => ({ id, label: null })),
    ],
    hasUnassigned,
  };
}

/**
 * 全景に出す部屋の一覧（docs/specs/27-web-office-departments.md §3.1-1〜4）。
 * 並びと見出しは `orderedDeptSlotsOf`（§3.1-3・§3.1-4）＋末尾の「部署 未記載」。
 *
 * `departments` にあって所属0人の部署も**部屋を出す**（正本にある部署が空なのは見せるべき
 * 事実・§6）。逆に「部署 未記載」は0人なら出さない（§3.1-2）。
 */
export function officeDeptRoomsOf(
  employees: OfficeEmployee[],
  departments: OfficeDepartment[] | null | undefined,
): OfficeDeptRoom[] {
  const { slots, hasUnassigned } = orderedDeptSlotsOf(employees, departments);
  const rooms = slots.map((slot) => deptRoomOf(employees, slot.id, slot.label));
  return hasUnassigned
    ? [...rooms, deptRoomOf(employees, OFFICE_UNASSIGNED_DEPT_ID, OFFICE_UNASSIGNED_DEPT_LABEL)]
    : rooms;
}

function deptRoomOf(employees: OfficeEmployee[], id: string, label: string | null): OfficeDeptRoom {
  const { onDuty, stopped } = splitByEnabled(employees);
  return { id, label, blocks: blocksOf(onDuty, stopped, deptMemberOf(id)) };
}

/**
 * 在籍の内訳1行（21 §3.4-3 ＋ docs/specs/26-web-office-company.md §3.2）。0名の項は書かない。
 *
 * 部屋・ライン・部署のフロア（`OfficeRoomView`）と会社案内シート（§3.4-1「§3.2 の内訳」）を
 * **同じ関数で組む**。同じ形と言われているものを2箇所に書くと片方だけ直して静かにずれる。
 *
 * 人間確認・名簿未記載は**その束に出ている社員全員**（停止中を含む）で数える——
 * 名簿の設定漏れは在籍状態と独立に潰す対象なので、停止中を外すと漏れが隠れる（26 §3.2-2）。
 */
export function breakdownOf(blocks: {
  scheduled: OfficeEmployee[];
  manual: OfficeEmployee[];
  stopped: OfficeEmployee[];
}): string {
  const members = [...blocks.scheduled, ...blocks.manual, ...blocks.stopped];
  const reviewers = members.filter(hasReview).length;
  // 数えるのは `profile` 不在だけ（§3.2-2）。`job` が空の社員はカードでは「名簿 未記載」
  // （21 §3.2-3）だが frontmatter そのものはあるので、ここには混ぜない
  const unlisted = members.filter(hasNoProfile).length;
  return [
    `勤務帯 ${blocks.scheduled.length}名`,
    blocks.manual.length > 0 ? `手動 ${blocks.manual.length}名` : null,
    blocks.stopped.length > 0 ? `停止中 ${blocks.stopped.length}名` : null,
    reviewers > 0 ? `人間確認あり ${reviewers}名` : null,
    // 「カードが書けない一体は編成に載せない」を画面で可視化する。隠さない（26 §3.2-2）
    unlisted > 0 ? `名簿未記載 ${unlisted}名` : null,
  ]
    .filter((part): part is string => part !== null)
    .join('・');
}

/** 会社案内の1部署（docs/specs/26-web-office-company.md §3.4）。`id: null` は「部署 未記載」の束 */
export interface CompanyDept {
  /** 部署 id。**翻訳しない**（対応表を持たない・§4）。未記載の束は null */
  id: string | null;
  /**
   * 見出しの表示名（docs/specs/27-web-office-departments.md §3.3-2 → §3.1-5）。
   * `departments` に載っている部署だけ入り、`null` の部署は見出しに id をそのまま出す
   * （§3.1-4。26 §3.4-2 の姿）。未記載の束は「部署 未記載」で id を持たない。
   */
  label: string | null;
  /** 勤務帯の社員（返却順のまま） */
  scheduled: OfficeEmployee[];
  /** 手動起動の社員（返却順のまま） */
  manual: OfficeEmployee[];
  /** 停止中の社員。各部署の末尾に「停止中」の小見出しで出す（§3.4-4） */
  stopped: OfficeEmployee[];
}

function companyDeptOf(employees: OfficeEmployee[], id: string | null, label: string | null): CompanyDept {
  const members = employees.filter((employee) => deptOf(employee) === id);
  // 部署内の並びは 勤務帯 → 手動起動 → 停止中（21 §3.4-1 と同じ順・§3.4-4）。
  // 各ブロック内は返却順のまま——クライアントで再ソートしない（20 §3.1-1）
  const { onDuty, stopped } = splitByEnabled(members);
  return {
    id,
    label,
    scheduled: onDuty.filter((employee) => !isManualEmployee(employee)),
    manual: onDuty.filter(isManualEmployee),
    stopped,
  };
}

/**
 * 会社案内の部署の束（docs/specs/26-web-office-company.md §3.4-2 ＋
 * docs/specs/27-web-office-departments.md §3.3）。
 *
 * 並びと見出しは全景の部屋と**同じ規則**（27 §3.3-1・§3.3-2 → §3.1-3・§3.1-5）。
 * `orderedDeptSlotsOf` に寄せてあるので、`departments` があれば `order` 昇順 → 未知の部署は
 * 返却順、無ければ全部が「返却順で最初に現れた順」（＝26 §3.4-2 の姿）に自然に戻る。
 * cerebellum 側に部署の順序表・日本語ラベル表を持たない（27 §4）ので、名前順にも
 * 8部署 id の定義順にも並べ替えない。
 *
 * 最初に現れた位置は**停止中の社員も数える**——在籍状態は部署の並びと無関係で、
 * 停止中しか居ない部署だけが末尾へ押し出されるのは「返却順」ではない。
 *
 * 出す束は**名簿に社員が居る部署だけ**（26 §3.4-1「各部署に…所属社員を1行ずつ」の姿）。
 * `departments` にあって所属0人の部署に部屋を出すのは全景の規則（27 §6）で、
 * 会社案内は 27 §3.3 が並びと見出しだけを増分したので、束の集合は 26 のまま変えない。
 *
 * `dept` が `null` の社員は末尾に1束（`id: null`）でまとめる。**隠さない**（§3.4-2）——
 * 隠すと名簿の設定漏れが永久に見えなくなる（21 §3.3-1 と同じ理由）。0名なら束ごと出さない。
 */
export function companyDeptsOf(
  employees: OfficeEmployee[],
  departments: OfficeDepartment[] | null | undefined,
): CompanyDept[] {
  const { slots, hasUnassigned } = orderedDeptSlotsOf(employees, departments);
  const staffed = new Set(employees.map(deptOf));
  const depts = slots
    .filter((slot) => staffed.has(slot.id))
    .map((slot) => companyDeptOf(employees, slot.id, slot.label));
  return hasUnassigned
    ? [...depts, companyDeptOf(employees, null, OFFICE_UNASSIGNED_DEPT_LABEL)]
    : depts;
}

/**
 * 社員を 勤務帯 → 手動起動 → 停止中 の3ブロックへ分ける（21 §3.4-1）。
 * ブロック内は `employees` の返却順（勤務開始時刻の昇順）のまま——再ソートしない（20 §3.1-1）。
 *
 * 行数はブロックごとに切り上げて合算する。ブロックが変わると行が切り替わるので、
 * 総人数から割ると実際より少なく出て**最終行が部屋の下壁の外に出る**（21 §3.4-4）。
 */
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
