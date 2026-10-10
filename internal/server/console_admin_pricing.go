package server

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"regexp"
	"strings"
)

type storedBrand struct {
	Name         string `json:"name"`
	LogoURL      string `json:"logoUrl"`
	SupportEmail string `json:"supportEmail"`
	SupportURL   string `json:"supportUrl"`
}

type storedPricing struct {
	Addr               string `json:"addr"`
	PublicBaseURL      string `json:"publicBaseUrl"`
	AdminEmail         string `json:"adminEmail"`
	AlertWebhookURL    string `json:"alertWebhookUrl"`
	BackupRetention    int    `json:"backupRetention"`
	LogLevel           string `json:"logLevel"`
	Redact             bool   `json:"redact"`
	CodexVersion       string `json:"codexVersion"`
	RequestTimeoutMs   int64  `json:"requestTimeoutMs"`
	AutoDisableEnabled bool   `json:"autoDisableEnabled"`
	Currency           struct {
		Code   string  `json:"code"`
		Symbol string  `json:"symbol"`
		Rate   float64 `json:"rate"`
	} `json:"currency"`
	InputPrice              map[string]int64    `json:"inputPrice"`
	OutputPrice             map[string]int64    `json:"outputPrice"`
	CacheInputPrice         map[string]int64    `json:"cacheInputPrice"`
	ModelPrice              map[string]int64    `json:"modelPrice"`
	VideoPricePerSecond     map[string]int64    `json:"videoPricePerSecond"`
	EmailSettings           storedEmailSettings `json:"emailSettings"`
	Brand                   storedBrand         `json:"brand"`
	ModelTestServiceURL     string              `json:"modelTestServiceUrl"`
	ModelTestServiceEnabled bool                `json:"modelTestServiceEnabled"`
}

type pricingRequest struct {
	Currency *struct {
		Code   string `json:"code"`
		Symbol string `json:"symbol"`
	} `json:"currency"`
	InputPrice          map[string]float64 `json:"inputPrice"`
	OutputPrice         map[string]float64 `json:"outputPrice"`
	CacheInputPrice     map[string]float64 `json:"cacheInputPrice"`
	ModelPrice          map[string]float64 `json:"modelPrice"`
	VideoPricePerSecond map[string]float64 `json:"videoPricePerSecond"`
}

var pricingCurrencyCode = regexp.MustCompile(`^[A-Z]{3}$`)

func emptyPricing() storedPricing {
	var p storedPricing
	p.Addr, p.PublicBaseURL = ":3210", "http://127.0.0.1:3210"
	p.BackupRetention, p.LogLevel, p.CodexVersion = 14, "info", "0.159.2"
	p.Currency.Code, p.Currency.Symbol, p.Currency.Rate = "USD", "$", 1
	p.Brand = storedBrand{Name: "CAPI", SupportEmail: "support@capi.minapp.xin"}
	p.RequestTimeoutMs, p.AutoDisableEnabled = 120000, true
	p.ModelTestServiceURL = "https://eval.minapp.xin"
	p.ModelTestServiceEnabled = strings.TrimSpace(os.Getenv("CAPI_EVAL_SHARED_TOKEN")) != ""
	p.InputPrice, p.OutputPrice, p.CacheInputPrice = map[string]int64{}, map[string]int64{}, map[string]int64{}
	p.ModelPrice, p.VideoPricePerSecond = map[string]int64{}, map[string]int64{}
	return p
}

