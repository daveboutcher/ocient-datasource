package plugin

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/ocient/ocient-datasource/pkg/models"
)

// Make sure Datasource implements required interfaces. This is important to do
// since otherwise we will only get a "not implemented" error response from the plugin at
// runtime. The Ocient datasource implements backend.QueryDataHandler and
// backend.CheckHealthHandler interfaces to provide query execution and health checking
// capabilities.
var (
	_ backend.QueryDataHandler      = (*Datasource)(nil)
	_ backend.CheckHealthHandler    = (*Datasource)(nil)
	_ instancemgmt.InstanceDisposer = (*Datasource)(nil)
)

// NewDatasource creates a new datasource instance.
func NewDatasource(_ context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	backend.Logger.Info("Creating new Ocient datasource instance", 
		"id", settings.ID,
		"uid", settings.UID,
		"name", settings.Name,
		"type", settings.Type,
		"jsonData length", len(settings.JSONData))
	
	config, err := models.LoadPluginSettings(settings)
	if err != nil {
		backend.Logger.Error("Failed to load plugin settings", "error", err.Error())
		return nil, err
	}
	
	backend.Logger.Info("Loaded plugin settings",
		"host", config.Host,
		"port", config.Port,
		"database", config.Database,
		"insecureSkipVerify", config.InsecureSkipVerify,
		"hasUsername", config.Secrets.Username != "",
		"hasPassword", config.Secrets.Password != "")
	
	return &Datasource{settings: *config}, nil
}

// Datasource is an implementation of the Ocient datasource which can respond to data queries.
type Datasource struct{
	settings models.PluginSettings
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (d *Datasource) Dispose() {
	// Clean up datasource instance resources.
}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (d *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	// create response struct
	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		res := d.query(ctx, req.PluginContext, q)

		// save the response in a hashmap
		// based on with RefID as identifier
		response.Responses[q.RefID] = res
	}

	return response, nil
}

type queryModel struct {
	QueryText string `json:"queryText"`
}

// OcientStatus represents the status of an Ocient API response as defined in the OpenAPI spec
type OcientStatus struct {
	Reason     string `json:"reason"`
	SQLState   string `json:"sql_state"`
	VendorCode int    `json:"vendor_code"`
}

// CollectionResponse represents the "collection" format response from the Ocient API
type CollectionResponse struct {
	QueryID string                   `json:"query_id"`
	Status  OcientStatus             `json:"status"`
	Data    []map[string]interface{} `json:"data"`
}

// executeQuery sends an SQL query to the Ocient API and returns the result
func (d *Datasource) executeQuery(ctx context.Context, query string) ([]map[string]interface{}, *OcientStatus, error) {
	// Construct the API URL using HTTPS
	url := fmt.Sprintf("https://%s:%d/v1/execute", d.settings.Host, d.settings.Port)
	backend.Logger.Info("API request URL", "url", url, "database", d.settings.Database)

	// Create request body with format=collection as specified in the OpenAPI spec
	queryRequest := map[string]interface{}{
		"database":  d.settings.Database,
		"statement": query,
		"format":    "collection",
	}

	payload, err := json.Marshal(queryRequest)
	if err != nil {
		return nil, nil, fmt.Errorf("error marshaling query: %w", err)
	}
	
	// Log the full API request details
	backend.Logger.Info("API request details", 
		"url", url, 
		"database", d.settings.Database,
		"statement", query,
		"username", d.settings.Secrets.Username,
		"payload", string(payload))

	// Create HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return nil, nil, fmt.Errorf("error creating request: %w", err)
	}

	// Set headers
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(d.settings.Secrets.Username, d.settings.Secrets.Password)

	// Create HTTP client with optional TLS verification skip
	transport := &http.Transport{}
	if d.settings.InsecureSkipVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	client := &http.Client{Transport: transport}
	
	// Execute request
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("error executing query: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, fmt.Errorf("error reading response: %w", err)
	}
	
	// Log full response body for debugging
	if len(body) > 2000 {
		backend.Logger.Debug("Response body (truncated)", "body", string(body[:2000]), "status", resp.Status)
	} else {
		backend.Logger.Debug("Response body", "body", string(body), "status", resp.Status)
	}

	// Parse response
	var response CollectionResponse
	err = json.Unmarshal(body, &response)
	if err != nil {
		return nil, nil, fmt.Errorf("error parsing response: %w", err)
	}
	
	// Log parsed response details
	backend.Logger.Info("Parsed response", "query_id", response.QueryID, "status", response.Status, "rows", len(response.Data))

	// Check for error status
	if response.Status.SQLState != "00000" {
		return nil, &response.Status, fmt.Errorf("query error: %s (SQL state: %s, vendor code: %d)", 
			response.Status.Reason, response.Status.SQLState, response.Status.VendorCode)
	}

	return response.Data, &response.Status, nil
}

