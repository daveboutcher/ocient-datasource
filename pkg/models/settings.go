package models

import (
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type PluginSettings struct {
	Host              string                `json:"host"`
	Port              int                   `json:"port"`
	Database          string                `json:"database"`
	InsecureSkipVerify bool                 `json:"insecureSkipVerify"`
	Secrets           *SecretPluginSettings `json:"-"`
}

type SecretPluginSettings struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func LoadPluginSettings(source backend.DataSourceInstanceSettings) (*PluginSettings, error) {
	// Log the raw JSON data received
	fmt.Printf("Raw JSONData (len=%d): %s\n", len(source.JSONData), string(source.JSONData))
	
	settings := PluginSettings{}
	err := json.Unmarshal(source.JSONData, &settings)
	if err != nil {
		return nil, fmt.Errorf("could not unmarshal PluginSettings json: %w", err)
	}

	// If port is 0, set the default port
	if settings.Port == 0 {
		settings.Port = 443 // Default to HTTPS port
	}

	// Load secrets (credentials)
	settings.Secrets = loadSecretPluginSettings(source.DecryptedSecureJSONData)

	// Log the loaded settings
	fmt.Printf("Loaded settings: host=%s, port=%d, database=%s, insecureSkipVerify=%v\n", 
		settings.Host, settings.Port, settings.Database, settings.InsecureSkipVerify)
	fmt.Printf("Secrets loaded: username=%v, password=%v\n", 
		settings.Secrets.Username != "", settings.Secrets.Password != "")

	return &settings, nil
}

func loadSecretPluginSettings(source map[string]string) *SecretPluginSettings {
	return &SecretPluginSettings{
		Username: source["username"],
		Password: source["password"],
	}
}
