export type Task = {
  id: string;
  time: string;
  tool: string;
  text: string;
  done: boolean;
};

/** 今日のルーティン（完了 4 件 + 未完了 9 件）。 */
export const BASE_TASKS: Task[] = [
  { id: 't01', time: '7:30', tool: 'slack', text: 'つながり発見', done: true },
  { id: 't02', time: '7:30', tool: 'slack', text: 'ハーネス取り込み判定🔧の採用提案に✅ / →適用したくなったら /night-harness --apply', done: true },
  { id: 't03', time: '8:00', tool: 'slack | obsidian', text: '40_Projects/noteの原稿の確認', done: true },
  { id: 't04', time: '8:00', tool: 'orca', text: '40_Projectsにて新たな学習', done: true },
  { id: 't05', time: '8:30', tool: 'obsidian', text: '00_Inboxにて新たな知識', done: false },
  { id: 't06', time: '11:00', tool: '', text: 'ゴルフスイング', done: false },
  { id: 't07', time: '12:10', tool: 'slack', text: 'リポスト確認', done: false },
  { id: 't08', time: '18:30', tool: '', text: 'ランニング', done: false },
  { id: 't09', time: '22:00', tool: 'obsidian', text: '40_Projects/blindspotを確認', done: false },
  { id: 't10', time: '', tool: '-', text: '英語学習（1時間）', done: false },
  { id: 't11', time: '', tool: '', text: '読書（15分）', done: false },
  { id: 't12', time: '', tool: '', text: '夜間タスクの作成→夜間に回す（1時間）', done: false },
  { id: 't13', time: '', tool: '', text: '夜間タスクの確認', done: false },
];

export type DaySummary = { iso: string; date: string; done: number | null; total: number | null };

/** 直近 7 日（日付昇順）。done が null の日はスナップショットなし。 */
export const WEEK: DaySummary[] = [
  { iso: '2026-07-20', date: '07-20', done: 11, total: 13 },
  { iso: '2026-07-21', date: '07-21', done: 9, total: 11 },
  { iso: '2026-07-22', date: '07-22', done: null, total: null },
  { iso: '2026-07-23', date: '07-23', done: 10, total: 11 },
  { iso: '2026-07-24', date: '07-24', done: 11, total: 11 },
  { iso: '2026-07-25', date: '07-25', done: 8, total: 13 },
  { iso: '2026-07-26', date: '07-26', done: 4, total: 13 },
];

/** その日のスナップショット。存在しない日は null（=「記録なし」）。 */
export function snapshotFor(iso: string): Task[] | null {
  const day = WEEK.find((d) => d.iso === iso);
  if (!day || day.done === null || day.total === null) return null;
  return BASE_TASKS.slice(0, day.total).map((t, i) => ({ ...t, done: i < day.done! }));
}

/** 時刻とツール名の表示用メタ。ツールが空 / '-' のときは出さない。 */
export function metaOf(task: Task) {
  const tool = task.tool && task.tool !== '-' ? '[' + task.tool + ']' : '';
  return [task.time, tool].filter(Boolean).join('  ');
}
