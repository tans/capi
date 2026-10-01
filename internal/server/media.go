package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/tans/capi/internal/auth"
)

const archivedImageLimit = 25 << 20

func (s *Server) archiveImageResponse(body []byte, k APIKey) []byte {
	return s.archiveImageResponseContext(context.Background(), body, k)
}

func (s *Server) archiveImageResponseContext(ctx context.Context, body []byte, k APIKey) []byte {
	var payload map[string]any
	if json.Unmarshal(body, &payload) != nil {
		return body
	}
	items, ok := payload["data"].([]any)
	if !ok {
		return body
	}
	for _, item := range items {
		image, ok := item.(map[string]any)
		if !ok {
			continue
		}
		encoded, ok := image["b64_json"].(string)
		if !ok || encoded == "" {
			if imageURL, hasURL := image["url"].(string); hasURL && strings.TrimSpace(imageURL) != "" {
				id, err := s.archiveRemoteImage(ctx, imageURL, k.WorkspaceID)
				if err == nil {
					image["capi_file_id"] = id
					image["capi_url"] = "/v1/files/" + id + "/content"
					image["archive_status"] = "archived"
				} else {
					s.Log.Warn("image_archive_remote_failed", "error", err)
					image["archive_status"] = "unavailable"
				}
			}
			continue
		}
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(data) == 0 || len(data) > archivedImageLimit {
			image["archive_status"] = "unavailable"
			continue
		}
		contentType := "image/png"
		ext := ".png"
		if value, ok := image["content_type"].(string); ok {
			switch strings.ToLower(strings.TrimSpace(value)) {
			case "image/jpeg":
				contentType, ext = "image/jpeg", ".jpg"
			case "image/webp":
				contentType, ext = "image/webp", ".webp"
			case "image/gif":
				contentType, ext = "image/gif", ".gif"
			}
		}
		id, err := s.storeGeneratedFile(k.WorkspaceID, "generated-image"+ext, contentType, data)
		if err != nil {
			s.Log.Warn("image_archive_failed", "error", err)
			image["archive_status"] = "unavailable"
			continue
		}
		image["capi_file_id"] = id
		image["capi_url"] = "/v1/files/" + id + "/content"
		image["archive_status"] = "archived"
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return body
	}
	return encoded
}

const maxRemoteImageRedirects = 3

var nonPublicImagePrefixes = parseImagePrefixes(
	"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24",
	"198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4",
	"64:ff9b:1::/48", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16",
)

var globalIPv6ImagePrefix = parseImagePrefixes("2000::/3")[0]

func (s *Server) archiveRemoteImage(ctx context.Context, value, workspaceID string) (string, error) {
	imageURL := strings.TrimSpace(value)
	for redirects := 0; redirects <= maxRemoteImageRedirects; redirects++ {
		fetchCtx, cancel := context.WithTimeout(ctx, s.relayTimeout())
		u, address, err := publicImageAddress(fetchCtx, imageURL)
		if err != nil {
			cancel()
			return "", err
		}
		client := &http.Client{
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
		transport := &http.Transport{Proxy: nil, DialContext: func(dialCtx context.Context, _, _ string) (net.Conn, error) {
			return (&net.Dialer{}).DialContext(dialCtx, "tcp", net.JoinHostPort(address, "443"))
		}}
		client.Transport = transport
		req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, u.String(), nil)
		if err != nil {
			transport.CloseIdleConnections()
			cancel()
			return "", err
		}
		req.Header.Set("Accept", "image/*")
		res, err := client.Do(req)
		transport.CloseIdleConnections()
		if err != nil {
			cancel()
			return "", err
		}
		if res.StatusCode >= 300 && res.StatusCode <= 308 && res.Header.Get("Location") != "" {
			location, parseErr := u.Parse(res.Header.Get("Location"))
			res.Body.Close()
			cancel()
			if parseErr != nil {
				return "", parseErr
			}
			if redirects == maxRemoteImageRedirects {
				return "", errors.New("too many image redirects")
			}
			imageURL = location.String()
			continue
		}
		if res.StatusCode != http.StatusOK {
			res.Body.Close()
			cancel()
			return "", errors.New("remote image returned non-200 status")
		}
		contentType := normalizeArchivedImageType(res.Header.Get("Content-Type"))
		if contentType == "" {
			res.Body.Close()
			cancel()
			return "", errors.New("remote image type is unsupported")
		}
		if res.ContentLength > archivedImageLimit {
			res.Body.Close()
			cancel()
			return "", errors.New("remote image exceeds 25 MiB")
		}
		data, readErr := io.ReadAll(io.LimitReader(res.Body, archivedImageLimit+1))
		res.Body.Close()
		cancel()
		if readErr != nil {
			return "", readErr
		}
		if len(data) == 0 || len(data) > archivedImageLimit {
			return "", errors.New("remote image size is invalid")
		}
		if detected := normalizeArchivedImageType(http.DetectContentType(data)); detected != contentType {
			return "", errors.New("remote image content does not match its type")
		}
		ext := imageExtension(contentType)
		filename := filepath.Base(strings.ReplaceAll(u.Path, "\\", "/"))
		filename = strings.TrimSpace(strings.Map(func(r rune) rune {
			if r < 0x20 || r == 0x7f {
				return '_'
			}
			return r
		}, filename))
		if filename == "" || filename == "." || filename == string(filepath.Separator) {
			filename = "generated-image" + ext
		} else if !strings.Contains(filename, ".") {
			filename += ext
		}
		return s.storeGeneratedFile(workspaceID, filename, contentType, data)
	}
	return "", errors.New("remote image redirect limit exceeded")
}

