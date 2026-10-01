package server

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"
)

type adminPricingCurrency struct {
	Code   string  `json:"code"`
	Symbol string  `json:"symbol"`
	Rate   float64 `json:"rate"`
}

func (s *Server) consoleAdminSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && !s.sameOrigin(r) {
		apiError(w, http.StatusForbidden, "bad_origin", "Origin is not allowed.")
		return
	}
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, http.StatusForbidden, "forbidden", "Admin required.")
		return
	}
	if r.Method != http.MethodGet {
		s.appSettingsMu.Lock()
		defer s.appSettingsMu.Unlock()
	}
	settings, err := s.readStoredPricing(r.Context())
	if err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, adminSettingsProjection(settings))
		return
	}
	if r.Method != http.MethodPatch {
		apiError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Unsupported settings operation.")
		return
	}
	var fields map[string]json.RawMessage
	if readJSON(r, &fields) != nil || len(fields) == 0 {
		apiError(w, http.StatusBadRequest, "invalid_settings", "Settings must be a non-empty JSON object.")
		return
	}
	for key := range fields {
		if key != "requestTimeoutMs" && key != "autoDisableEnabled" && key != "pricingCurrency" {
			apiError(w, http.StatusBadRequest, "unknown_setting", "Unknown system setting.")
			return
		}
	}
	var in struct {
		RequestTimeoutMs   *int64                `json:"requestTimeoutMs"`
		AutoDisableEnabled *bool                 `json:"autoDisableEnabled"`
		PricingCurrency    *adminPricingCurrency `json:"pricingCurrency"`
	}
	encoded, _ := json.Marshal(fields)
	if json.Unmarshal(encoded, &in) != nil {
		apiError(w, http.StatusBadRequest, "invalid_settings", "Invalid system settings.")
		return
	}
	if in.RequestTimeoutMs != nil {
		if *in.RequestTimeoutMs < 1000 || *in.RequestTimeoutMs > 600000 {
			apiError(w, http.StatusBadRequest, "invalid_timeout", "Request timeout must be between 1000 and 600000 milliseconds.")
			return
		}
		settings.RequestTimeoutMs = *in.RequestTimeoutMs
	}
	if in.AutoDisableEnabled != nil {
		settings.AutoDisableEnabled = *in.AutoDisableEnabled
	}
	if in.PricingCurrency != nil {
		currency := in.PricingCurrency
		currency.Code = strings.ToUpper(strings.TrimSpace(currency.Code))
		currency.Symbol = strings.TrimSpace(currency.Symbol)
		if !pricingCurrencyCode.MatchString(currency.Code) || currency.Symbol == "" || len([]rune(currency.Symbol)) > 8 || math.IsNaN(currency.Rate) || math.IsInf(currency.Rate, 0) || currency.Rate < 1e-6 || currency.Rate > 1e6 {
			apiError(w, http.StatusBadRequest, "invalid_currency", "Currency needs a three-letter code, a symbol up to 8 characters, and a rate between 0.000001 and 1000000 units per USD.")
			return
		}
		settings.Currency.Code, settings.Currency.Symbol, settings.Currency.Rate = currency.Code, currency.Symbol, currency.Rate
	}
	stored, err := json.Marshal(settings)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "encode_failed", "Unable to encode system settings.")
		return
	}
	if _, err := s.Store.DB.ExecContext(r.Context(), `UPDATE app_settings SET config_json=? WHERE id=1`, string(stored)); err != nil {
		apiError(w, http.StatusInternalServerError, "database_error", err.Error())
		return
	}
	s.runtimeTimeout.Store(settings.RequestTimeoutMs * 1_000_000)
	s.autoDisable.Store(settings.AutoDisableEnabled)
	writeJSON(w, http.StatusOK, adminSettingsProjection(settings))
}

func adminSettingsProjection(settings storedPricing) map[string]any {
	return map[string]any{
		"requestTimeoutMs":   settings.RequestTimeoutMs,
		"autoDisableEnabled": settings.AutoDisableEnabled,
		"pricingCurrency": map[string]any{
			"code": settings.Currency.Code, "symbol": settings.Currency.Symbol, "rate": settings.Currency.Rate,
		},
	}
}
