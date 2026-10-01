package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/tans/capi/internal/provider"
)

// consoleAdminOverview reports live values from the Go relay's own stores and
// runtime configuration. The legacy retry setting is zero because Go retries
// by walking eligible channels rather than using a global retry-count setting.
func (s *Server) consoleAdminOverview(w http.ResponseWriter, r *http.Request) {
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, http.StatusForbidden, "forbidden", "Admin required.")
		return
	}
	var total, enabled, autoDisabled int
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*),COALESCE(SUM(enabled),0),COALESCE(SUM(CASE WHEN auto_disabled_at IS NOT NULL THEN 1 ELSE 0 END),0) FROM channels`).Scan(&total, &enabled, &autoDisabled); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}

	groups, err := s.adminOverviewGroups(r)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}

	var totalRequests, recentRequests int64
	var recentMicros int64
	since := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339Nano)
	if err := s.Store.DB.QueryRowContext(r.Context(), `SELECT COUNT(*),COALESCE(SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END),0),COALESCE(SUM(CASE WHEN created_at>=? THEN cost_micros ELSE 0 END),0) FROM usage_records`, since, since).Scan(&totalRequests, &recentRequests, &recentMicros); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	pricing, err := s.readStoredPricing(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	amount := float64(recentMicros) / 1_000_000 * pricing.Currency.Rate
	groupRatios := map[string]float64{}
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT name,ratio FROM model_groups WHERE enabled=1 ORDER BY name`)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	for rows.Next() {
		var name string
		var ratio float64
		if err = rows.Scan(&name, &ratio); err != nil {
			rows.Close()
			apiError(w, http.StatusInternalServerError, "database_error", err.Error())
			return
		}
		groupRatios[name] = ratio
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	rows.Close()

	writeJSON(w, http.StatusOK, map[string]any{
		"channels": map[string]int{"total": total, "enabled": enabled, "autoDisabled": autoDisabled},
		"groups":   groups,
		"usage": map[string]any{
			"total_requests": totalRequests,
			"requests_24h":   recentRequests,
			"amount_24h":     amount,
			"currency":       pricing.Currency.Code,
		},
		"settings": map[string]any{
			"retryTimes":         0,
			"autoDisableEnabled": s.autoDisable.Load(),
			"requestTimeoutMs":   s.relayTimeout().Milliseconds(),
			"fallbackModelRatio": 1,
			"groupRatio":         groupRatios,
		},
	})
}

func (s *Server) adminOverviewGroups(r *http.Request) (map[string]int, error) {
	groupRows, err := s.Store.DB.QueryContext(r.Context(), `SELECT name FROM model_groups WHERE enabled=1`)
	if err != nil {
		return nil, err
	}
	enabledGroups := map[string]bool{}
	for groupRows.Next() {
		var name string
		if err := groupRows.Scan(&name); err != nil {
			groupRows.Close()
			return nil, err
		}
		enabledGroups[name] = true
	}
	if err := groupRows.Err(); err != nil {
		groupRows.Close()
		return nil, err
	}
	groupRows.Close()
	rows, err := s.Store.DB.QueryContext(r.Context(), `SELECT models_json,config_json FROM channels WHERE enabled=1`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	modelsByGroup := map[string]map[string]struct{}{}
	for rows.Next() {
		var modelsJSON, configJSON string
		if err := rows.Scan(&modelsJSON, &configJSON); err != nil {
			return nil, err
		}
		var models []string
		if json.Unmarshal([]byte(modelsJSON), &models) != nil {
			continue
		}
		cfg, err := provider.DecodeChannelConfig(configJSON)
		if err != nil {
			continue
		}
		groups := cfg.Groups
		if len(groups) == 0 {
			groups = []string{"default"}
		}
		for _, group := range groups {
			if !enabledGroups[group] {
				continue
			}
			if modelsByGroup[group] == nil {
				modelsByGroup[group] = map[string]struct{}{}
			}
			for _, model := range models {
				if model != "" {
					modelsByGroup[group][model] = struct{}{}
				}
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	counts := make(map[string]int, len(modelsByGroup))
	for group, models := range modelsByGroup {
		if len(models) > 0 {
			counts[group] = len(models)
		}
	}
	return counts, nil
}