func (s *Server) readStoredPricing(ctx context.Context) (storedPricing, error) {
	p := emptyPricing()
	var raw string
	if err := s.Store.DB.QueryRowContext(ctx, `SELECT config_json FROM app_settings WHERE id=1`).Scan(&raw); err != nil {
		return p, err
	}
	if raw == "" || raw == "{}" {
		p.RequestTimeoutMs = s.defaultRelayTimeoutMs()
		return p, nil
	}
	var stored map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return p, err
	}
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return p, err
	}
	defaults := emptyPricing()
	if len(stored["requestTimeoutMs"]) == 0 {
		p.RequestTimeoutMs = s.defaultRelayTimeoutMs()
	}
	if len(stored["autoDisableEnabled"]) == 0 {
		p.AutoDisableEnabled = true
	}
	if p.RequestTimeoutMs < 1000 || p.RequestTimeoutMs > 600000 {
		p.RequestTimeoutMs = s.defaultRelayTimeoutMs()
	}
	if p.Addr == "" {
		p.Addr = defaults.Addr
	}
	if p.PublicBaseURL == "" {
		p.PublicBaseURL = defaults.PublicBaseURL
	}
	if p.BackupRetention < 1 {
		p.BackupRetention = defaults.BackupRetention
	}
	if p.LogLevel != "debug" && p.LogLevel != "warn" && p.LogLevel != "error" {
		p.LogLevel = defaults.LogLevel
	}
	if p.CodexVersion == "" {
		p.CodexVersion = defaults.CodexVersion
	}
	if p.Currency.Code == "" {
		p.Currency.Code = defaults.Currency.Code
	}
	if p.Currency.Symbol == "" {
		p.Currency.Symbol = defaults.Currency.Symbol
	}
	if !pricingCurrencyCode.MatchString(p.Currency.Code) || len([]rune(p.Currency.Symbol)) > 8 {
		p.Currency.Code, p.Currency.Symbol = defaults.Currency.Code, defaults.Currency.Symbol
	}
	p.Currency.Rate = 1
	if p.Brand.Name == "" {
		p.Brand.Name = defaults.Brand.Name
	}
	if p.Brand.SupportEmail == "" {
		p.Brand.SupportEmail = defaults.Brand.SupportEmail
	}
	if p.ModelTestServiceURL == "" {
		p.ModelTestServiceURL = defaults.ModelTestServiceURL
	}
	if len(stored["modelTestServiceEnabled"]) == 0 {
		p.ModelTestServiceEnabled = defaults.ModelTestServiceEnabled
	}
	if p.InputPrice == nil {
		p.InputPrice = defaults.InputPrice
	}
	if p.OutputPrice == nil {
		p.OutputPrice = defaults.OutputPrice
	}
	if p.CacheInputPrice == nil {
		p.CacheInputPrice = defaults.CacheInputPrice
	}
	if p.ModelPrice == nil {
		p.ModelPrice = defaults.ModelPrice
	}
	if p.VideoPricePerSecond == nil {
		p.VideoPricePerSecond = defaults.VideoPricePerSecond
	}
	return p, nil
}

func (s *Server) defaultRelayTimeoutMs() int64 {
	ms := s.Cfg.RelayTimeout.Milliseconds()
	if ms < 1000 || ms > 600000 {
		return 120000
	}
	return ms
}

func lookupStoredPrice(table map[string]int64, model string) (int64, bool) {
	if price, ok := table[model]; ok {
		return price, true
	}
	bestPrefix, bestPrice := "", int64(0)
	for pattern, price := range table {
		if !strings.HasSuffix(pattern, "*") {
			continue
		}
		prefix := strings.TrimSuffix(pattern, "*")
		if strings.HasPrefix(model, prefix) && len(prefix) > len(bestPrefix) {
			bestPrefix, bestPrice = prefix, price
		}
	}
	if bestPrefix != "" {
		return bestPrice, true
	}
	return 0, false
}

func displayPriceTable(table map[string]int64, rate float64) map[string]float64 {
	out := make(map[string]float64, len(table))
	for model, micros := range table {
		out[model] = float64(micros) / 1_000_000
	}
	return out
}

func validDisplayedPriceTable(table map[string]float64) bool {
	if table == nil || len(table) > 1000 {
		return false
	}
	for model, price := range table {
		if strings.TrimSpace(model) != model || model == "" || len(model) > 200 || math.IsNaN(price) || math.IsInf(price, 0) || price < 0 || price > 1e12 {
			return false
		}
	}
	return true
}

func storableDisplayedPriceTable(table map[string]float64, rate float64) bool {
	maxInt64 := float64(^uint64(0) >> 1)
	for _, price := range table {
		converted := price * 1_000_000
		if math.IsNaN(converted) || math.IsInf(converted, 0) || converted > maxInt64 {
			return false
		}
	}
	return true
}

func storeDisplayedPriceTable(table map[string]float64, rate float64) map[string]int64 {
	out := make(map[string]int64, len(table))
	for model, price := range table {
		out[strings.TrimSpace(model)] = int64(math.Round(price * 1_000_000))
	}
	return out
}

func sameModelKeys(a, b map[string]float64) bool {
	if len(a) != len(b) {
		return false
	}
	for model := range a {
		if _, ok := b[model]; !ok {
			return false
		}
	}
	return true
}

func overlapModelKeys(a, b, c map[string]float64) bool {
	for model := range a {
		for candidate := range b {
			if modelPatternsOverlap(model, candidate) {
				return true
			}
		}
		for candidate := range c {
			if modelPatternsOverlap(model, candidate) {
				return true
			}
		}
	}
	for model := range b {
		for candidate := range c {
			if modelPatternsOverlap(model, candidate) {
				return true
			}
		}
	}
	return false
}

