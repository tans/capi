package worker

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

const archivedVideoLimit = 512 << 20

func publicMediaAddress(ctx context.Context, value string) (*url.URL, string, error) {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || (u.Port() != "" && u.Port() != "443") {
		return nil, "", errors.New("media URL must use public HTTPS")
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, u.Hostname())
	if err != nil || len(addresses) == 0 {
		return nil, "", errors.New("media host cannot be resolved")
	}
	for _, addr := range addresses {
		if !addr.IP.IsGlobalUnicast() || addr.IP.IsPrivate() || addr.IP.IsLoopback() || addr.IP.IsLinkLocalUnicast() || addr.IP.IsLinkLocalMulticast() || addr.IP.IsMulticast() || addr.IP.IsUnspecified() || !publicIP(addr.IP) {
			return nil, "", errors.New("media host resolves to a non-public address")
		}
	}
	return u, addresses[0].IP.String(), nil
}

func publicIP(ip net.IP) bool {
	if v4 := ip.To4(); v4 != nil {
		return v4[0] != 0 && v4[0] != 10 && v4[0] != 127 && v4[0] < 224 &&
			!(v4[0] == 100 && v4[1] >= 64 && v4[1] <= 127) &&
			!(v4[0] == 169 && v4[1] == 254) &&
			!(v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31) &&
			!(v4[0] == 192 && (v4[1] == 0 || v4[1] == 168)) &&
			!(v4[0] == 198 && (v4[1] == 18 || v4[1] == 19))
	}
	return !ip.IsPrivate() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast()
}

func (w *Worker) fetchVideo(ctx context.Context, value string) (*http.Response, error) {
	client := &http.Client{Timeout: 5 * time.Minute, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	for redirects := 0; redirects <= 3; redirects++ {
		u, address, err := publicMediaAddress(ctx, value)
		if err != nil {
			return nil, err
		}
		transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(ctx, "tcp", net.JoinHostPort(address, "443"))
		}}
		client.Transport = transport
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "video/*")
		res, err := client.Do(req)
		transport.CloseIdleConnections()
		if err != nil {
			return nil, err
		}
		if res.StatusCode >= 300 && res.StatusCode <= 308 && res.Header.Get("Location") != "" {
			res.Body.Close()
			if redirects == 3 {
				return nil, errors.New("too many media redirects")
			}
			location, err := u.Parse(res.Header.Get("Location"))
			if err != nil {
				return nil, err
			}
			value = location.String()
			continue
		}
		if res.StatusCode != http.StatusOK {
			res.Body.Close()
			return nil, fmt.Errorf("media returned %d", res.StatusCode)
		}
		contentType := strings.ToLower(strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0]))
		if contentType != "video/mp4" && contentType != "video/webm" {
			res.Body.Close()
			return nil, errors.New("unsupported video type")
		}
		if res.ContentLength > archivedVideoLimit {
			res.Body.Close()
			return nil, errors.New("video exceeds 512 MiB")
		}
		return res, nil
	}
	return nil, errors.New("media redirect limit exceeded")
}

func (w *Worker) archiveVideo(ctx context.Context, taskID string, res *http.Response) (string, error) {
	defer res.Body.Close()
	var workspaceID string
	if err := w.Store.DB.QueryRowContext(ctx, `SELECT workspace_id FROM video_tasks WHERE id=?`, taskID).Scan(&workspaceID); err != nil {
		return "", err
	}
	if err := os.MkdirAll(w.Cfg.FilesDir, 0o700); err != nil {
		return "", err
	}
	id := auth.RandomID("file_")
	path := filepath.Join(w.Cfg.FilesDir, id)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	defer func() {
		if err != nil {
			_ = os.Remove(path)
		}
	}()
	size, copyErr := io.Copy(f, io.LimitReader(res.Body, archivedVideoLimit+1))
	closeErr := f.Close()
	if copyErr != nil {
		err = copyErr
		return "", err
	}
	if closeErr != nil {
		err = closeErr
		return "", err
	}
	if size == 0 || size > archivedVideoLimit {
		err = errors.New("invalid video size")
		return "", err
	}
	contentType := strings.ToLower(strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0]))
	if contentType != "video/mp4" && contentType != "video/webm" {
		err = errors.New("unsupported video type")
		return "", err
	}
	ext := ".mp4"
	if contentType == "video/webm" {
		ext = ".webm"
	}
	now := time.Now().UTC()
	_, err = w.Store.DB.ExecContext(ctx, `INSERT INTO files(id,workspace_id,filename,content_type,bytes,path,purpose,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)`, id, workspaceID, "generated-"+taskID+ext, contentType, size, path, "generated_video", now.Format(time.RFC3339Nano), now.Add(30*24*time.Hour).Format(time.RFC3339Nano))
	if err != nil {
		return "", err
	}
	return id, nil
}
