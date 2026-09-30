package provider

import (
	"encoding/json"
	"fmt"
)

// TypeSafe uses noul probabilities for the public boolean question type.
func PrepareEvaluateRequest(ch Channel, endpoint string, raw []byte) (string, []byte, *ProtocolAuth, error) {
	path := ChannelEndpoint(ch, endpoint)
	if ch.Config.EvaluateProtocol != "typesafe" {
		return path, raw, nil, nil
	}
	if ch.Config.EvaluatePath == "" {
		path = "/v1/systemone"
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		return "", nil, nil, err
	}
	questions, ok := body["questions"].(map[string]any)
	if !ok {
		return "", nil, nil, fmt.Errorf("questions must be an object")
	}
	for _, question := range questions {
		if value, ok := question.(map[string]any); ok && value["type"] == "boolean" {
			value["type"] = "noul"
		}
	}
	encoded, err := json.Marshal(body)
	return path, encoded, nil, err
}

func NormalizeEvaluateResponse(ch Channel, endpoint string, original, raw []byte) ([]byte, error) {
	if ch.Config.EvaluateProtocol != "typesafe" || (endpoint != "/v1/evaluate" && endpoint != "/v1/systemone") {
		return raw, nil
	}
	var body, response map[string]any
	if err := json.Unmarshal(original, &body); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, err
	}
	questions, _ := body["questions"].(map[string]any)
	answers, ok := response["answers"].(map[string]any)
	if !ok {
		return raw, nil
	}
	for id, answer := range answers {
		question, _ := questions[id].(map[string]any)
		value, ok := answer.(map[string]any)
		if !ok || question["type"] != "boolean" || value["type"] != "noul" {
			continue
		}
		if probability, ok := value["noul"].(float64); ok {
			answers[id] = map[string]any{"type": "boolean", "probability": probability}
		}
	}
	response["model"] = body["model"]
	return json.Marshal(response)
}
