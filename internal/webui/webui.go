package webui

import "embed"

// Assets keeps the original Go console available at /legacy during migration.
//
//go:embed assets dist
var Assets embed.FS
