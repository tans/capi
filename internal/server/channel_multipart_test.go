package server

import (
	"bytes"
	"io"
	"mime/multipart"
	"testing"

	"github.com/tans/capi/internal/provider"
)

func TestMultipartChannelMappingPreservesUpload(t *testing.T) {
	var input bytes.Buffer
	w := multipart.NewWriter(&input)
	w.WriteField("model", "public-image")
	w.WriteField("size", "1024x1024")
	f, _ := w.CreateFormFile("image", "sample.png")
	data := []byte{0, 1, 255, 13, 10}
	f.Write(data)
	w.Close()
	ch := provider.Channel{APIKey: "original", Config: provider.ChannelConfig{Keys: []string{"selected"}, ModelMapping: map[string]string{"public-image": "provider-image"}, ParamOverride: map[string]any{"size": "512x512", "n": 2}}}
	selected, model, raw, err := prepareChannelRequest(ch, "public-image", input.Bytes(), w.FormDataContentType())
	if err != nil || model != "provider-image" || selected.APIKey != "selected" {
		t.Fatal(model, err)
	}
	form, err := multipart.NewReader(bytes.NewReader(raw), w.Boundary()).ReadForm(1024)
	if err != nil {
		t.Fatal(err)
	}
	defer form.RemoveAll()
	if form.Value["model"][0] != "provider-image" || form.Value["size"][0] != "512x512" || form.Value["n"][0] != "2" {
		t.Fatal(form.Value)
	}
	fh := form.File["image"][0]
	file, _ := fh.Open()
	defer file.Close()
	actual, _ := io.ReadAll(file)
	if fh.Filename != "sample.png" || !bytes.Equal(actual, data) {
		t.Fatal("upload changed", fh, actual)
	}
}
