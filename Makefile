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

# E2E は全パッケージのビルド後に1回だけ走らせる（2026-07-27 追加）。
# 本番形＝「release バイナリが web/out を配信」なので、web verify の中では対象が存在せず、
# 順序を満たせるのはルートだけ。実体は web/ の Playwright（web/playwright.config.ts）。
E2E_PACKAGE := web

.PHONY: verify verify-fast e2e artifacts run preview-url

verify:
	@test -n "$(strip $(PACKAGES))" || { echo "VERIFY: FAIL (パッケージがゼロ)"; exit 1; }
	@for p in $(PACKAGES); do $(MAKE) -C $$p verify || { echo "VERIFY: FAIL ($$p)"; exit 1; }; done
	@if [ -n "$(strip $(E2E_PACKAGE))" ]; then \
	   $(MAKE) -C $(E2E_PACKAGE) e2e || { echo "VERIFY: FAIL (e2e)"; exit 1; }; \
	 fi
	@echo "VERIFY: PASS"

verify-fast:
	@test -n "$(strip $(PACKAGES))" || { echo "VERIFY-FAST: FAIL (パッケージがゼロ)"; exit 1; }
	@for p in $(PACKAGES); do $(MAKE) -C $$p verify-fast || { echo "VERIFY-FAST: FAIL ($$p)"; exit 1; }; done
	@echo "VERIFY-FAST: PASS"

# E2E だけを回す入口（verify の一段を単体で叩きたいとき）。
e2e:
	$(MAKE) -C $(E2E_PACKAGE) e2e

# 録画・スクショの回収は定義しているパッケージへ委譲（dev-loop の integrate-close.sh が呼ぶ）。
artifacts:
	@for p in $(PACKAGES); do \
	   if $(MAKE) -C $$p -n artifacts >/dev/null 2>&1; then \
	     $(MAKE) -C $$p artifacts ARTIFACT_DIR=$(CURDIR)/docs/loop-artifacts; fi; \
	 done

# ==== 人間が「動いているところ」を見るための入口（2026-07-27 追加） ====
# 起動コマンドの正本をここに置く。エージェントに毎回ポートや起動方法を説明するラリーが消える。
#
# 本番プロセスは :48210 に常駐しているので、プレビューは別ポート＋**本番DBのコピー**で起動する。
# 検証ブランチが migration を含んでいてもコピー側にしか当たらず、本番DBは無傷（不変性の担保）。
# 0.0.0.0 bind なので Tailscale 内の iPhone からも同じ URL で見える。
PREVIEW_PORT ?= 48212
PROD_DB      := $(HOME)/Library/Application Support/cerebellum/cerebellum.db
PREVIEW_DB   := $(HOME)/Library/Application Support/cerebellum/preview.db

# tailnet 内のどの端末からでも同じ URL で開けるように Tailscale IP を使う。
# ローカル hostname（*.local）は tailnet 外から引けず、MagicDNS 名は端末側の DNS 設定に依存する
# ——IP が一番確実（iPhone の Safari にそのまま打てる）。Tailscale が無ければ hostname に落とす。
TS_CLI := /Applications/Tailscale.app/Contents/MacOS/Tailscale
TS_IP   = $(shell $(TS_CLI) ip -4 2>/dev/null | head -1 || hostname -s)

# preview-url: 「この PJ をスマホで確認する URL」を1行で出す契約（harness-kit 共通）。
# night-shift / dev-loop はこの出力をそのまま報告へ載せる。プラットフォームごとに中身は変わるが
# **入口の名前は常に preview-url**（web=http URL / React Native=exp:// URL / iOS=リンク不可）。
preview-url:
	@echo "http://$(TS_IP):$(PREVIEW_PORT)/"

run:
	@if [ -f "$(PROD_DB)" ]; then cp "$(PROD_DB)" "$(PREVIEW_DB)"; \
	   echo "preview: 本番DBのコピーを使用（本番は無傷）"; \
	 else echo "preview: 本番DBが無いので空DBで起動"; fi
	$(MAKE) -C web build
	$(MAKE) -C server build
	@echo ""
	@echo "preview: $$($(MAKE) -s preview-url)  （tailnet 内なら iPhone からも同じ URL）"
	@echo ""
	CEREBELLUM_DB="$(PREVIEW_DB)" ./server/target/release/cerebellum serve --port $(PREVIEW_PORT)
