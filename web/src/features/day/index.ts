/**
 * day feature の公開 API（barrel）。外部からは必ずこのファイル経由で import する。
 *
 * 中身（components: TaskList / TaskItem / ProgressHeader、hooks: useDay / useToggleCheck、
 * および履歴画面が readonly で再利用する DayView）は `docs/specs/08-web-today.md` の実装タスクで追加する。
 *
 * 依存ルール（docs/specs/07 §3）: features 間 import 禁止。history とは app 層で合成する。
 */
export {};
