package redact

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

type Engine struct {
	mu sync.RWMutex
	key []byte
	values map[string]string
	rules []rule
}

type rule struct {
	kind string
	re *regexp.Regexp
}

func New(keyPath string) *Engine {
	key:=make([]byte,32)
	if b,err:=os.ReadFile(keyPath);err==nil&&len(b)>=32 {
		copy(key,b[:32])
	} else {
		_,_=rand.Read(key)
		_ = os.MkdirAll(filepath.Dir(keyPath),0o700)
		_ = os.WriteFile(keyPath,key,0o600)
	}
	return &Engine{
		key:key,
		values:map[string]string{},
		rules:[]rule{
			{kind:"EMAIL",re:regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)},
			{kind:"API_KEY",re:regexp.MustCompile(`(?:sk-[A-Za-z0-9_\-]{20,}|[a-z]{2,4}_sk_[A-Za-z0-9_\-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AIza[0-9A-Za-z_\-]{35}|xox[abposr]-[0-9A-Za-z-]{10,})`)},
			{kind:"TOKEN",re:regexp.MustCompile(`eyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}`)},
			{kind:"PHONE",re:regexp.MustCompile(`(?:\+?86[- ]?)?1[3-9]\d{9}`)},
			{kind:"PRIVATE_KEY",re:regexp.MustCompile(`-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----[\s\S]+?-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----`)},
		},
	}
}

var b32=base32.StdEncoding.WithPadding(base32.NoPadding)

func (e *Engine) MaskString(s string) string {
	for _,r:=range e.rules {
		s=r.re.ReplaceAllStringFunc(s,func(v string) string {
			m:=hmac.New(sha256.New,e.key);m.Write([]byte(r.kind+"\x00"+v))
			p:="{{"+r.kind+"_"+strings.ToLower(b32.EncodeToString(m.Sum(nil))[:8])+"}}"
			e.mu.Lock();e.values[p]=v;e.mu.Unlock()
			return p
		})
	}
	return s
}

func (e *Engine) RestoreString(s string) string {
	e.mu.RLock();defer e.mu.RUnlock()
	for p,v:=range e.values { s=strings.ReplaceAll(s,p,v) }
	return s
}

func (e *Engine) MaskBytes(b []byte) []byte { return []byte(e.MaskString(string(b))) }
func (e *Engine) RestoreBytes(b []byte) []byte { return []byte(e.RestoreString(string(b))) }
