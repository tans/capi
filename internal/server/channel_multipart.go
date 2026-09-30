package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"strings"

	"github.com/tans/capi/internal/provider"
)

func upstreamVideoModel(ch provider.Channel, model string) string {
	if mapped := ch.Config.ModelMapping[model]; mapped != "" {
		return mapped
	}
	return model
}

func prepareChannelRequest(ch provider.Channel, model string, raw []byte, contentType string) (provider.Channel, string, []byte, error) {
	if !strings.HasPrefix(contentType, "multipart/") {
		return provider.PrepareChannel(ch, model, raw)
	}
	// Pick one key and resolve the model before rewriting fields. Keep file bytes
	// and part headers intact, including the boundary advertised to the upstream.
	probe, _ := json.Marshal(map[string]string{"model": model})
	selected, mapped, _, err := provider.PrepareChannel(ch, model, probe)
	if err != nil {
		return ch, model, nil, err
	}
	if mapped == model && len(ch.Config.ParamOverride) == 0 {
		return selected, mapped, raw, nil
	}
	_, params, err := mime.ParseMediaType(contentType)
	if err != nil || params["boundary"] == "" {
		return ch, model, nil, fmt.Errorf("invalid multipart boundary")
	}
	var output bytes.Buffer
	writer := multipart.NewWriter(&output)
	if err := writer.SetBoundary(params["boundary"]); err != nil {
		return ch, model, nil, err
	}
	reader := multipart.NewReader(bytes.NewReader(raw), params["boundary"])
	fields := map[string]string{"model": mapped}
	for name, value := range ch.Config.ParamOverride {
		text, ok := value.(string)
		if !ok {
			encoded, err := json.Marshal(value)
			if err != nil {
				return ch, model, nil, err
			}
			text = string(encoded)
		}
		fields[name] = text
	}
	seen := map[string]bool{}
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return ch, model, nil, err
		}
		name := part.FormName()
		value, replace := fields[name]
		if replace && part.FileName() != "" {
			return ch, model, nil, fmt.Errorf("parameter override targets file field %q", name)
		}
		if replace && seen[name] {
			part.Close()
			continue
		}
		dest, err := writer.CreatePart(part.Header)
		if err != nil {
			return ch, model, nil, err
		}
		if replace {
			_, err = io.WriteString(dest, value)
			seen[name] = true
		} else {
			_, err = io.Copy(dest, part)
		}
		part.Close()
		if err != nil {
			return ch, model, nil, err
		}
	}
	for name, value := range fields {
		if !seen[name] {
			if err := writer.WriteField(name, value); err != nil {
				return ch, model, nil, err
			}
		}
	}
	if err := writer.Close(); err != nil {
		return ch, model, nil, err
	}
	return selected, mapped, output.Bytes(), nil
}
