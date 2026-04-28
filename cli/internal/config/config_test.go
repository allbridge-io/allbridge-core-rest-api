package config

import "testing"

func TestDefaultsUsePublicRESTAPI(t *testing.T) {
	cfg := Defaults()

	if cfg.API.URL != DefaultAPIURL {
		t.Fatalf("default API URL = %q, want %q", cfg.API.URL, DefaultAPIURL)
	}
	if cfg.API.URL != "https://core-rest-api.allbridge.io" {
		t.Fatalf("unexpected public REST API URL: %q", cfg.API.URL)
	}
	if cfg.API.Timeout != "30s" {
		t.Fatalf("default timeout = %q, want 30s", cfg.API.Timeout)
	}
	if cfg.Network != "mainnet" {
		t.Fatalf("default network = %q, want mainnet", cfg.Network)
	}
	if cfg.RPC == nil {
		t.Fatal("default RPC map is nil")
	}
}