// convertToDataFrames converts the API response into Grafana data frames
func convertToDataFrames(results []map[string]interface{}) (*data.Frame, error) {
	// Define the Ocient specific timestamp format (YYYY-MM-DD HH:MM:SS.SSSSSSSSS)
	ocientTimestampFormat := "2006-01-02 15:04:05.999999999"
	if len(results) == 0 {
		return data.NewFrame("response"), nil
	}

	// Create a new frame
	frame := data.NewFrame("response")

	// Extract column names from the first result
	columns := make([]string, 0, len(results[0]))
	for k := range results[0] {
		columns = append(columns, k)
	}

	// Create a map for each column type
	columnValues := make(map[string]interface{})
	columnTypes := make(map[string]string)
	
	for _, col := range columns {
		valueType := results[0][col]
		
		// Try to detect timestamp strings to convert them properly
		if strVal, ok := valueType.(string); ok {
			// Check for Ocient's specific timestamp format (YYYY-MM-DD HH:MM:SS.SSSSSSSSS)
			_, err := time.Parse(ocientTimestampFormat, strVal)
			if err == nil {
				// This is an Ocient timestamp
				values := make([]time.Time, 0, len(results))
				columnValues[col] = values
				columnTypes[col] = "timestamp"
				continue
			}
			
			// Check if the string looks like an ISO timestamp
			_, err = time.Parse(time.RFC3339, strVal)
			if err == nil {
				// This is likely a timestamp
				values := make([]time.Time, 0, len(results))
				columnValues[col] = values
				columnTypes[col] = "timestamp"
				continue
			}
			
			// Try other timestamp formats
			_, err = time.Parse("2006-01-02 15:04:05", strVal)
			if err == nil {
				values := make([]time.Time, 0, len(results))
				columnValues[col] = values
				columnTypes[col] = "timestamp"
				continue
			}
		}
		
		// Handle regular types
		switch valueType.(type) {
		case float64:
			values := make([]float64, 0, len(results))
			columnValues[col] = values
			columnTypes[col] = "float64"
		case string:
			values := make([]string, 0, len(results))
			columnValues[col] = values
			columnTypes[col] = "string"
		case bool:
			values := make([]bool, 0, len(results))
			columnValues[col] = values
			columnTypes[col] = "bool"
		default:
			// Default to string for unknown types
			values := make([]string, 0, len(results))
			columnValues[col] = values
			columnTypes[col] = "string"
		}
	}

	// Fill the values
	for _, result := range results {
		for _, col := range columns {
			val := result[col]
			switch columnTypes[col] {
			case "float64":
				values := columnValues[col].([]float64)
				if v, ok := val.(float64); ok {
					columnValues[col] = append(values, v)
				} else {
					columnValues[col] = append(values, 0)
				}
			case "string":
				values := columnValues[col].([]string)
				if v, ok := val.(string); ok {
					columnValues[col] = append(values, v)
				} else {
					columnValues[col] = append(values, fmt.Sprintf("%v", val))
				}
			case "bool":
				values := columnValues[col].([]bool)
				if v, ok := val.(bool); ok {
					columnValues[col] = append(values, v)
				} else {
					columnValues[col] = append(values, false)
				}
			case "timestamp":
				values := columnValues[col].([]time.Time)
				if strVal, ok := val.(string); ok {
					// Try Ocient's specific timestamp format first (YYYY-MM-DD HH:MM:SS.SSSSSSSSS)
					t, err := time.Parse(ocientTimestampFormat, strVal)
					if err == nil {
						columnValues[col] = append(values, t)
						continue
					}
					
					// Try RFC3339 format
					t, err = time.Parse(time.RFC3339, strVal)
					if err == nil {
						columnValues[col] = append(values, t)
						continue
					}
					
					// Try other common datetime format
					t, err = time.Parse("2006-01-02 15:04:05", strVal)
					if err == nil {
						columnValues[col] = append(values, t)
						continue
					}
					
					// If parsing fails, add zero time
					columnValues[col] = append(values, time.Time{})
				} else {
					columnValues[col] = append(values, time.Time{})
				}
			}
		}
	}

	// Add fields to the frame
	for _, col := range columns {
		switch columnTypes[col] {
		case "float64":
			values := columnValues[col].([]float64)
			frame.Fields = append(frame.Fields, data.NewField(col, nil, values))
		case "string":
			values := columnValues[col].([]string)
			frame.Fields = append(frame.Fields, data.NewField(col, nil, values))
		case "bool":
			values := columnValues[col].([]bool)
			frame.Fields = append(frame.Fields, data.NewField(col, nil, values))
		case "timestamp":
			values := columnValues[col].([]time.Time)
			frame.Fields = append(frame.Fields, data.NewField(col, nil, values))
		}
	}

	return frame, nil
}

