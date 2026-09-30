package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/tans/capi/internal/store"
)

const sessionTTL = 7 * 24 * time.Hour

type User struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}
type Session struct {
	User      User
	ExpiresAt time.Time
}

func RandomID(prefix string) string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}
func RandomToken(prefix string) string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return prefix + base64.RawURLEncoding.EncodeToString(b)
}
func HashToken(v string) string { sum := sha256.Sum256([]byte(v)); return hex.EncodeToString(sum[:]) }

func HashPassword(password string) (string, error) {
	if len(password) < 8 {
		return "", errors.New("password must be at least 8 characters")
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	iter := 180000
	key := pbkdf2SHA256([]byte(password), salt, iter, 32)
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", iter, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}
func CheckPassword(encoded, password string) bool {
	if strings.HasPrefix(encoded, "$argon2id$") {
		return checkLegacyPassword(encoded, password)
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < 10000 {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	return hmac.Equal(pbkdf2SHA256([]byte(password), salt, iter, len(want)), want)
}
func pbkdf2SHA256(password, salt []byte, iter, keyLen int) []byte {
	hLen := 32
	blocks := (keyLen + hLen - 1) / hLen
	out := make([]byte, 0, blocks*hLen)
	for block := 1; block <= blocks; block++ {
		mac := hmac.New(sha256.New, password)
		mac.Write(salt)
		mac.Write([]byte{byte(block >> 24), byte(block >> 16), byte(block >> 8), byte(block)})
		u := mac.Sum(nil)
		t := append([]byte(nil), u...)
		for i := 1; i < iter; i++ {
			mac = hmac.New(sha256.New, password)
			mac.Write(u)
			u = mac.Sum(nil)
			for j := range t {
				t[j] ^= u[j]
			}
		}
		out = append(out, t...)
	}
	return out[:keyLen]
}
func CreateSession(ctx context.Context, st *store.Store, userID string) (string, time.Time, error) {
	token := RandomToken("capi_sess_")
	expires := time.Now().UTC().Add(sessionTTL)
	_, err := st.DB.ExecContext(ctx, `INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)`, HashToken(token), userID, expires.Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano))
	return token, expires, err
}
func LookupSession(ctx context.Context, st *store.Store, token string) (*Session, error) {
	var s Session
	var expires string
	err := st.DB.QueryRowContext(ctx, `SELECT u.id,u.email,u.name,u.role,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`, HashToken(token)).Scan(&s.User.ID, &s.User.Email, &s.User.Name, &s.User.Role, &expires)
	if err != nil {
		return nil, err
	}
	s.ExpiresAt, _ = time.Parse(time.RFC3339Nano, expires)
	if time.Now().After(s.ExpiresAt) {
		_, _ = st.DB.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash=?`, HashToken(token))
		return nil, sql.ErrNoRows
	}
	return &s, nil
}
func DeleteSession(ctx context.Context, st *store.Store, token string) {
	_, _ = st.DB.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash=?`, HashToken(token))
}
