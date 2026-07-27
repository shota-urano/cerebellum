/**
 * ノートパス → Obsidian で開くリンク（docs/specs/12-web-digest.md §3.3・§4）。
 * Web では中身を表示しない（Vault を読みに行かない方針 → docs/specs/11-digest.md §7）。
 */
const VAULT_NAME = 'second-brain';

export function obsidianHref(notePath: string) {
  return (
    'obsidian://open?vault=' +
    encodeURIComponent(VAULT_NAME) +
    '&file=' +
    encodeURIComponent(notePath.replace(/\.md$/, ''))
  );
}
