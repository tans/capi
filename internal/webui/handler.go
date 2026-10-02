package webui

import (
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
)

// ServeHTTP serves the compiled console without a frontend runtime. API paths
// and missing assets must never fall back to HTML, even for deep links.
func ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/legacy" || r.URL.Path == "/legacy/" {
		body, _ := fs.ReadFile(Assets, "assets/index.html")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write([]byte(strings.ReplaceAll(string(body), `"/assets/`, `"/legacy/assets/`)))
		return
	}
	if strings.HasPrefix(r.URL.Path, "/legacy/assets/") {
		serveFile(w, r, "assets/"+strings.TrimPrefix(r.URL.Path, "/legacy/assets/"), false)
		return
	}
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	parts := strings.Split(name, "/")
	localized := len(parts) > 1 && (parts[0] == "en" || parts[0] == "zh")
	if localized && (name == parts[0]+"/docs" || name == parts[0]+"/docs/") {
		http.Redirect(w, r, "/"+parts[0]+"/docs/guides", http.StatusFound)
		return
	}
	if localized && parts[1] == "docs-md" {
		if !strings.HasSuffix(name, ".md") {
			name += ".md"
		}
		serveFile(w, r, "dist/"+name, false)
		return
	}
	if name != "" && name != "." {
		if info, err := fs.Stat(Assets, "dist/"+name); err == nil && !info.IsDir() {
			serveFile(w, r, "dist/"+name, strings.HasPrefix(name, "assets/"))
			return
		}
		if info, err := fs.Stat(Assets, "dist/"+name+"/index.html"); err == nil && !info.IsDir() {
			serveFile(w, r, "dist/"+name+"/index.html", false)
			return
		}
	}
	if localized && parts[1] == "docs" {
		http.NotFound(w, r)
		return
	}
	if strings.HasPrefix(name, "api/") || strings.HasPrefix(name, "v1/") || strings.HasPrefix(name, "v1beta/") || strings.HasPrefix(name, "assets/") || path.Ext(name) != "" {
		http.NotFound(w, r)
		return
	}
	if !isPage(name) {
		http.NotFound(w, r)
		return
	}
	serveFile(w, r, "dist/index.html", false)
}

func isPage(name string) bool {
	name = strings.Trim(name, "/")
	parts := strings.Split(name, "/")
	if parts[0] == "en" || parts[0] == "zh" {
		name = strings.Join(parts[1:], "/")
	}
	for _, prefix := range []string{"dashboard", "models", "docs", "docs-md"} {
		if name == prefix || strings.HasPrefix(name, prefix+"/") {
			return true
		}
	}
	switch name {
	case "", "login", "signup", "forgot-password", "invite/accept", "pricing", "teams", "skills", "contact", "privacy", "terms":
		return true
	}
	return false
}

func serveFile(w http.ResponseWriter, r *http.Request, name string, immutable bool) {
	body, err := fs.ReadFile(Assets, name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if path.Ext(name) == ".md" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	} else if contentType := mime.TypeByExtension(path.Ext(name)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	if immutable {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		w.Header().Set("Cache-Control", "no-cache")
	}
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}
