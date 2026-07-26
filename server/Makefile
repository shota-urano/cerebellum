# ==== harness-kit: verify契約（Rust・手書き。kit に templates/rust は未整備） ====
# エージェントの検証入口は verify / verify-fast の2つだけ。
# 最終行に「VERIFY: PASS」が出ない限り、完了と見なさない（Default-FAIL）。
# 検証項目がゼロのときは PASS を出さず FAIL する（空PASSの禁止）。
#
# docs/specs/01-architecture.md §7 の契約:
#   fast = fmt --check / clippy -D warnings / test（release build を含まない）
#   full = fast + cargo build --release（rust-embed が ../web/out を取り込む段階では
#          web 側 build が先に必要 — ルート Makefile の PACKAGES 順で担保）

FAST_CHECKS := fmt clippy test
CHECKS := $(FAST_CHECKS) build

.PHONY: verify verify-fast fmt clippy test build

verify: $(CHECKS)
	@test -n "$(strip $(CHECKS))" || { echo "VERIFY: FAIL (検証項目がゼロ)"; exit 1; }
	@echo "VERIFY: PASS"

verify-fast: $(FAST_CHECKS)
	@test -n "$(strip $(FAST_CHECKS))" || { echo "VERIFY-FAST: FAIL (検証項目がゼロ)"; exit 1; }
	@echo "VERIFY-FAST: PASS"

fmt:
	cargo fmt --check

clippy:
	cargo clippy -- -D warnings

test:
	cargo test

build:
	cargo build --release
