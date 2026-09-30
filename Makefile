.PHONY: dev web-dev web-build test build smoke

dev:
	go run ./cmd/capi serve

test:
	go test ./...

web-dev:
	npm --prefix web run dev

web-build:
	npm --prefix web ci
	npm --prefix web run build

build: web-build
	CGO_ENABLED=0 go build -trimpath -o bin/capi ./cmd/capi

smoke:
	./scripts/smoke.sh
