# harness-kit: templates/web@568993f (deployed 2026-07-26)
# ==== harness-kit: verify契約（Web） ====
# エージェントの検証入口は verify / verify-fast の2つだけ。
# 最終行に「VERIFY: PASS」が出ない限り、完了と見なさない（Default-FAIL）。
#
# project-bootstrap は package.json の scripts と照合し、存在する検査だけを
# FAST_CHECKS / CHECKS に残す（ターゲット定義は消さない）。
# 検証項目がゼロのときは PASS を出さず FAIL する（空PASSの禁止）。

PM := npm

# build を含まない検査（Stop hook 用）。bootstrap が実在する scripts に合わせて編集する
# test 未導入（テストランナー無し）・e2e 未導入（Playwright 無し）のため除外 — 要確認リスト参照
FAST_CHECKS := typecheck lint
# フル検証 = FAST_CHECKS + build + e2e（e2e は Playwright 導入済みプロジェクトのみ。
# 無ければ bootstrap が CHECKS から外し要確認リストへ）
CHECKS := $(FAST_CHECKS) build

.PHONY: verify verify-fast typecheck lint test build e2e

verify: $(CHECKS)
	@test -n "$(strip $(CHECKS))" || { echo "VERIFY: FAIL (検証項目がゼロ)"; exit 1; }
	@echo "VERIFY: PASS"

verify-fast: $(FAST_CHECKS)
	@test -n "$(strip $(FAST_CHECKS))" || { echo "VERIFY-FAST: FAIL (検証項目がゼロ)"; exit 1; }
	@echo "VERIFY-FAST: PASS"

typecheck:
	@# Next.js の .next/types/*.ts は build 時に生成され、ブランチ切替後もそのまま残る。
	@# 別ブランチにしか無いページ（例 src/app/history/page.tsx）を参照したまま stale 化し、
	@# TS2307 で偽 FAIL する（2026-07-26 実測。検証ブランチで統合 verify → main へ戻ると再現）。
	@rm -rf .next/types
	$(PM) run typecheck

lint:
	$(PM) run lint

test:
	$(PM) run test

build:
	$(PM) run build

e2e:
	$(PM) run e2e
