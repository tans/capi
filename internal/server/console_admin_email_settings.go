package server

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type storedEmailSettings struct {
	Host               string `json:"host"`
	Port               int    `json:"port"`
	Security           string `json:"security"`
	User               string `json:"user"`
	PasswordCiphertext string `json:"passwordCiphertext,omitempty"`
	FromName           string `json:"fromName"`
	FromAddress        string `json:"fromAddress"`
	UpdatedAt          int64  `json:"updatedAt,omitempty"`
}

type emailSettingsInput struct {
	Host        string `json:"smtpHost"`
	Port        int    `json:"smtpPort"`
	Security    string `json:"security"`
	User        string `json:"smtpUser"`
	Password    string `json:"smtpPassword"`
	FromName    string `json:"fromName"`
	FromAddress string `json:"fromAddress"`
}

var smtpHostPattern = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$`)

func (s *Server) consoleAdminEmailSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" && !s.sameOrigin(r) {
		apiError(w, 403, "bad_origin", "Origin is not allowed.")
		return
	}
	if _, err := s.requireAdmin(r); err != nil {
		apiError(w, 403, "forbidden", "Admin required.")
		return
	}
	s.appSettingsMu.Lock()
	locked := true
	defer func() {
		if locked {
			s.appSettingsMu.Unlock()
		}
	}()
	settings, err := s.readStoredPricing(r.Context())
	if err != nil {
		apiError(w, 500, "database_error", err.Error())
		return
	}

	switch r.Method {
	case "GET":
		writeJSON(w, 200, emailSettingsProjection(settings.EmailSettings))
	case "PATCH":
		var in emailSettingsInput
		if readJSON(r, &in) != nil {
			apiError(w, 400, "invalid_settings", "Invalid email settings.")
			return
		}
		in.Host = strings.TrimSpace(in.Host)
		in.User = strings.TrimSpace(in.User)
		in.FromName = strings.TrimSpace(in.FromName)
		in.FromAddress = strings.TrimSpace(in.FromAddress)
		if net.ParseIP(in.Host) == nil && !smtpHostPattern.MatchString(in.Host) {
			apiError(w, 400, "invalid_smtp_host", "Enter a valid SMTP host name or IP address.")
			return
		}
		if in.Port < 1 || in.Port > 65535 {
			apiError(w, 400, "invalid_smtp_port", "SMTP port must be between 1 and 65535.")
			return
		}
		if in.Security != "ssl" && in.Security != "starttls" && in.Security != "none" {
			apiError(w, 400, "invalid_smtp_security", "Choose SSL/TLS, STARTTLS, or no transport encryption.")
			return
		}
		if in.User == "" || len(in.User) > 254 || hasHeaderBreak(in.User) || len([]rune(in.FromName)) == 0 || len([]rune(in.FromName)) > 100 || hasHeaderBreak(in.FromName) {
			apiError(w, 400, "invalid_sender", "SMTP account and a sender name of 1 to 100 characters are required.")
			return
		}
		from, err := mail.ParseAddress(in.FromAddress)
		if err != nil || from.Address != in.FromAddress || len(in.FromAddress) > 254 || hasHeaderBreak(in.FromAddress) {
			apiError(w, 400, "invalid_sender_address", "Enter a valid sender email address.")
			return
		}
		if in.Password != "" && (len(in.Password) > 4096 || hasHeaderBreak(in.Password)) {
			apiError(w, 400, "invalid_smtp_password", "SMTP authorization code is invalid.")
			return
		}
		stored := settings.EmailSettings
		stored.Host, stored.Port, stored.Security = in.Host, in.Port, in.Security
		stored.User, stored.FromName, stored.FromAddress = in.User, in.FromName, in.FromAddress
		if in.Password != "" {
			stored.PasswordCiphertext, err = s.encryptSMTPPassword(in.Password)
			if err != nil {
				apiError(w, 500, "secret_storage_error", "Unable to securely store SMTP credentials.")
				return
			}
		}
		stored.UpdatedAt = time.Now().UnixMilli()
		settings.EmailSettings = stored
		if err := s.writeStoredPricing(r.Context(), settings); err != nil {
			apiError(w, 500, "database_error", err.Error())
			return
		}
		writeJSON(w, 200, emailSettingsProjection(stored))
	case "POST":
		if settings.EmailSettings.PasswordCiphertext == "" {
			apiError(w, 409, "smtp_not_configured", "Save SMTP settings and an authorization code before sending a test email.")
			return
		}
		var in struct {
			To string `json:"to"`
		}
		if readJSON(r, &in) != nil {
			apiError(w, 400, "invalid_recipient", "Enter a valid test recipient.")
			return
		}
		to, err := mail.ParseAddress(strings.TrimSpace(in.To))
		if err != nil || to.Address != strings.TrimSpace(in.To) || hasHeaderBreak(in.To) {
			apiError(w, 400, "invalid_recipient", "Enter a valid test recipient email address.")
			return
		}
		password, err := s.decryptSMTPPassword(settings.EmailSettings.PasswordCiphertext)
		if err != nil {
			apiError(w, 500, "secret_storage_error", "Unable to read stored SMTP credentials.")
			return
		}
		s.appSettingsMu.Unlock()
		locked = false
		if err := sendSMTPTest(r.Context(), settings.EmailSettings, password, to); err != nil {
			apiError(w, 502, "smtp_delivery_failed", "SMTP test email failed. Check the host, port, security mode, account, authorization code and sender address.")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})
	default:
		w.Header().Set("Allow", "GET, PATCH, POST")
		apiError(w, 405, "method_not_allowed", "Unsupported email settings operation.")
	}
}

func emailSettingsProjection(settings storedEmailSettings) map[string]any {
	port, security := settings.Port, settings.Security
	if port == 0 {
		port = 465
	}
	if security == "" {
		security = "ssl"
	}
	return map[string]any{
		"smtpHost": settings.Host, "smtpPort": port, "security": security,
		"smtpUser": settings.User, "fromName": settings.FromName, "fromAddress": settings.FromAddress,
		"passwordConfigured": settings.PasswordCiphertext != "", "updatedAt": settings.UpdatedAt,
	}
}

func hasHeaderBreak(value string) bool { return strings.ContainsAny(value, "\r\n") }

func (s *Server) writeStoredPricing(ctx context.Context, settings storedPricing) error {
	encoded, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	_, err = s.Store.DB.ExecContext(ctx, `UPDATE app_settings SET config_json=? WHERE id=1`, string(encoded))
	return err
}

func sendSMTPTest(ctx context.Context, settings storedEmailSettings, password string, recipient *mail.Address) error {
	return sendSMTPEmail(ctx, settings, password, recipient, "CAPI SMTP test", "This message confirms that CAPI can send email using the configured SMTP settings.")
}

func sendSMTPEmail(ctx context.Context, settings storedEmailSettings, password string, recipient *mail.Address, subject, body string) error {
	address := net.JoinHostPort(settings.Host, strconv.Itoa(settings.Port))
	dialer := net.Dialer{Timeout: 10 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return err
	}
	defer conn.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	} else {
		_ = conn.SetDeadline(time.Now().Add(15 * time.Second))
	}
	if settings.Security == "ssl" {
		tlsConn := tls.Client(conn, &tls.Config{ServerName: settings.Host, MinVersion: tls.VersionTLS12})
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return err
		}
		conn = tlsConn
	}
	client, err := smtp.NewClient(conn, settings.Host)
	if err != nil {
		return err
	}
	defer client.Close()
	if settings.Security == "starttls" {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return fmt.Errorf("SMTP server does not support STARTTLS")
		}
		if err := client.StartTLS(&tls.Config{ServerName: settings.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
	}
	if err := client.Auth(smtp.PlainAuth("", settings.User, password, settings.Host)); err != nil {
		return err
	}
	from, err := mail.ParseAddress(settings.FromAddress)
	if err != nil {
		return err
	}
	if err := client.Mail(from.Address); err != nil {
		return err
	}
	if err := client.Rcpt(recipient.Address); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	date := time.Now().Format(time.RFC1123Z)
	message := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nDate: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n", (&mail.Address{Name: mime.QEncoding.Encode("UTF-8", settings.FromName), Address: from.Address}).String(), recipient.String(), mime.QEncoding.Encode("UTF-8", subject), date, body)
	if _, err := io.WriteString(writer, message); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}
