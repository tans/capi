.PHONY: dev test build smoke

dev:
	go run ./cmd/capi serve

test:
	go test ./...

build:
	CGO_ENABLED=0 go build -trimpath -o bin/capi ./cmd/capi

smoke:
	./scripts/smoke.sh