func (d *Datasource) query(ctx context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var response backend.DataResponse

	// Unmarshal the JSON into our queryModel.
	var qm queryModel

	err := json.Unmarshal(query.JSON, &qm)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusBadRequest, fmt.Sprintf("json unmarshal: %v", err.Error()))
	}

	// Return error if no query is provided
	if qm.QueryText == "" {
		return backend.ErrDataResponse(backend.StatusBadRequest, "query text is empty")
	}

	// Execute the query
	backend.Logger.Info("Executing query:", "query", qm.QueryText, "refId", query.RefID)
	results, status, err := d.executeQuery(ctx, qm.QueryText)
	if err != nil {
		// If we have a status, use it to provide more detailed error information
		if status != nil {
			errMsg := fmt.Sprintf("Query failed: %s (SQL state: %s, vendor code: %d)", 
				status.Reason, status.SQLState, status.VendorCode)
			backend.Logger.Error("Query failed with status", "error", errMsg, "refId", query.RefID, "query", qm.QueryText)
			return backend.ErrDataResponse(backend.StatusInternal, errMsg)
		}
		backend.Logger.Error("Query execution error", "error", err.Error(), "refId", query.RefID, "query", qm.QueryText)
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("query execution error: %v", err.Error()))
	}
	
	// Log the results
	backend.Logger.Info("Query results", "count", len(results), "refId", query.RefID)
	
	// For schema queries, log the actual data
	if query.RefID == "schemas" || query.RefID == "tables" {
		if len(results) > 0 {
			resultJSON, _ := json.Marshal(results)
			backend.Logger.Info("Schema/Table query results", "data", string(resultJSON), "refId", query.RefID)
		} else {
			backend.Logger.Info("Schema/Table query returned no results", "refId", query.RefID)
		}
	}

	// Convert results to data frames
	frame, err := convertToDataFrames(results)
	if err != nil {
		return backend.ErrDataResponse(backend.StatusInternal, fmt.Sprintf("error converting results: %v", err.Error()))
	}

	// Add the frames to the response
	response.Frames = append(response.Frames, frame)

	return response
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (d *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	// Create a health check result
	res := &backend.CheckHealthResult{}

	// Log current settings
	backend.Logger.Info("CheckHealth - current settings", 
		"host", d.settings.Host,
		"port", d.settings.Port, 
		"database", d.settings.Database,
		"insecureSkipVerify", d.settings.InsecureSkipVerify,
		"hasUsername", d.settings.Secrets.Username != "",
		"hasPassword", d.settings.Secrets.Password != "")

	// Check if settings are valid
	if d.settings.Host == "" {
		res.Status = backend.HealthStatusError
		res.Message = "Host is missing"
		return res, nil
	}

	if d.settings.Port == 0 {
		res.Status = backend.HealthStatusError
		res.Message = "Port is missing"
		return res, nil
	}

	if d.settings.Database == "" {
		res.Status = backend.HealthStatusError
		res.Message = "Database is missing"
		return res, nil
	}

	if d.settings.Secrets.Username == "" {
		res.Status = backend.HealthStatusError
		res.Message = "Username is missing"
		return res, nil
	}

	if d.settings.Secrets.Password == "" {
		res.Status = backend.HealthStatusError
		res.Message = "Password is missing"
		return res, nil
	}

	backend.Logger.Info("CheckHealth - executing test query")

	// Try to execute a simple query to check the connection
	_, status, err := d.executeQuery(ctx, "SELECT 1")
	if err != nil {
		errMsg := "Connection test failed"
		if status != nil {
			errMsg = fmt.Sprintf("Connection test failed: %s (SQL state: %s)", 
				status.Reason, status.SQLState)
		} else {
			errMsg = fmt.Sprintf("Connection test failed: %s", err.Error())
		}
		
		backend.Logger.Error("CheckHealth - connection test failed", "error", errMsg)
		res.Status = backend.HealthStatusError
		res.Message = errMsg
		return res, nil
	}

	backend.Logger.Info("CheckHealth - connection test succeeded")
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Data source is working",
	}, nil
}