func normalizeArchivedImageType(value string) string {
	parsed, _, err := mime.ParseMediaType(value)
	if err != nil {
		parsed = strings.ToLower(strings.TrimSpace(strings.Split(value, ";")[0]))
	}
	switch parsed {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
		return parsed
	default:
		return ""
	}
}

func imageExtension(contentType string) string {
	switch contentType {
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".png"
	}
}

func publicImageAddress(ctx context.Context, value string) (*url.URL, string, error) {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || (u.Port() != "" && u.Port() != "443") {
		return nil, "", errors.New("image URL must use public HTTPS")
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, u.Hostname())
	if err != nil || len(addresses) == 0 {
		return nil, "", errors.New("image host cannot be resolved")
	}
	for _, candidate := range addresses {
		if !publicImageIP(candidate.IP) {
			return nil, "", errors.New("image host resolves to a non-public address")
		}
	}
	return u, addresses[0].IP.String(), nil
}

func publicImageIP(ip net.IP) bool {
	if ip == nil || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return false
	}
	for _, prefix := range nonPublicImagePrefixes {
		if prefix.Contains(ip) {
			return false
		}
	}
	if v4 := ip.To4(); v4 != nil {
		return v4[0] != 0 && v4[0] < 224 &&
			!(v4[0] == 169 && v4[1] == 254) &&
			!(v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31) &&
			!(v4[0] == 192 && v4[1] == 168)
	}
	return globalIPv6ImagePrefix.Contains(ip)
}

func parseImagePrefixes(values ...string) []*net.IPNet {
	prefixes := make([]*net.IPNet, 0, len(values))
	for _, value := range values {
		_, prefix, err := net.ParseCIDR(value)
		if err == nil {
			prefixes = append(prefixes, prefix)
		}
	}
	return prefixes
}

func (s *Server) storeGeneratedFile(workspaceID, filename, contentType string, data []byte) (string, error) {
	if workspaceID == "" || len(data) == 0 || len(data) > archivedImageLimit {
		return "", errors.New("invalid generated file")
	}
	if err := os.MkdirAll(s.Cfg.FilesDir, 0o700); err != nil {
		return "", err
	}
	id := auth.RandomID("file_")
	path := filepath.Join(s.Cfg.FilesDir, id)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", err
	}
	now := time.Now().UTC()
	_, err := s.Store.DB.Exec(`INSERT INTO files(id,workspace_id,filename,content_type,bytes,path,purpose,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)`, id, workspaceID, filename, contentType, len(data), path, "generated_image", now.Format(time.RFC3339Nano), now.Add(30*24*time.Hour).Format(time.RFC3339Nano))
	if err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return id, nil
}
