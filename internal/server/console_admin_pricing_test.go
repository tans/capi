package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/tans/capi/internal/config"
	"github.com/tans/capi/internal/store"
)

func TestAdminPricingCRUDValidationAndPermissions(t *testing.T) {
	dir := t.TempDir()
	st, err := store.Open(dir + "/capi.sqlite")
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	cfg := config.Load()
	cfg.DataDir = dir
	cfg.AdminEmail = "pricing-admin@example.test"
	app := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	srv := httptest.NewServer(app.Handler())
	defer srv.Close()
	request := func(method string, input any, cookie *http.Cookie, origin string) (*http.Response, map[string]any) {
		t.Helper()
		var body io.Reader
		if input != nil {
			raw, _ := json.Marshal(input)
			body = bytes.NewReader(raw)
		}
		req, _ := http.NewRequest(method, srv.URL+"/api/admin/pricing", body)
		if input != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if cookie != nil {
			req.AddCookie(cookie)
		}
		if origin != "" {
			req.Header.Set("Origin", origin)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		result := map[string]any{}
		_ = json.NewDecoder(res.Body).Decode(&result)
		return res, result
	}
	register := func(email string) *http.Cookie {
		req, _ := http.NewRequest("POST", srv.URL+"/api/auth/register", bytes.NewBufferString(`{"name":"Pricing","email":"`+email+`","password":"pricing-password-123"}`))
		req.Header.Set("Content-Type", "application/json")
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusCreated {
			t.Fatalf("register: %d", res.StatusCode)
		}
		return res.Cookies()[0]
	}
	admin, member := register("pricing-admin@example.test"), register("pricing-member@example.test")
	if res, _ := request(http.MethodGet, nil, member, ""); res.StatusCode != http.StatusForbidden {
		t.Fatalf("member read: %d", res.StatusCode)
	}
	if res, _ := request(http.MethodPatch, map[string]any{}, admin, "https://attacker.test"); res.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin save: %d", res.StatusCode)
	}
	invalid := map[string]any{"inputPrice": map[string]float64{"m": 1}, "outputPrice": map[string]float64{}, "cacheInputPrice": map[string]float64{}, "modelPrice": map[string]float64{}, "videoPricePerSecond": map[string]float64{}}
	if res, _ := request(http.MethodPatch, invalid, admin, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("unpaired token price: %d", res.StatusCode)
	}
	invalid["inputPrice"] = map[string]float64{}
	invalid["modelPrice"] = map[string]float64{"m": 2}
	invalid["videoPricePerSecond"] = map[string]float64{"m": 3}
	if res, _ := request(http.MethodPatch, invalid, admin, ""); res.StatusCode != http.StatusBadRequest {
		t.Fatalf("mixed price modes: %d", res.StatusCode)
	}
	valid := map[string]any{"currency": map[string]string{"code": "USD", "symbol": "$"}, "inputPrice": map[string]float64{"m": 2.5}, "outputPrice": map[string]float64{"m": 10}, "cacheInputPrice": map[string]float64{"m": 1}, "modelPrice": map[string]float64{}, "videoPricePerSecond": map[string]float64{"video": 0.25}}
	if res, out := request(http.MethodPatch, valid, admin, ""); res.StatusCode != http.StatusOK || out["saved"] != true {
		t.Fatalf("save prices: %d %#v", res.StatusCode, out)
	}
	res, out := request(http.MethodGet, nil, admin, "")
	if res.StatusCode != http.StatusOK || out["inputPrice"].(map[string]any)["m"] != 2.5 || out["outputPrice"].(map[string]any)["m"] != float64(10) || out["videoPricePerSecond"].(map[string]any)["video"] != 0.25 {
		t.Fatalf("price roundtrip: %d %#v", res.StatusCode, out)
	}
}
