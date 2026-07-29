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
# test 未導入（テストランナー無し）のため除外 — 要確認リスト参照
FAST_CHECKS := typecheck lint
# フル検証 = FAST_CHECKS + build。
# **e2e はここに入れない**（テンプレとの相違・意図的）: このプロジェクトの E2E は
# rust-embed が web/out を取り込んだ release バイナリを起動して回すため、web verify の
# 時点ではまだ対象が存在しない。順序を満たせるルート Makefile が e2e 段を持つ
# （ルート verify: web → server → e2e）。web/Makefile は入口（e2e ターゲット）だけ提供する。
CHECKS := $(FAST_CHECKS) build

.PHONY: verify verify-fast typecheck lint test build e2e artifacts

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

# E2E の録画・スクショを docs/loop-artifacts/ へ回収する（dev-loop の integrate-close が呼ぶ）。
# TASK_ID があればファイル名に前置してタスクと動画を対応づける。
# 動画は webm で出るので、Safari/iPhone がインライン再生できる mp4 へ変換する
# （夜勤ビューアで見るため。ffmpeg が無ければ webm のまま）。
# モノレポなのでルートの docs/loop-artifacts へ集める（ルートが ARTIFACT_DIR を渡す）。
# `:=` にすると web/docs/loop-artifacts に散って夜勤ビューアが拾えない——`?=` を保つこと。
ARTIFACT_DIR ?= ../docs/loop-artifacts
artifacts:
	@mkdir -p $(ARTIFACT_DIR)
	@prefix="$${TASK_ID:+$$TASK_ID-}"; \
	 n=0; \
	 for f in $$(find test-results -name '*.webm' 2>/dev/null); do \
	   base=$$(basename "$$(dirname "$$f")"); \
	   if command -v ffmpeg >/dev/null 2>&1; then \
	     ffmpeg -y -loglevel error -i "$$f" -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
	       "$(ARTIFACT_DIR)/$${prefix}$${base}.mp4" && n=$$((n+1)); \
	   else \
	     cp "$$f" "$(ARTIFACT_DIR)/$${prefix}$${base}.webm" && n=$$((n+1)); \
	   fi; \
	 done; \
	 for f in $$(find test-results -name '*.png' 2>/dev/null); do \
	   cp "$$f" "$(ARTIFACT_DIR)/$${prefix}$$(basename "$$f")"; \
	 done; \
	 echo "ARTIFACTS: $$n 本の動画を $(ARTIFACT_DIR)/ へ回収"
