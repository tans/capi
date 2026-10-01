package webui

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestConsoleDeepLinksAndAPIBoundary(t *testing.T) {
	for _, route := range []string{"/", "/zh", "/en/login", "/zh/dashboard/w/ws_test/channels", "/en/docs/guides/quickstart", "/zh/pricing", "/en/pricing", "/zh/teams", "/en/teams", "/legacy"} {
		r := httptest.NewRecorder()
		ServeHTTP(r, httptest.NewRequest("GET", route, nil))
		if r.Code != 200 || !strings.Contains(r.Header().Get("Content-Type"), "text/html") {
			t.Fatalf("%s: status=%d type=%s", route, r.Code, r.Header().Get("Content-Type"))
		}
		if r.Header().Get("Cache-Control") != "no-cache" {
			t.Fatalf("%s: entry HTML must be revalidated", route)
		}
	}
	for _, route := range []string{"/api/unknown", "/v1/unknown", "/assets/missing.js", "/unknown-page", "/en/not-a-page"} {
		r := httptest.NewRecorder()
		ServeHTTP(r, httptest.NewRequest("GET", route, nil))
		if r.Code != 404 {
			t.Fatalf("%s: wanted 404, got %d", route, r.Code)
		}
	}
}

func TestTeamsIsLocalizedAndPreRendered(t *testing.T) {
	for _, tc := range []struct{ route, heading, feature string }{
		{"/zh/teams", "统一管理共享密钥、额度和限制", "在工作区查看、搜索、下载或删除生成的图像和视频文件。"},
		{"/en/teams", "Control shared keys, budgets, and limits", "Review, search, download, or remove generated images and videos in the workspace."},
	} {
		w := httptest.NewRecorder()
		ServeHTTP(w, httptest.NewRequest(http.MethodGet, tc.route, nil))
		body := w.Body.String()
		if w.Code != http.StatusOK || !strings.Contains(body, tc.heading) || !strings.Contains(body, tc.feature) {
			t.Fatalf("%s missing localized teams content: status=%d", tc.route, w.Code)
		}
		if !strings.Contains(body, `name="description"`) || !strings.Contains(body, `rel="canonical" href="`+tc.route+`"`) {
			t.Fatalf("%s missing SEO metadata", tc.route)
		}
		if !strings.Contains(body, `href="`+strings.TrimSuffix(tc.route, "/teams")+`/contact"`) {
			t.Fatalf("%s missing localized contact CTA", tc.route)
		}
		if strings.Contains(body, "automatic expiry") || strings.Contains(body, "自动过期") {
			t.Fatalf("%s promises an unimplemented automatic file-retention policy", tc.route)
		}
	}
}

func TestPricingIsLocalizedAndPreRendered(t *testing.T) {
	for _, tc := range []struct {
		route, heading, currencyNote string
	}{
		{"/zh/pricing", "按工作区费率使用模型", "表中为示例起价"},
		{"/en/pricing", "Workspace balance for supported models", "Prices shown are examples"},
	} {
		w := httptest.NewRecorder()
		ServeHTTP(w, httptest.NewRequest(http.MethodGet, tc.route, nil))
		body := w.Body.String()
		if w.Code != http.StatusOK || !strings.Contains(body, tc.heading) || !strings.Contains(body, tc.currencyNote) {
			t.Fatalf("%s missing localized pre-rendered pricing content: status=%d", tc.route, w.Code)
		}
		if !strings.Contains(body, `name="description"`) || !strings.Contains(body, `rel="canonical" href="`+tc.route+`"`) {
			t.Fatalf("%s missing SEO metadata", tc.route)
		}
		if !strings.Contains(body, `href="`+strings.TrimSuffix(tc.route, "/pricing")+`/signup"`) {
			t.Fatalf("%s missing localized signup link", tc.route)
		}
	}
}

func TestCompiledAssetsAndLegacyFallback(t *testing.T) {
	files, err := fs.ReadDir(Assets, "dist/assets")
	if err != nil || len(files) == 0 {
		t.Fatalf("frontend build is missing: %v", err)
	}
	for _, file := range files {
		if file.IsDir() {
			continue
		}
		r := httptest.NewRecorder()
		ServeHTTP(r, httptest.NewRequest("GET", "/assets/"+file.Name(), nil))
		if r.Code != 200 || !strings.Contains(r.Header().Get("Cache-Control"), "immutable") {
			t.Fatalf("hashed asset %s is not served correctly", file.Name())
		}
		head := httptest.NewRecorder()
		ServeHTTP(head, httptest.NewRequest(http.MethodHead, "/assets/"+file.Name(), nil))
		if head.Body.Len() != 0 {
			t.Fatal("HEAD returned a body")
		}
	}
	r := httptest.NewRecorder()
	ServeHTTP(r, httptest.NewRequest("GET", "/legacy", nil))
	if !strings.Contains(r.Body.String(), "/legacy/assets/app.js") {
		t.Fatal("legacy assets escaped their namespace")
	}
}

func TestDocumentationPreRenderedHTMLAndMarkdown(t *testing.T) {
	count := 0
	err := fs.WalkDir(Assets, "dist", func(name string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.Contains(name, "/docs/") || !strings.HasSuffix(name, "/index.html") {
			return nil
		}
		count++
		route := strings.TrimSuffix(strings.TrimPrefix(name, "dist"), "/index.html")
		w := httptest.NewRecorder()
		ServeHTTP(w, httptest.NewRequest("GET", route, nil))
		body := w.Body.String()
		if w.Code != 200 || !strings.Contains(body, "<h1") || !strings.Contains(body, `name="description"`) || !strings.Contains(body, `rel="canonical" href="`+route+`"`) {
			t.Fatalf("missing prerender or metadata for %s", route)
		}
		if strings.Contains(body, "/api/v1") {
			t.Fatalf("legacy API path in %s", route)
		}
		return nil
	})
	if err != nil || count < 58 {
		t.Fatalf("incomplete documentation build: count=%d err=%v", count, err)
	}
	for _, route := range []string{"/en/docs-md/guides/quickstart", "/zh/docs-md/api/openai/chat-completions"} {
		w := httptest.NewRecorder()
		ServeHTTP(w, httptest.NewRequest("GET", route, nil))
		if w.Code != 200 || !strings.HasPrefix(w.Header().Get("Content-Type"), "text/plain") || !strings.HasPrefix(w.Body.String(), "# ") {
			t.Fatal(route, w.Code, w.Body.String())
		}
		w = httptest.NewRecorder()
		ServeHTTP(w, httptest.NewRequest("HEAD", route, nil))
		if w.Code != 200 || w.Body.Len() != 0 {
			t.Fatal("Markdown HEAD", route, w.Code)
		}
	}
	for _, route := range []string{"/zh/docs/unknown", "/en/docs-md/unknown", "/en/docs/api/unknown"} {
		w := httptest.NewRecorder()
		ServeHTTP(w, httptest.NewRequest("GET", route, nil))
		if w.Code != 404 {
			t.Fatal(route, w.Code)
		}
	}
	w := httptest.NewRecorder()
	ServeHTTP(w, httptest.NewRequest("GET", "/zh/docs", nil))
	if w.Code != http.StatusFound || w.Header().Get("Location") != "/zh/docs/guides" {
		t.Fatal("docs redirect", w.Code, w.Header())
	}
}
