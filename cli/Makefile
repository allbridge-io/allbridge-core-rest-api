.PHONY: build install test lint fmt vet gen tidy clean release

BINARY    := allbridge
PKG       := ./cmd/allbridge
VERSION_RAW ?= $(shell git describe --tags --match 'cli/v*' --always --dirty 2>/dev/null || echo dev)
VERSION     := $(patsubst cli/%,%,$(VERSION_RAW))
COMMIT    ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
DATE      := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS   := -s -w \
             -X github.com/allbridge-io/rest-api/cli/internal/version.Version=$(VERSION) \
             -X github.com/allbridge-io/rest-api/cli/internal/version.Commit=$(COMMIT) \
             -X github.com/allbridge-io/rest-api/cli/internal/version.Date=$(DATE)

build:
	@mkdir -p bin
	go build -trimpath -ldflags "$(LDFLAGS)" -o bin/$(BINARY) $(PKG)

install:
	go install -trimpath -ldflags "$(LDFLAGS)" $(PKG)

tidy:
	go mod tidy

vet:
	go vet ./...

fmt:
	gofmt -s -w .

lint:
	@command -v golangci-lint >/dev/null && golangci-lint run ./... || \
		echo "golangci-lint not installed; skipping"

test:
	go test ./... -race -count=1

# Regenerate the typed REST client from a fresh swagger.json snapshot.
#
# Refreshes api/swagger.json from ../rest-api/public/, then runs
# `go generate ./...`. The generator is invoked via `go run pkg@version`
# inside the //go:generate directive (see internal/api/gen.go), so there is
# no install step, no PATH dependency, and the version is pinned in code.
gen:
	@if [ -f ../rest-api/public/swagger.json ]; then \
		cp ../rest-api/public/swagger.json api/swagger.json; \
		echo "==> refreshed api/swagger.json from sibling rest-api/"; \
	else \
		echo "==> using existing api/swagger.json (../rest-api/public/swagger.json not found)"; \
	fi
	@mkdir -p internal/api/gen
	go generate ./...
	@echo "==> generated internal/api/gen/openapi.gen.go"

clean:
	rm -rf bin dist

# Cross-compile release artifacts.
release:
	@mkdir -p dist
	GOOS=darwin  GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-darwin-arm64  $(PKG)
	GOOS=darwin  GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-darwin-amd64  $(PKG)
	GOOS=linux   GOARCH=arm64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-linux-arm64   $(PKG)
	GOOS=linux   GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-linux-amd64   $(PKG)
	GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-windows-amd64.exe $(PKG)
