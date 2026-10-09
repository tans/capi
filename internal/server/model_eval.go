package server

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/tans/capi/internal/auth"
	"github.com/tans/capi/internal/protocol"
	"github.com/tans/capi/internal/provider"
)

// Model eval: built-in performance/intelligence probes plus storage and
// display of imported external benchmark results (lm-eval, BFCL, tau-bench).
// Built-in runs go through the normal relay path so routing, protocol
// translation, usage records and billing behave like any other request.

type evalTask struct {
	ID        string
	Category  string
	Prompt    string
	MaxTokens int
	Check     func(output string) (pass bool, detail string)
}

var evalPerfPrompt = "Count from 1 to 20, separated by single spaces, on one line."

var evalTaskSet = []evalTask{
	{
		ID: "math-arithmetic", Category: "math", MaxTokens: 32,
		Prompt: "What is 17 * 24? Answer with only the number.",
		Check: func(out string) (bool, string) {
			if strings.Contains(strings.TrimSpace(out), "408") {
				return true, ""
			}
			return false, "expected 408"
		},
	},
	{
		ID: "math-time", Category: "math", MaxTokens: 32,
		Prompt: "A train leaves at 09:15 and the trip takes 2 hours 40 minutes. What time does it arrive? Use 24-hour format and answer with only HH:MM.",
		Check: func(out string) (bool, string) {
			if strings.Contains(strings.TrimSpace(out), "11:55") {
				return true, ""
			}
			return false, "expected 11:55"
		},
	},
	{
		ID: "logic-syllogism", Category: "logic", MaxTokens: 96,
		Prompt: "All bloops are razzles. Some razzles are lazzes. Must all bloops therefore be lazzes? Answer yes or no, then one short sentence.",
		Check: func(out string) (bool, string) {
			lower := strings.ToLower(strings.TrimSpace(out))
			if strings.HasPrefix(lower, "no") || strings.Contains(lower, "not necessarily") || strings.Contains(lower, "do not have to") || strings.Contains(lower, "cannot be determined") {
				return true, ""
			}
			return false, "expected a rejection"
		},
	},
	{
		ID: "logic-counting", Category: "logic", MaxTokens: 32,
		Prompt: "How many letters of the English alphabet come before the letter M? Answer with only the number.",
		Check: func(out string) (bool, string) {
			if strings.Contains(strings.TrimSpace(out), "12") {
				return true, ""
			}
			return false, "expected 12"
		},
	},
	{
		ID: "instruction-exact", Category: "instruction-following", MaxTokens: 32,
		Prompt: "Reply with exactly these words and nothing else: blue elephant",
		Check: func(out string) (bool, string) {
			if strings.EqualFold(strings.TrimSpace(out), "blue elephant") {
				return true, ""
			}
			return false, "expected exactly \"blue elephant\""
		},
	},
	{
		ID: "instruction-format", Category: "instruction-following", MaxTokens: 64,
		Prompt: "List the numbers 1 through 5, one per line. No other text.",
		Check: func(out string) (bool, string) {
			out = strings.ToLower(strings.TrimSpace(out))
			ok := true
			for _, digit := range []string{"1", "2", "3", "4", "5"} {
				if !strings.Contains(out, digit) {
					ok = false
				}
			}
			if ok && strings.ContainsAny(out, "abcdefghijklmnopqrstuvwxyz") {
				ok = false
			}
			if ok {
				return true, ""
			}
			return false, "expected only the digits 1-5"
		},
	},
	{
		ID: "coding-palindrome", Category: "coding", MaxTokens: 160,
		Prompt: "Write a Python function named is_palindrome that takes a string s and returns True if it reads the same forwards and backwards. Code only.",
		Check: func(out string) (bool, string) {
			lower := strings.ToLower(out)
			if strings.Contains(lower, "def") && strings.Contains(lower, "is_palindrome") {
				return true, ""
			}
			return false, "expected a Python function definition"
		},
	},
	{
		ID: "reasoning-precision", Category: "reasoning", MaxTokens: 64,
		Prompt: "Which is heavier: a kilogram of iron or a kilogram of feathers? Answer in one sentence.",
		Check: func(out string) (bool, string) {
			lower := strings.ToLower(out)
			if strings.Contains(lower, "same") || strings.Contains(lower, "equal") || strings.Contains(lower, "neither") || strings.Contains(lower, "weigh") {
				return true, ""
			}
			return false, "expected them to weigh the same"
		},
	},
}

var evalKindPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,40}$`)

// sseRecorder captures a relayed SSE stream so the runner can measure time to
// first token and recover content/usage after the fact.
type sseRecorder struct {
	mu      sync.Mutex
	status  int
	firstAt time.Time
	buf     bytes.Buffer
}

func (r *sseRecorder) Header() http.Header            { return http.Header{} }
func (r *sseRecorder) WriteHeader(code int)           { r.status = code }
func (r *sseRecorder) Write(p []byte) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.firstAt.IsZero() {
		r.firstAt = time.Now()
	}
	return r.buf.Write(p)
}

func (r *sseRecorder) ttft() time.Duration {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.firstAt.IsZero() {
		return 0
	}
	return time.Since(r.firstAt)
}

func (r *sseRecorder) body() []byte {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]byte(nil), r.buf.Bytes()...)
}

type evalSSEChunk struct {
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
	} `json:"usage"`
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

func parseEvalSSE(raw []byte) (content string, outputTokens int) {
	var b strings.Builder
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var chunk evalSSEChunk
		if json.Unmarshal([]byte(payload), &chunk) != nil {
			continue
		}
		if chunk.Usage != nil {
			outputTokens = chunk.Usage.CompletionTokens
		}
		for _, c := range chunk.Choices {
			b.WriteString(c.Delta.Content)
		}
	}
	return b.String(), outputTokens
}

// evalContent extracts the completion text from an OpenAI-format response.
func evalContent(raw []byte) string {
	var resp struct {
		Choices []struct {
			Message struct {
				Content json.RawMessage `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(raw, &resp) != nil || len(resp.Choices) == 0 {
		return ""
	}
	content := resp.Choices[0].Message.Content
	if len(content) == 0 {
		return ""
	}
	var text string
	if json.Unmarshal(content, &text) == nil {
		return text
	}
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(content, &parts) == nil {
		var b strings.Builder
		for _, p := range parts {
			if p.Type == "text" {
				b.WriteString(p.Text)
			}
		}
		return b.String()
	}
	return ""
}

