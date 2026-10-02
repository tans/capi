.PHONY: dev web-dev web-build test build smoke

dev:
	$(MAKE) web-build
	go run -tags webui_dist ./cmd/capi serve

test: web-build
	go test -tags webui_dist ./...

web-dev:
	npm --prefix web run dev

web-build:
	npm --prefix web ci
	npm --prefix web run build

build: web-build
	CGO_ENABLED=0 go build -tags webui_dist -trimpath -o bin/capi ./cmd/capi

smoke:
	./scripts/smoke.sh
