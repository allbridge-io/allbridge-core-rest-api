package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"sigs.k8s.io/yaml"
)

type Config struct {
	API struct {
		URL     string `json:"url" yaml:"url"`
		Timeout string `json:"timeout,omitempty" yaml:"timeout,omitempty"` // e.g. "30s"
	} `json:"api" yaml:"api"`
	Network       string            `json:"network,omitempty" yaml:"network,omitempty"` // mainnet|testnet
	DefaultWallet string            `json:"defaultWallet,omitempty" yaml:"defaultWallet,omitempty"`
	RPC           map[string]string `json:"rpc,omitempty" yaml:"rpc,omitempty"` // chainSymbol -> RPC URL
}

const (
	dirName  = "allbridge"
	fileName = "config.yaml"
)

const DefaultAPIURL = "https://core-rest-api.allbridge.io"

func Defaults() Config {
	c := Config{}
	c.API.URL = DefaultAPIURL
	c.API.Timeout = "30s"
	c.Network = "mainnet"
	c.RPC = map[string]string{}
	return c
}

var (
	loadOnce sync.Once
	cached   Config
	loadErr  error
)

func Load() (Config, error) {
	loadOnce.Do(func() {
		cached, loadErr = readFromDisk()
	})
	return cached, loadErr
}

func Save(c Config) error {
	dir, err := Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("config: mkdir: %w", err)
	}
	buf, err := yaml.Marshal(c)
	if err != nil {
		return fmt.Errorf("config: marshal: %w", err)
	}
	path := filepath.Join(dir, fileName)
	if err := os.WriteFile(path, buf, 0o600); err != nil {
		return fmt.Errorf("config: write %s: %w", path, err)
	}
	cached = c
	return nil
}

func Dir() (string, error) {
	if x := os.Getenv("XDG_CONFIG_HOME"); x != "" {
		return filepath.Join(x, dirName), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("config: home dir: %w", err)
	}
	return filepath.Join(home, ".config", dirName), nil
}

func readFromDisk() (Config, error) {
	dir, err := Dir()
	if err != nil {
		return Config{}, err
	}
	path := filepath.Join(dir, fileName)
	buf, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Defaults(), nil
	}
	if err != nil {
		return Config{}, fmt.Errorf("config: read %s: %w", path, err)
	}
	c := Defaults()
	if err := yaml.Unmarshal(buf, &c); err != nil {
		return Config{}, fmt.Errorf("config: parse %s: %w", path, err)
	}
	return c, nil
}
