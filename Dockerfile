FROM node:22-bookworm-slim AS web
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web ./
RUN npm run build

FROM golang:1.23-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/internal/webui/dist ./internal/webui/dist
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build -tags webui_dist -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/capi ./cmd/capi

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/capi /app/capi
USER nonroot:nonroot
EXPOSE 3210
VOLUME ["/app/data"]
ENTRYPOINT ["/app/capi"]
CMD ["serve"]
