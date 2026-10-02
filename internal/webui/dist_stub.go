//go:build !webui_dist

package webui

import (
	"io/fs"
)

type emptyFS struct{}

func (emptyFS) Open(string) (fs.File, error) { return nil, fs.ErrNotExist }

var builtAssets fs.FS = emptyFS{}
var frontendBuilt = false
