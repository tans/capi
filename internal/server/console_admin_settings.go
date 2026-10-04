package server

import (
	"encoding/json"
	"net/http"
	"strings"
)

type adminPricingCurrency struct {
	Code   string `json:"code"`
	Symbol string `json:"symbol"`
}

type adminBrand struct {
	Name         string `json:"name"`
	LogoURL      string `json:"logoUrl"`
	SupportEmail string `json:"supportEmail"`
	SupportURL   string `json:"supportUrl"`
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
		switch key {
		case "requestTimeoutMs", "autoDisableEnabled", "pricingCurrency", "brand", "addr", "publicBaseUrl", "adminEmail", "jevUrl", "alertWebhookUrl", "backupRetention", "logLevel", "redact", "codexVersion":
		default:
			apiError(w, http.StatusBadRequest, "unknown_setting", "Unknown system setting.")
			return
		}
	}
	var in struct {
		RequestTimeoutMs   *int64                `json:"requestTimeoutMs"`
		AutoDisableEnabled *bool                 `json:"autoDisableEnabled"`
		PricingCurrency    *adminPricingCurrency `json:"pricingCurrency"`
		Brand              *adminBrand           `json:"brand"`
		Addr               *string               `json:"addr"`
		PublicBaseURL      *string               `json:"publicBaseUrl"`
		AdminEmail         *string               `json:"adminEmail"`
		JEVURL             *string               `json:"jevUrl"`
		AlertWebhookURL    *string               `json:"alertWebhookUrl"`
		BackupRetention    *int                  `json:"backupRetention"`
		LogLevel           *string               `json:"logLevel"`
		Redact             *bool                 `json:"redact"`
		CodexVersion       *string               `json:"codexVersion"`
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
	if in.Addr != nil {
		settings.Addr = strings.TrimSpace(*in.Addr)
	}
	if in.PublicBaseURL != nil {
		settings.PublicBaseURL = strings.TrimRight(strings.TrimSpace(*in.PublicBaseURL), "/")
	}
	if in.AdminEmail != nil {
		settings.AdminEmail = strings.ToLower(strings.TrimSpace(*in.AdminEmail))
	}
	if in.JEVURL != nil {
		settings.JEVURL = strings.TrimRight(strings.TrimSpace(*in.JEVURL), "/")
	}
	if in.AlertWebhookURL != nil {
		settings.AlertWebhookURL = strings.TrimSpace(*in.AlertWebhookURL)
	}
	if in.BackupRetention != nil {
		if *in.BackupRetention < 1 || *in.BackupRetention > 100000 {
			apiError(w, http.StatusBadRequest, "invalid_retention", "Backup retention must be between 1 and 100000.")
			return
		}
		settings.BackupRetention = *in.BackupRetention
	}
	if in.LogLevel != nil {
		level := strings.ToLower(strings.TrimSpace(*in.LogLevel))
		if level != "debug" && level != "info" && level != "warn" && level != "error" {
			apiError(w, http.StatusBadRequest, "invalid_log_level", "Log level must be debug, info, warn, or error.")
			return
		}
		settings.LogLevel = level
	}
	if in.Redact != nil {
		settings.Redact = *in.Redact
	}
	if in.CodexVersion != nil {
		settings.CodexVersion = strings.TrimSpace(*in.CodexVersion)
	}
	if in.PricingCurrency != nil {
		currency := in.PricingCurrency
		currency.Code = strings.ToUpper(strings.TrimSpace(currency.Code))
		currency.Symbol = strings.TrimSpace(currency.Symbol)
		if !pricingCurrencyCode.MatchString(currency.Code) || currency.Symbol == "" || len([]rune(currency.Symbol)) > 8 {
			apiError(w, http.StatusBadRequest, "invalid_currency", "Currency needs a three-letter code and a symbol up to 8 characters.")
			return
		}
		settings.Currency.Code, settings.Currency.Symbol, settings.Currency.Rate = currency.Code, currency.Symbol, 1
	}
	if in.Brand != nil {
		brand := in.Brand
		brand.Name, brand.LogoURL, brand.SupportEmail, brand.SupportURL = strings.TrimSpace(brand.Name), strings.TrimSpace(brand.LogoURL), strings.TrimSpace(brand.SupportEmail), strings.TrimSpace(brand.SupportURL)
		if len([]rune(brand.Name)) < 1 || len([]rune(brand.Name)) > 80 || len(brand.LogoURL) > 2048 || len(brand.SupportEmail) > 254 || len(brand.SupportURL) > 2048 {
			apiError(w, http.StatusBadRequest, "invalid_brand", "Brand name, logo URL, or support details are invalid.")
			return
		}
		if brand.LogoURL != "" && !strings.HasPrefix(brand.LogoURL, "https://") && !strings.HasPrefix(brand.LogoURL, "http://") {
			apiError(w, http.StatusBadRequest, "invalid_brand_logo", "Logo URL must use HTTP or HTTPS.")
			return
		}
		if brand.SupportEmail != "" && !strings.Contains(brand.SupportEmail, "@") || brand.SupportURL != "" && !strings.HasPrefix(brand.SupportURL, "http") {
			apiError(w, http.StatusBadRequest, "invalid_brand_support", "Support email or URL is invalid.")
			return
		}
		settings.Brand = storedBrand{Name: brand.Name, LogoURL: brand.LogoURL, SupportEmail: brand.SupportEmail, SupportURL: brand.SupportURL}
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
	writeJSON(w, http.StatusOK, adminSettingsProjection(settings))
}

func adminSettingsProjection(settings storedPricing) map[string]any {
	return map[string]any{
		"addr": settings.Addr, "publicBaseUrl": settings.PublicBaseURL,
		"adminEmail": settings.AdminEmail, "jevUrl": settings.JEVURL, "alertWebhookUrl": settings.AlertWebhookURL,
		"backupRetention": settings.BackupRetention, "logLevel": settings.LogLevel, "redact": settings.Redact,
		"codexVersion":       settings.CodexVersion,
		"requestTimeoutMs":   settings.RequestTimeoutMs,
		"autoDisableEnabled": settings.AutoDisableEnabled,
		"pricingCurrency": map[string]any{
			"code": settings.Currency.Code, "symbol": settings.Currency.Symbol,
		},
		"brand": settings.Brand,
	}
}
