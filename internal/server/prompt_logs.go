package server

import (
	"context"
	"net/http"
)

type promptContextKey struct{}

type promptContext struct {
	Enabled  bool
	Endpoint string
	Model    string
	Parts    []string
}

// attachUserPromptContext extracts only caller-provided user messages and
// carries them into the billing transaction. System, developer, assistant
// and provider-added context never reach usage_records.prompt_text.
func (s *Server) attachUserPromptContext(r *http.Request, k APIKey, model, endpoint string, body []byte) {
	settings, err := readJevWorkspaceSettings(r.Context(), s, k.WorkspaceID)
	if err != nil || !settings.PromptLoggingEnabled {
		return
	}
	parts := extractUserPrompts(endpoint, body)
	if len(parts) == 0 {
		return
	}
	*r = *r.WithContext(context.WithValue(r.Context(), promptContextKey{}, promptContext{Enabled: true, Endpoint: endpoint, Model: model, Parts: parts}))
}

func promptContextFrom(ctx context.Context) promptContext {
	value, _ := ctx.Value(promptContextKey{}).(promptContext)
	return value
}