// evalKey returns the workspace's synthetic API key used for built-in runs so
// usage records and billing attribute to a real, named key.
func (s *Server) evalKey(ctx context.Context, wid string) (APIKey, error) {
	id := "ev_" + wid
	sum := sha256.Sum256([]byte("capi-eval-key:" + id))
	hash := hex.EncodeToString(sum[:])
	if _, err := s.Store.DB.ExecContext(ctx,
		`INSERT OR IGNORE INTO api_keys(id,workspace_id,name,key_hash,key_prefix,secret,scopes,enabled,created_at)
		 VALUES(?,?,'Model eval',?,?,?,'*',1,?)`,
		id, wid, hash, hash[:12], auth.RandomID("sk_eval_"), time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
		return APIKey{}, err
	}
	var k APIKey
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT id,workspace_id,scopes FROM api_keys WHERE id=?`, id).Scan(&k.ID, &k.WorkspaceID, &k.Scopes); err != nil {
		return APIKey{}, err
	}
	return k, nil
}

func evalCost(ch provider.Channel, u protocol.Usage) int64 {
	if ch.InputMicrosPerMillion <= 0 && ch.OutputMicrosPerMillion <= 0 {
		return 0
	}
	cost, err := tokenCost(ch, u.Input, u.Output)
	if err != nil {
		return 0
	}
	return cost
}

// runEvalModel executes the selected probes for one model through the relay
// path and returns normalized metrics, the estimated upstream cost and the
// intelligence score (nil when intel probes were not run).
func (s *Server) runEvalModel(ctx context.Context, r *http.Request, k APIKey, model string, perf, intel bool) (map[string]any, int64, *float64) {
	metrics := map[string]any{"taskSet": 1}
	var cost int64
	var score *float64
	if perf {
		attempts := []map[string]any{}
		var ttfts, totals []int64
		var tpsValues []float64
		for i := 0; i < 3; i++ {
			body, _ := json.Marshal(map[string]any{
				"model": model, "stream": true, "max_tokens": 64,
				"messages": []map[string]string{{"role": "user", "content": evalPerfPrompt}},
			})
			rec := &sseRecorder{}
			started := time.Now()
			err := s.relayStream(rec, r, k, model, model, "/v1/chat/completions", body, "")
			attempt := map[string]any{}
			if err != nil || rec.status != http.StatusOK {
				message := err.Error()
				if message == "" {
					message = "all channels failed"
				}
				attempt["error"] = message
				attempts = append(attempts, attempt)
				continue
			}
			content, outputTokens := parseEvalSSE(rec.body())
			totalMS := time.Since(started).Milliseconds()
			ttftMS := rec.ttft().Milliseconds()
			attempt["ttft_ms"] = ttftMS
			attempt["total_ms"] = totalMS
			attempt["output_tokens"] = outputTokens
			attempt["output"] = content
			if totalMS > 0 && outputTokens > 0 {
				tps := float64(outputTokens) / (float64(totalMS) / 1000)
				attempt["tps"] = float64(int(tps*100) / 100)
				tpsValues = append(tpsValues, tps)
			}
			ttfts = append(ttfts, ttftMS)
			totals = append(totals, totalMS)
			attempts = append(attempts, attempt)
		}
		avg := func(values []int64) any {
			if len(values) == 0 {
				return nil
			}
			sum := int64(0)
			for _, v := range values {
				sum += v
			}
			return sum / int64(len(values))
		}
		metrics["perf"] = map[string]any{
			"attempts":    attempts,
			"avg_ttft_ms": avg(ttfts),
			"avg_ms":      avg(totals),
			"avg_tps":     avgFloat(tpsValues),
		}
	}
	if intel {
		results := []map[string]any{}
		passed := 0
		for _, task := range evalTaskSet {
			body, _ := json.Marshal(map[string]any{
				"model": model, "stream": false, "max_tokens": task.MaxTokens,
				"messages": []map[string]string{{"role": "user", "content": task.Prompt}},
			})
			result := map[string]any{"id": task.ID, "category": task.Category, "prompt": task.Prompt}
			raw, meta, err := s.relayBufferedDetailed(r, k, model, model, "/v1/chat/completions", body, "")
			if err != nil {
				result["pass"] = false
				result["detail"] = err.Error()
				results = append(results, result)
				continue
			}
			cost += evalCost(meta.Channel, meta.Usage)
			content := evalContent(raw)
			result["output"] = content
			pass, detail := task.Check(content)
			result["pass"] = pass
			if detail != "" {
				result["detail"] = detail
			}
			if pass {
				passed++
			}
			results = append(results, result)
		}
		metrics["intel"] = map[string]any{
			"tasks":  results,
			"passed": passed,
			"total":  len(evalTaskSet),
		}
		s := float64(passed) / float64(len(evalTaskSet))
		score = &s
	}
	return metrics, cost, score
}

func avgFloat(values []float64) any {
	if len(values) == 0 {
		return nil
	}
	sum := 0.0
	for _, v := range values {
		sum += v
	}
	v := sum / float64(len(values))
	return float64(int(v*100) / 100)
}

type evalRunRow struct {
	ID           string
	Kind         string
	Model        string
	OverallScore sql.NullFloat64
	Metrics      string
	Raw          string
	CostMicros   int64
	CreatedAt    string
}

func (row evalRunRow) object() map[string]any {
	var metrics any
	_ = json.Unmarshal([]byte(row.Metrics), &metrics)
	out := map[string]any{
		"id":           row.ID,
		"kind":         row.Kind,
		"model":        row.Model,
		"metrics":      metrics,
		"cost_micros":  row.CostMicros,
		"created_at":   row.CreatedAt,
	}
	if row.OverallScore.Valid {
		out["overall_score"] = row.OverallScore.Float64
	}
	if row.Raw != "" {
		out["raw"] = row.Raw
	}
	return out
}

func (s *Server) saveEvalRun(ctx context.Context, wid string, kind, model string, overall *float64, metrics, raw string, cost int64) (evalRunRow, error) {
	id := auth.RandomID("eval_")
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := s.Store.DB.ExecContext(ctx,
		`INSERT INTO eval_runs(id,workspace_id,kind,model,overall_score,metrics_json,raw_json,cost_micros,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
		id, wid, kind, model, overall, metrics, raw, cost, now)
	if err != nil {
		return evalRunRow{}, err
	}
	return evalRunRow{ID: id, Kind: kind, Model: model, OverallScore: sql.NullFloat64{Valid: overall != nil, Float64: derefFloat(overall)}, Metrics: metrics, Raw: raw, CostMicros: cost, CreatedAt: now}, nil
}