func modelPatternsOverlap(a, b string) bool {
	aWildcard, bWildcard := strings.HasSuffix(a, "*"), strings.HasSuffix(b, "*")
	aPrefix, bPrefix := strings.TrimSuffix(a, "*"), strings.TrimSuffix(b, "*")
	switch {
	case !aWildcard && !bWildcard:
		return a == b
	case aWildcard && !bWildcard:
		return strings.HasPrefix(b, aPrefix)
	case !aWildcard && bWildcard:
		return strings.HasPrefix(a, bPrefix)
	default:
		return strings.HasPrefix(aPrefix, bPrefix) || strings.HasPrefix(bPrefix, aPrefix)
	}
}

func (s *Server) consoleAdminPricing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, 403, "forbidden", "Admin required.")
		return
	}
	if r.Method != http.MethodGet {
		s.appSettingsMu.Lock()
		defer s.appSettingsMu.Unlock()
	}
	p, err := s.readStoredPricing(r.Context())
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	if r.Method == http.MethodGet {
		writeJSON(w, 200, map[string]any{
			"currency":   map[string]string{"code": p.Currency.Code, "symbol": p.Currency.Symbol},
			"inputPrice": displayPriceTable(p.InputPrice, 1), "outputPrice": displayPriceTable(p.OutputPrice, 1),
			"cacheInputPrice": displayPriceTable(p.CacheInputPrice, 1), "modelPrice": displayPriceTable(p.ModelPrice, 1),
			"videoPricePerSecond": displayPriceTable(p.VideoPricePerSecond, 1),
		})
		return
	}
	var in pricingRequest
	if err := readJSON(r, &in); err != nil {
		apiError(w, 400, "invalid_json", "Invalid pricing configuration.")
		return
	}
	if !validDisplayedPriceTable(in.InputPrice) || !validDisplayedPriceTable(in.OutputPrice) || !validDisplayedPriceTable(in.CacheInputPrice) || !validDisplayedPriceTable(in.ModelPrice) || !validDisplayedPriceTable(in.VideoPricePerSecond) {
		apiError(w, 400, "invalid_pricing", "Prices must be non-negative finite numbers with valid model names.")
		return
	}
	if !sameModelKeys(in.InputPrice, in.OutputPrice) {
		apiError(w, 400, "invalid_pricing", "Each token-priced model needs both input and output prices.")
		return
	}
	if overlapModelKeys(in.InputPrice, in.ModelPrice, in.VideoPricePerSecond) {
		apiError(w, 400, "invalid_pricing", "Per-call and per-second prices cannot be combined with token prices or each other for the same model.")
		return
	}
	rate := 1.0
	if !storableDisplayedPriceTable(in.InputPrice, rate) || !storableDisplayedPriceTable(in.OutputPrice, rate) || !storableDisplayedPriceTable(in.CacheInputPrice, rate) || !storableDisplayedPriceTable(in.ModelPrice, rate) || !storableDisplayedPriceTable(in.VideoPricePerSecond, rate) {
		apiError(w, 400, "invalid_pricing", "A price is too large to store at the configured currency rate.")
		return
	}
	if in.Currency != nil {
		code, symbol := strings.ToUpper(strings.TrimSpace(in.Currency.Code)), strings.TrimSpace(in.Currency.Symbol)
		if !pricingCurrencyCode.MatchString(code) || symbol == "" || len([]rune(symbol)) > 8 {
			apiError(w, 400, "invalid_currency", "Currency code or symbol is invalid.")
			return
		}
		p.Currency.Code, p.Currency.Symbol = code, symbol
	}
	p.InputPrice, p.OutputPrice = storeDisplayedPriceTable(in.InputPrice, rate), storeDisplayedPriceTable(in.OutputPrice, rate)
	p.CacheInputPrice, p.ModelPrice = storeDisplayedPriceTable(in.CacheInputPrice, rate), storeDisplayedPriceTable(in.ModelPrice, rate)
	p.VideoPricePerSecond = storeDisplayedPriceTable(in.VideoPricePerSecond, rate)
	encoded, err := json.Marshal(p)
	if err != nil {
		apiError(w, 500, "encode_failed", fmt.Sprintf("Unable to encode prices: %v", err))
		return
	}
	if _, err = s.Store.DB.ExecContext(r.Context(), `UPDATE app_settings SET config_json=? WHERE id=1`, string(encoded)); err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}
	writeJSON(w, 200, map[string]bool{"saved": true})
}
