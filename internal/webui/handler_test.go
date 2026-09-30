package webui

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestConsoleDeepLinksAndAPIBoundary(t *testing.T) {
	for _, route := range []string{"/", "/zh", "/en/login", "/zh/dashboard/w/ws_test/channels", "/en/docs/guides/quickstart", "/legacy"} {
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
