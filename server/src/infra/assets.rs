use axum::{
    body::Body,
    http::{
        HeaderValue, Method, StatusCode, Uri,
        header::{CACHE_CONTROL, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

const INDEX_PATH: &str = "index.html";
const ASSET_CACHE_CONTROL: &str = "public, max-age=3600";
const INDEX_CACHE_CONTROL: &str = "no-cache";

#[derive(RustEmbed)]
#[folder = "../web/out"]
struct Assets;

pub async fn serve(method: Method, uri: Uri) -> Response {
    if method != Method::GET && method != Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }

    response_for_path(uri.path(), method == Method::HEAD)
}

/// 静的 export のルート解決（docs/specs/06-cli-serve.md §3.3）。
///
/// `next build` は `/history` を `history.html` として出力するので、拡張子なしの
/// パスは `{path}.html`（と、後方互換で `{path}/index.html`）を試してから
/// SPA フォールバックへ落とす。これをしないと深いリンクが常にトップ画面になる。
fn resolve(requested_path: &str) -> Option<(String, rust_embed::EmbeddedFile)> {
    let trimmed = requested_path.trim_end_matches('/');
    let candidates = [
        requested_path.to_owned(),
        format!("{trimmed}.html"),
        format!("{trimmed}/{INDEX_PATH}"),
    ];
    candidates
        .into_iter()
        .find_map(|candidate| Assets::get(&candidate).map(|asset| (candidate, asset)))
}

fn response_for_path(uri_path: &str, head_only: bool) -> Response {
    let requested_path = uri_path.trim_start_matches('/');
    let requested_path = if requested_path.is_empty() {
        INDEX_PATH
    } else {
        requested_path
    };

    let (served_path, asset) = match resolve(requested_path) {
        Some(found) => found,
        None => match Assets::get(INDEX_PATH) {
            Some(index) => (INDEX_PATH.to_owned(), index),
            None => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        },
    };

    // ページ HTML はビルドごとに中身が変わるので、index 以外の .html も no-cache にする
    let cache_control = if served_path.ends_with(".html") {
        INDEX_CACHE_CONTROL
    } else {
        ASSET_CACHE_CONTROL
    };
    let body = if head_only {
        Body::empty()
    } else {
        Body::from(asset.data)
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, content_type(&served_path))
        .header(CACHE_CONTROL, HeaderValue::from_static(cache_control))
        .body(body)
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn content_type(path: &str) -> HeaderValue {
    let value = match path.rsplit_once('.').map(|(_, extension)| extension) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js" | "mjs") => "application/javascript; charset=utf-8",
        Some("json" | "map") => "application/json",
        Some("webmanifest") => "application/manifest+json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    };
    HeaderValue::from_static(value)
}

#[cfg(test)]
mod tests {
    use axum::{
        body::to_bytes,
        http::{StatusCode, header::CACHE_CONTROL},
    };

    use super::{ASSET_CACHE_CONTROL, Assets, INDEX_CACHE_CONTROL, response_for_path};

    /// 返った本文が、埋め込み済みの `expected_asset` と**バイト一致**するかを見る。
    /// 画面固有の文言はクライアント描画で静的 HTML に出ないため、文字列検索では判定できない。
    async fn assert_serves(path: &str, expected_asset: &str) {
        let response = response_for_path(path, false);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[CACHE_CONTROL], INDEX_CACHE_CONTROL);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("embedded html body should be readable");
        let expected = Assets::get(expected_asset).expect("export should contain the page");
        assert_eq!(
            body.as_ref(),
            expected.data.as_ref(),
            "{path} should serve {expected_asset}"
        );
    }

    #[tokio::test]
    async fn root_and_unknown_routes_fall_back_to_index_without_caching() {
        for path in ["/", "/missing/route"] {
            assert_serves(path, "index.html").await;
        }
    }

    /// 拡張子なしの実在ルートは `{path}.html` を返す（docs/specs/06-cli-serve.md §3.3）。
    /// ここが index にフォールバックすると、深いリンクが全部トップ画面になる。
    #[tokio::test]
    async fn extensionless_routes_resolve_to_their_exported_html() {
        assert_serves("/history", "history.html").await;
        assert_serves("/routines", "routines.html").await;
        assert_serves("/history/", "history.html").await;
    }

    #[tokio::test]
    async fn embedded_static_assets_receive_the_fixed_cache_policy() {
        let response = response_for_path("/manifest.webmanifest", false);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[CACHE_CONTROL], ASSET_CACHE_CONTROL);
        assert_eq!(
            response.headers()[axum::http::header::CONTENT_TYPE],
            "application/manifest+json"
        );
    }

    #[tokio::test]
    async fn head_returns_headers_without_the_asset_body() {
        let response = response_for_path("/", true);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[CACHE_CONTROL], INDEX_CACHE_CONTROL);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("HEAD body should be readable");
        assert!(body.is_empty());
    }
}
