package server

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const smtpKeyFile = "smtp.key"
const subscriptionKeyFile = "chatgpt-subscription.key"

func (s *Server) smtpCipher() (cipher.AEAD, error) {
	return s.fileCipher(smtpKeyFile, "capi:smtp-password:v1")
}

func (s *Server) subscriptionCipher() (cipher.AEAD, error) {
	return s.fileCipher(subscriptionKeyFile, "capi:chatgpt-subscription:v1")
}

func (s *Server) fileCipher(name, _ string) (cipher.AEAD, error) {
	if err := os.MkdirAll(s.Cfg.DataDir, 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(s.Cfg.DataDir, name)
	key, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		key = make([]byte, 32)
		if _, err = rand.Read(key); err != nil {
			return nil, err
		}
		file, createErr := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if errors.Is(createErr, os.ErrExist) {
			key, err = os.ReadFile(path)
			if err != nil {
				return nil, err
			}
		} else if createErr != nil {
			return nil, createErr
		} else {
			if _, err = file.Write(key); err != nil {
				file.Close()
				return nil, err
			}
			if err = file.Sync(); err != nil {
				file.Close()
				return nil, err
			}
			if err = file.Close(); err != nil {
				return nil, err
			}
		}
	} else if err != nil {
		return nil, err
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if info.Mode().Perm()&0o077 != 0 {
		return nil, errors.New("encryption key permissions must be owner-only")
	}
	if len(key) != 32 {
		return nil, errors.New("SMTP encryption key has an invalid length")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (s *Server) encryptSubscription(raw []byte) (string, error) {
	aead, err := s.subscriptionCipher()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := aead.Seal(nonce, nonce, raw, []byte("capi:chatgpt-subscription:v1"))
	return "enc:v1:" + base64.RawStdEncoding.EncodeToString(sealed), nil
}

func (s *Server) decryptSubscription(value string) ([]byte, error) {
	if !strings.HasPrefix(value, "enc:v1:") {
		return []byte(value), nil
	}
	aead, err := s.subscriptionCipher()
	if err != nil {
		return nil, err
	}
	sealed, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(value, "enc:v1:"))
	if err != nil || len(sealed) < aead.NonceSize()+aead.Overhead() {
		return nil, errors.New("stored ChatGPT credentials are invalid")
	}
	nonce, ciphertext := sealed[:aead.NonceSize()], sealed[aead.NonceSize():]
	plain, err := aead.Open(nil, nonce, ciphertext, []byte("capi:chatgpt-subscription:v1"))
	if err != nil {
		return nil, errors.New("unable to decrypt stored ChatGPT credentials")
	}
	return plain, nil
}

func (s *Server) encryptSMTPPassword(password string) (string, error) {
	aead, err := s.smtpCipher()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := aead.Seal(nonce, nonce, []byte(password), []byte("capi:smtp-password:v1"))
	return base64.RawStdEncoding.EncodeToString(sealed), nil
}

func (s *Server) decryptSMTPPassword(encoded string) (string, error) {
	if encoded == "" {
		return "", nil
	}
	aead, err := s.smtpCipher()
	if err != nil {
		return "", err
	}
	sealed, err := base64.RawStdEncoding.DecodeString(encoded)
	if err != nil || len(sealed) < aead.NonceSize()+aead.Overhead() {
		return "", errors.New("stored SMTP password is invalid")
	}
	nonce, ciphertext := sealed[:aead.NonceSize()], sealed[aead.NonceSize():]
	plain, err := aead.Open(nil, nonce, ciphertext, []byte("capi:smtp-password:v1"))
	if err != nil {
		return "", errors.New("unable to decrypt stored SMTP password")
	}
	return string(plain), nil
}
