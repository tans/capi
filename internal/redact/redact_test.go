package redact

import "testing"

func TestRoundTrip(t *testing.T) {
	e:=New(t.TempDir()+"/redact.key")
	in:="email john@example.com and sk-abcdefghijklmnopqrstuvwxyz123456"
	masked:=e.MaskString(in)
	if masked==in { t.Fatal("expected masking") }
	if got:=e.RestoreString(masked);got!=in { t.Fatalf("restore mismatch: %q",got) }
}