func derefFloat(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

func (s *Server) listEvalRuns(ctx context.Context, wid string) ([]evalRunRow, error) {
	rows, err := s.Store.DB.QueryContext(ctx,
		`SELECT id,kind,model,overall_score,metrics_json,raw_json,cost_micros,created_at FROM eval_runs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200`, wid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []evalRunRow{}
	for rows.Next() {
		var row evalRunRow
		if err := rows.Scan(&row.ID, &row.Kind, &row.Model, &row.OverallScore, &row.Metrics, &row.Raw, &row.CostMicros, &row.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (s *Server) evalRunByID(ctx context.Context, wid, id string) (evalRunRow, error) {
	var row evalRunRow
	err := s.Store.DB.QueryRowContext(ctx,
		`SELECT id,kind,model,overall_score,metrics_json,raw_json,cost_micros,created_at FROM eval_runs WHERE id=? AND workspace_id=?`, id, wid).
		Scan(&row.ID, &row.Kind, &row.Model, &row.OverallScore, &row.Metrics, &row.Raw, &row.CostMicros, &row.CreatedAt)
	return row, err
}

// consoleModelEval handles the list, detail, delete and import routes.
func (s *Server) consoleModelEval(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	id := r.PathValue("id")
	switch r.Method {
	case http.MethodGet:
		if _, _, ok := s.consoleAccess(w, r, false); !ok {
			return
		}
		if id != "" {
			row, err := s.evalRunByID(r.Context(), wid, id)
			if err != nil {
				apiError(w, 404, "not_found", "Eval run not found.")
				return
			}
			writeJSON(w, 200, map[string]any{"data": row.object()})
			return
		}
		runs, err := s.listEvalRuns(r.Context(), wid)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		data := []map[string]any{}
		for _, row := range runs {
			data = append(data, row.object())
		}
		writeJSON(w, 200, map[string]any{"data": data})
	case http.MethodDelete:
		if id == "" {
			apiError(w, 400, "invalid_id", "id is required.")
			return
		}
		if _, _, ok := s.consoleAccess(w, r, false); !ok {
			return
		}
		result, err := s.Store.DB.ExecContext(r.Context(), `DELETE FROM eval_runs WHERE id=? AND workspace_id=?`, id, wid)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		if count, _ := result.RowsAffected(); count == 0 {
			apiError(w, 404, "not_found", "Eval run not found.")
			return
		}
		writeJSON(w, 200, map[string]any{"ok": true})
	case http.MethodPost:
		s.consoleModelEvalImport(w, r, wid)
	default:
		apiError(w, 405, "method_not_allowed", "Method not allowed.")
	}
}

// consoleModelEvalImport accepts an external benchmark result. Auth: a console
// session or a workspace API key (so the local eval runner can post results).
func (s *Server) consoleModelEvalImport(w http.ResponseWriter, r *http.Request, wid string) {
	if r.Header.Get("Authorization") != "" {
		k, err := s.authenticateAPI(r, "llm.chat")
		if err != nil {
			apiError(w, 401, "unauthorized", "A valid API key is required.")
			return
		}
		if k.WorkspaceID != wid {
			apiError(w, 403, "forbidden", "The API key does not belong to this workspace.")
			return
		}
	} else if _, _, ok := s.consoleAccess(w, r, false); !ok {
		return
	}
	var in struct {
		Kind         string         `json:"kind"`
		Model        string         `json:"model"`
		OverallScore *float64      `json:"overall_score"`
		Metrics      map[string]any `json:"metrics"`
		Raw          string         `json:"raw"`
	}
	if readJSON(r, &in) != nil {
		apiError(w, 400, "invalid_json", "Invalid eval import.")
		return
	}
	in.Kind = strings.TrimSpace(in.Kind)
	in.Model = strings.TrimSpace(in.Model)
	if !evalKindPattern.MatchString(in.Kind) {
		apiError(w, 400, "invalid_kind", "kind must be 1-40 letters, digits, dashes or underscores.")
		return
	}
	if in.Model == "" || len(in.Model) > 200 {
		apiError(w, 400, "invalid_model", "model is required (max 200 characters).")
		return
	}
	if in.OverallScore != nil && (*in.OverallScore < 0 || *in.OverallScore > 1) {
		apiError(w, 400, "invalid_score", "overall_score must be between 0 and 1.")
		return
	}
	metrics := map[string]any{}
	if in.Metrics != nil {
		metrics = in.Metrics
	}
	metricsBytes, err := json.Marshal(metrics)
	if err != nil || len(metricsBytes) > 1<<20 {
		apiError(w, 400, "metrics_too_large", "metrics must be a JSON object of at most 1 MiB.")
		return
	}
	if len(in.Raw) > 2<<20 {
		apiError(w, 400, "raw_too_large", "raw must be at most 2 MiB.")
		return
	}
	row, err := s.saveEvalRun(r.Context(), wid, in.Kind, in.Model, in.OverallScore, string(metricsBytes), in.Raw, 0)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 201, map[string]any{"data": row.object()})
}

// consoleModelEvalRun executes the built-in probes and stores one run per model.
func (s *Server) consoleModelEvalRun(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := s.consoleAccess(w, r, false); !ok {
		return
	}
	wid := r.PathValue("wid")
	var in struct {
		Models []string `json:"models"`
		Tasks  []string `json:"tasks"`
	}
	if readJSON(r, &in) != nil {
		apiError(w, 400, "invalid_json", "Invalid run request.")
		return
	}
	perf, intel := false, false
	for _, task := range in.Tasks {
		switch task {
		case "perf":
			perf = true
		case "intel":
			intel = true
		case "":
			// ignore
		default:
			apiError(w, 400, "invalid_task", "tasks must be a subset of [perf, intel].")
			return
		}
	}
	if !perf && !intel {
		perf, intel = true, true
	}
	models := []string{}
	for _, model := range in.Models {
		model = strings.TrimSpace(model)
		if model != "" && len(model) <= 200 {
			models = append(models, model)
		}
	}
	if len(models) == 0 {
		apiError(w, 400, "invalid_models", "At least one model is required.")
		return
	}
	if len(models) > 5 {
		apiError(w, 400, "too_many_models", "Test at most 5 models per run.")
		return
	}
	key, err := s.evalKey(r.Context(), wid)
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	runs := []map[string]any{}
	for _, model := range models {
		metrics, cost, overall := s.runEvalModel(r.Context(), r, key, model, perf, intel)
		metricsBytes, _ := json.Marshal(metrics)
		row, err := s.saveEvalRun(r.Context(), wid, "capi", model, overall, string(metricsBytes), "", cost)
		if err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		runs = append(runs, row.object())
	}
	writeJSON(w, 200, map[string]any{"data": runs})
}
