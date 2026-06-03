package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Config struct {
	Port      int    `json:"port"`
	OllamaURL string `json:"ollama_url"`
	LocalJRE  string `json:"local_jre"`
}

func DefaultConfig() *Config {
	return &Config{
		Port:      3000,
		OllamaURL: "http://localhost:11434",
		LocalJRE:  "",
	}
}

// GetConfigDir returns the directory path under the user home directory where Pycasa app data resides
func GetConfigDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		// fallback to current directory or temp dir if home dir is not available
		return filepath.Join(os.TempDir(), ".pycasa")
	}
	return filepath.Join(home, ".pycasa")
}

// GetConfigPath returns the path to the config.json file
func GetConfigPath() string {
	return filepath.Join(GetConfigDir(), "config.json")
}

// LoadConfig reads the config file or returns default config if it doesn't exist
func LoadConfig() (*Config, error) {
	configPath := GetConfigPath()

	// Ensure the config directory exists
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	// Check if config file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		cfg := DefaultConfig()
		if err := SaveConfig(cfg); err != nil {
			return nil, err
		}
		return cfg, nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	cfg := DefaultConfig()
	if err := json.Unmarshal(data, cfg); err != nil {
		// If JSON is malformed, return default config
		return cfg, nil
	}

	return cfg, nil
}

// SaveConfig writes the configuration to disk
func SaveConfig(cfg *Config) error {
	configPath := GetConfigPath()

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}
