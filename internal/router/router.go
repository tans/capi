package router

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/tans/capi/internal/provider"
)

type Rest struct {
	Until  time.Time
	Reason string
	Status int
}
type Trace struct {
	Time        time.Time `json:"time"`
	Workspace   string    `json:"workspace,omitempty"`
	Affinity    string    `json:"affinity,omitempty"`
	Model       string    `json:"model"`
	RoutedModel string    `json:"routedModel,omitempty"`
	Order       []string  `json:"order"`
	Tries       []Try     `json:"tries"`
	Selected    string    `json:"selected,omitempty"`
}
type Try struct {
	Channel string `json:"channel"`
	Status  int    `json:"status"`
	Reason  string `json:"reason,omitempty"`
	Millis  int64  `json:"ms"`
}
type Router struct {
	mu       sync.Mutex
	resting  map[string]Rest
	affinity map[string]string
	traces   []Trace
	rnd      *rand.Rand
	db       *sql.DB
}

func New() *Router {
	return &Router{resting: map[string]Rest{}, affinity: map[string]string{}, rnd: rand.New(rand.NewSource(time.Now().UnixNano()))}
}
func (r *Router) SetPersistence(db *sql.DB) { r.db = db }
func (r *Router) Choose(channels []provider.Channel) (provider.Channel, error) {
	return r.ChooseFor(channels, "")
}
func (r *Router) ChooseFor(channels []provider.Channel, affinity string) (provider.Channel, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	if affinity != "" {
		if r.db != nil {
			var id string
			if r.db.QueryRow(`SELECT channel_id FROM conversation_affinity WHERE scope=? AND updated_at>?`, affinity, now.Add(-24*time.Hour).UTC().Format(time.RFC3339Nano)).Scan(&id) == nil {
				r.affinity[affinity] = id
			}
		}
		if id := r.affinity[affinity]; id != "" {
			for _, c := range channels {
				if c.ID == id {
					if rest, ok := r.resting[c.ID]; !ok || !now.Before(rest.Until) {
						return c, nil
					}
				}
			}
		}
	}
	bestPriority := -1 << 30
	var candidates []provider.Channel
	for _, c := range channels {
		if rest, ok := r.resting[c.ID]; ok {
			if now.Before(rest.Until) {
				continue
			}
			delete(r.resting, c.ID)
		}
		if c.Priority > bestPriority {
			bestPriority = c.Priority
			candidates = []provider.Channel{c}
		} else if c.Priority == bestPriority {
			candidates = append(candidates, c)
		}
	}
	if len(candidates) == 0 {
		return provider.Channel{}, errors.New("no available channel")
	}
	total := 0
	for _, c := range candidates {
		if c.Weight > 0 {
			total += c.Weight
		}
	}
	var chosen provider.Channel
	if total <= 0 {
		chosen = candidates[0]
	} else {
		n := r.rnd.Intn(total)
		for _, c := range candidates {
			w := c.Weight
			if w < 1 {
				continue
			}
			if n < w {
				chosen = c
				break
			}
			n -= w
		}
		if chosen.ID == "" {
			chosen = candidates[0]
		}
	}
	if affinity != "" {
		r.affinity[affinity] = chosen.ID
		if r.db != nil {
			_, _ = r.db.Exec(`INSERT INTO conversation_affinity(scope,channel_id,updated_at) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET channel_id=excluded.channel_id,updated_at=excluded.updated_at`, affinity, chosen.ID, now.UTC().Format(time.RFC3339Nano))
		}
	}
	return chosen, nil
}
func (r *Router) Rest(channelID, reason string, status int, d time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.resting[channelID] = Rest{Until: time.Now().Add(d), Reason: reason, Status: status}
}
func (r *Router) Clear(channelID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.resting, channelID)
}
func (r *Router) AddTrace(t Trace) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.traces = append(r.traces, t)
	if len(r.traces) > 100 {
		r.traces = append([]Trace(nil), r.traces[len(r.traces)-100:]...)
	}
}
func (r *Router) Traces() []Trace {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Trace(nil), r.traces...)
}

func ClassifyFailure(status int, h http.Header, body []byte) (string, time.Duration) {
	now := time.Now()
	if retry := strings.TrimSpace(h.Get("Retry-After")); retry != "" {
		if sec, err := strconv.Atoi(retry); err == nil && sec > 0 {
			return "retry_after", time.Duration(min(sec, 600)) * time.Second
		}
		if t, err := http.ParseTime(retry); err == nil && t.After(now) {
			d := t.Sub(now)
			if d > 10*time.Minute {
				d = 10 * time.Minute
			}
			return "retry_after", d
		}
	}
	lower := strings.ToLower(string(body))
	switch {
	case status == 402 || strings.Contains(lower, "insufficient_quota") || strings.Contains(lower, "insufficient balance") || strings.Contains(lower, "billing"):
		return "credit", 30 * time.Minute
	case status == 429 && strings.Contains(lower, "resets_at"):
		var v struct {
			Error struct {
				At int64 `json:"resets_at"`
				In int64 `json:"resets_in_seconds"`
			} `json:"error"`
		}
		if json.Unmarshal(body, &v) == nil {
			if v.Error.At > 0 {
				d := time.Until(time.Unix(v.Error.At, 0))
				if d > 0 {
					return "quota", capDuration(d, 8*24*time.Hour)
				}
			}
			if v.Error.In > 0 {
				return "quota", capDuration(time.Duration(v.Error.In)*time.Second, 8*24*time.Hour)
			}
		}
	case status == 429 && (strings.Contains(lower, "quota") || strings.Contains(lower, "usage limit") || strings.Contains(lower, "monthly") || strings.Contains(lower, "weekly") || strings.Contains(lower, "daily")):
		return "quota", 15 * time.Minute
	case status == 429:
		return "rate", time.Minute
	case status == 401 || status == 403:
		return "auth", 10 * time.Minute
	case status >= 500:
		return "upstream", time.Minute
	}
	return "", 0
}
func capDuration(d, max time.Duration) time.Duration {
	if d > max {
		return max
	}
	return d
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
