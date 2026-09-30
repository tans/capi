package provider

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/tans/capi/internal/store"
)

type Channel struct {
	ID, Name, Protocol, BaseURL, APIKey           string
	Config                                        ChannelConfig
	WorkspaceID                                   *string
	Models                                        []string
	Priority, Weight                              int
	Enabled                                       bool
	InputMicrosPerMillion, OutputMicrosPerMillion int64
}

func Accessible(ctx context.Context, st *store.Store, workspaceID string, model string) ([]Channel, error) {
	rows, err := st.DB.QueryContext(ctx, `SELECT id,workspace_id,name,protocol,base_url,api_key,models_json,priority,weight,enabled,price_input_micros_per_million,price_output_micros_per_million,config_json FROM channels WHERE enabled=1 AND (workspace_id=? OR (workspace_id IS NULL AND COALESCE((SELECT allow_platform_channels FROM workspaces WHERE id=?),0)=1)) ORDER BY priority DESC, created_at ASC`, workspaceID, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Channel
	for rows.Next() {
		var c Channel
		var ws sql.NullString
		var modelsJSON, configJSON string
		var enabled int
		if err := rows.Scan(&c.ID, &ws, &c.Name, &c.Protocol, &c.BaseURL, &c.APIKey, &modelsJSON, &c.Priority, &c.Weight, &enabled, &c.InputMicrosPerMillion, &c.OutputMicrosPerMillion, &configJSON); err != nil {
			return nil, err
		}
		if ws.Valid {
			v := ws.String
			c.WorkspaceID = &v
		}
		c.Enabled = enabled == 1
		_ = json.Unmarshal([]byte(modelsJSON), &c.Models)
		c.Config, err = DecodeChannelConfig(configJSON)
		if err != nil {
			return nil, err
		}
		if model != "" && !serves(c.Models, model) {
			continue
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func ListModels(ctx context.Context, st *store.Store, workspaceID string) ([]string, error) {
	cs, err := Accessible(ctx, st, workspaceID, "")
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var out []string
	for _, c := range cs {
		for _, m := range c.Models {
			if m != "" && !seen[m] {
				seen[m] = true
				out = append(out, m)
			}
		}
	}
	return out, nil
}
func serves(models []string, model string) bool {
	for _, m := range models {
		if m == model || m == "*" {
			return true
		}
		if strings.HasSuffix(m, "/*") && strings.HasPrefix(model, strings.TrimSuffix(m, "*")) {
			return true
		}
	}
	return false
}
func Create(ctx context.Context, st *store.Store, c Channel) error {
	b, _ := json.Marshal(c.Models)
	config, _ := json.Marshal(c.Config)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := st.DB.ExecContext(ctx, `INSERT INTO channels(id,workspace_id,name,protocol,base_url,api_key,models_json,priority,weight,enabled,price_input_micros_per_million,price_output_micros_per_million,created_at,updated_at,config_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, c.ID, c.WorkspaceID, c.Name, c.Protocol, strings.TrimRight(c.BaseURL, "/"), c.APIKey, string(b), c.Priority, c.Weight, boolInt(c.Enabled), c.InputMicrosPerMillion, c.OutputMicrosPerMillion, now, now, string(config))
	return err
}
func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
func GetByID(ctx context.Context, st *store.Store, id string) (Channel, error) {
	var c Channel
	var ws sql.NullString
	var modelsJSON, configJSON string
	var enabled int
	err := st.DB.QueryRowContext(ctx, `SELECT id,workspace_id,name,protocol,base_url,api_key,models_json,priority,weight,enabled,price_input_micros_per_million,price_output_micros_per_million,config_json FROM channels WHERE id=?`, id).Scan(&c.ID, &ws, &c.Name, &c.Protocol, &c.BaseURL, &c.APIKey, &modelsJSON, &c.Priority, &c.Weight, &enabled, &c.InputMicrosPerMillion, &c.OutputMicrosPerMillion, &configJSON)
	if err != nil {
		return c, err
	}
	if ws.Valid {
		v := ws.String
		c.WorkspaceID = &v
	}
	c.Enabled = enabled == 1
	_ = json.Unmarshal([]byte(modelsJSON), &c.Models)
	c.Config, err = DecodeChannelConfig(configJSON)
	return c, err
}
