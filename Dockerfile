FROM golang:1.23-bookworm AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/capi ./cmd/capi

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/capi /app/capi
USER nonroot:nonroot
EXPOSE 3210
VOLUME ["/app/data"]
ENTRYPOINT ["/app/capi"]
CMD ["serve"]
