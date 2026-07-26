# harness-kit: templates/monorepo@568993f-dirty (deployed 2026-07-26)
# ==== harness-kit: verify契約（モノレポ ルート集約） ====
# エージェントの検証入口は、モノレポでも常に「ルートの verify / verify-fast」の2つだけ。
# ルートは各パッケージの verify へ委譲し、全パッケージ PASS のときだけ最終行に
# 「VERIFY: PASS」を出す（機械判定は最終行を見る。パッケージ側の PASS 行が途中に
# 混ざるのは問題ない）。
#
# bootstrap が確定する項目: PACKAGES（実在するパッケージディレクトリのみ。各ディレクトリには
# 対応プラットフォームのテンプレ Makefile が deploy-template.sh で配置済みであること）。
# PACKAGES が空のときは PASS を出さず FAIL する（空PASSの禁止）。
#
# E2E_PORT 等の環境変数は再帰 make ($(MAKE) -C) にそのまま伝播する。

# ビルド順が重要: web → server（rust-embed が web/out を取り込むため。docs/specs/01 §7）
PACKAGES := web server

.PHONY: verify verify-fast

verify:
	@test -n "$(strip $(PACKAGES))" || { echo "VERIFY: FAIL (パッケージがゼロ)"; exit 1; }
	@for p in $(PACKAGES); do $(MAKE) -C $$p verify || { echo "VERIFY: FAIL ($$p)"; exit 1; }; done
	@echo "VERIFY: PASS"

verify-fast:
	@test -n "$(strip $(PACKAGES))" || { echo "VERIFY-FAST: FAIL (パッケージがゼロ)"; exit 1; }
	@for p in $(PACKAGES); do $(MAKE) -C $$p verify-fast || { echo "VERIFY-FAST: FAIL ($$p)"; exit 1; }; done
	@echo "VERIFY-FAST: PASS"
