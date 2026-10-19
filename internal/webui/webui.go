package webui

import (
	"io/fs"
)

// Assets contains the compiled React frontend generated before Go compilation.
var Assets fs.FS = builtAssets
