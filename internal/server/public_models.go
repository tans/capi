package server

import (
	"encoding/json"
	"net/http"
	"strings"
)

type publicModel struct {
	ID                     string   `json:"id"`
	Provider               string   `json:"provider"`
	Protocol               string   `json:"protocol"`
	InputMicrosPerMillion  int64    `json:"inputMicrosPerMillion"`
	OutputMicrosPerMillion int64    `json:"outputMicrosPerMillion"`
	Capabilities           []string `json:"capabilities"`
}

// publicModels lists models made visible by enabled platform-owned channels.
// Workspace channels and upstream credentials are never included.
func (s *Server) publicModels(w http.ResponseWriter, r *http.Request) {
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT name,protocol,models_json,price_input_micros_per_million,price_output_micros_per_million FROM channels WHERE enabled=1 AND workspace_id IS NULL ORDER BY priority DESC,created_at ASC`)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	defer rows.Close()
	seen := map[string]bool{}
	data := make([]publicModel, 0)
	for rows.Next() {
		var name, protocolName, raw string
		var input, output int64
		if err = rows.Scan(&name, &protocolName, &raw, &input, &output); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		var ids []string
		if json.Unmarshal([]byte(raw), &ids) != nil {
			continue
		}
		for _, id := range ids {
			if id == "" || id == "*" || seen[id] {
				continue
			}
			seen[id] = true
			data = append(data, publicModel{ID: id, Provider: name, Protocol: protocolName, InputMicrosPerMillion: input, OutputMicrosPerMillion: output, Capabilities: modelCapabilities(id, protocolName)})
		}
	}
	if err = rows.Err(); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]any{"data": data})
}

func modelCapabilities(id, protocolName string) []string {
	lower := strings.ToLower(id)
	if strings.Contains(lower, "image") || strings.Contains(lower, "imagen") {
		return []string{"image"}
	}
	if strings.Contains(lower, "video") || strings.Contains(lower, "veo") || strings.Contains(lower, "kling") || strings.Contains(lower, "sora") {
		return []string{"video"}
	}
	if strings.Contains(lower, "audio") || strings.Contains(lower, "tts") || strings.Contains(lower, "suno") {
		return []string{"audio"}
	}
	if strings.Contains(lower, "embed") || strings.Contains(lower, "jev") {
		return []string{"utility"}
	}
	if protocolName == "gemini" || protocolName == "anthropic" || protocolName == "openai" {
		return []string{"text"}
	}
	return []string{"text"}
}
