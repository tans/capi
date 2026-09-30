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
