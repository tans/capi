package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type cloudEvalPerf struct {
	Status       int     `json:"status"`
	TTFTMs       int64   `json:"ttft_ms"`
	TotalMs      int64   `json:"total_ms"`
	OutputTokens int     `json:"output_tokens"`
	TokensPerSec float64 `json:"tokens_per_sec"`
	Completed    bool    `json:"completed"`
}

type cloudEvalIntelTask struct {
	ID         string `json:"id"`
	Category   string `json:"category"`
	Prompt     string `json:"prompt"`
	Pass       bool   `json:"pass"`
	Detail     string `json:"detail"`
	Completion string `json:"completion"`
	MS         int64  `json:"ms"`
}

type cloudEvalIntel struct {
	Passed int                  `json:"passed"`
	Total  int                  `json:"total"`
	Score  float64              `json:"score"`
	Tasks  []cloudEvalIntelTask `json:"tasks"`
}

type cloudEvalTarget struct {
	Model      string          `json:"model"`
	OK         bool            `json:"ok"`
	StatusCode int             `json:"status_code"`
	ErrorClass string          `json:"error_class"`
	Error      string          `json:"error"`
	Perf       *cloudEvalPerf  `json:"perf"`
	Intel      *cloudEvalIntel `json:"intel"`
}

type cloudEvalRun struct {
	ID      string            `json:"id"`
	Status  string            `json:"status"`
	Results []cloudEvalTarget `json:"results"`
}

type cloudEvalCreate struct {
	RunID  string `json:"run_id"`
	Status string `json:"status"`
}

func cloudEvalURL(settings storedPricing) string {
	return strings.TrimRight(strings.TrimSpace(settings.ModelTestServiceURL), "/")
}

func (s *Server) cloudEvalEnabled(ctx context.Context) (string, string) {
	settings := s.runtimeSettings(ctx)
	token := strings.TrimSpace(os.Getenv("CAPI_EVAL_SHARED_TOKEN"))
	if !settings.ModelTestServiceEnabled || token == "" {
		return "", ""
	}
	return cloudEvalURL(settings), token
}

func (s *Server) cloudEvalRequest(ctx context.Context, method, endpoint, token string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return err
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := *s.HTTP
	client.Timeout = 20 * time.Second
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var message struct {
			Error string `json:"error"`
		}
		_ = json.Unmarshal(data, &message)
		if message.Error == "" {
			message.Error = strings.TrimSpace(string(data))
		}
		if message.Error == "" {
			message.Error = res.Status
		}
		return fmt.Errorf("cloud model test service: %s", message.Error)
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("cloud model test service returned invalid JSON: %w", err)
	}
	return nil
}

func (s *Server) runCloudEval(ctx context.Context, wid string, models, tasks []string) ([]evalRunRow, error) {
	serviceURL, token := s.cloudEvalEnabled(ctx)
	if serviceURL == "" {
		return nil, nil
	}
	key, secret, err := s.evalCredential(ctx, wid)
	if err != nil {
		return nil, err
	}
	publicURL := strings.TrimRight(strings.TrimSpace(s.runtimeSettings(ctx).PublicBaseURL), "/")
	if publicURL == "" || strings.HasPrefix(publicURL, "http://127.0.0.1") || strings.HasPrefix(publicURL, "http://localhost") {
		return nil, fmt.Errorf("cloud model test service requires a public CAPI base URL")
	}
	tasks = normalizeCloudTasks(tasks)
	started := time.Now().UTC()
	var created cloudEvalCreate
	if err := s.cloudEvalRequest(ctx, http.MethodPost, serviceURL+"/v1/test-runs", token, map[string]any{
		"capi_server": publicURL,
		"key":         secret,
		"targets":     cloudEvalModels(models),
		"tasks":       tasks,
	}, &created); err != nil {
		return nil, err
	}
	if created.RunID == "" {
		return nil, fmt.Errorf("cloud model test service did not return a run id")
	}

	deadline := time.NewTimer(30 * time.Minute)
	defer deadline.Stop()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		var run cloudEvalRun
		if err := s.cloudEvalRequest(ctx, http.MethodGet, serviceURL+"/v1/test-runs/"+created.RunID, token, nil, &run); err != nil {
			return nil, err
		}
		if run.Status == "completed" || run.Status == "failed" {
			if run.Status == "failed" && len(run.Results) == 0 {
				return nil, fmt.Errorf("cloud model test run failed")
			}
			return s.saveCloudEvalResults(ctx, key, run.Results, started)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-deadline.C:
			return nil, fmt.Errorf("cloud model test run timed out")
		case <-ticker.C:
		}
	}
}

func cloudEvalModels(models []string) []map[string]string {
	out := make([]map[string]string, 0, len(models))
	for _, model := range models {
		out = append(out, map[string]string{"model": model})
	}
	return out
}

func normalizeCloudTasks(tasks []string) []string {
	want := map[string]bool{}
	for _, task := range tasks {
		switch task {
		case "perf", "intel":
			want[task] = true
		}
	}
	if len(want) == 2 {
		return []string{"all"}
	}
	out := make([]string, 0, len(want))
	if want["perf"] {
		out = append(out, "perf")
	}
	if want["intel"] {
		out = append(out, "intel")
	}
	return out
}

func (s *Server) saveCloudEvalResults(ctx context.Context, key APIKey, results []cloudEvalTarget, started time.Time) ([]evalRunRow, error) {
	var cost int64
	_ = s.Store.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(cost_micros),0) FROM usage_records WHERE api_key_id=? AND created_at>=?`, key.ID, started.Format(time.RFC3339Nano)).Scan(&cost)
	rows := make([]evalRunRow, 0, len(results))
	perRunCost := cost
	if len(results) > 1 {
		perRunCost = cost / int64(len(results))
	}
	for _, result := range results {
		metrics := map[string]any{"taskSet": 1, "source": "cloud"}
		if result.Perf != nil {
			metrics["perf"] = map[string]any{
				"attempts":    []map[string]any{{"ttft_ms": result.Perf.TTFTMs, "total_ms": result.Perf.TotalMs, "output_tokens": result.Perf.OutputTokens, "tps": result.Perf.TokensPerSec, "error": result.Error}},
				"avg_ttft_ms": result.Perf.TTFTMs,
				"avg_ms":      result.Perf.TotalMs,
				"avg_tps":     result.Perf.TokensPerSec,
			}
		}
		var overall *float64
		if result.Intel != nil {
			tasks := make([]map[string]any, 0, len(result.Intel.Tasks))
			for _, task := range result.Intel.Tasks {
				tasks = append(tasks, map[string]any{"id": task.ID, "category": task.Category, "prompt": task.Prompt, "pass": task.Pass, "detail": task.Detail, "output": task.Completion, "ms": task.MS})
			}
			metrics["intel"] = map[string]any{"tasks": tasks, "passed": result.Intel.Passed, "total": result.Intel.Total}
			score := result.Intel.Score
			overall = &score
		}
		encoded, err := json.Marshal(metrics)
		if err != nil {
			return nil, err
		}
		row, err := s.saveEvalRun(ctx, key.WorkspaceID, "cloud", result.Model, overall, string(encoded), "", perRunCost)
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
}
