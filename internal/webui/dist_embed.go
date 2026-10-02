//go:build webui_dist

package webui

import (
	"embed"
	"io/fs"
)

// The frontend build is generated before Go compilation and is never stored
// in the source repository.
//
//go:embed dist
var embeddedDist embed.FS

var builtAssets fs.FS = embeddedDist
var frontendBuilt = true
