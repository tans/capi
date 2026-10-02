package webui

import (
	"embed"
	"io/fs"
	"strings"
)

// legacyAssets keeps the original Go console available at /legacy during
// migration. The React build is embedded separately at release time.
//
//go:embed assets
var legacyAssets embed.FS

var Assets fs.FS = combinedFS{legacy: legacyAssets, dist: builtAssets}

type combinedFS struct {
	legacy fs.FS
	dist   fs.FS
}

func (f combinedFS) Open(name string) (fs.File, error) {
	switch {
	case name == "assets" || strings.HasPrefix(name, "assets/"):
		return f.legacy.Open(name)
	case name == "dist" || strings.HasPrefix(name, "dist/"):
		return f.dist.Open(name)
	default:
		return nil, fs.ErrNotExist
	}
}
