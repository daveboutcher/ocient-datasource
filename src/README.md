# Ocient Datasource Plugin for Grafana

![Grafana](https://img.shields.io/badge/Grafana-10.4+-orange)
![License](https://img.shields.io/badge/License-Apache%202.0-blue)

## Overview

The Ocient Datasource plugin allows Grafana to connect to [Ocient](https://ocient.com/) databases, enabling you to visualize and analyze your data stored in Ocient directly from Grafana dashboards. This plugin provides both a SQL editor for custom queries and a visual query builder to help you create queries without writing SQL.

This plugin is not officially supported by Ocient.

Key features:
- SQL query editor for custom SQL queries
- Visual query builder interface
- Schema and table browser
- WHERE clause builder with distinct value selection
- Time range integration for time series data
- Secure connections with TLS support

## Requirements

- Grafana 10.4.0 or later
- Access to an Ocient database instance
- Network connectivity from your Grafana server to your Ocient database

## Getting Started

### Installation

1. Download the latest release from the [GitHub releases page](https://github.com/daveboutcher/ocient-datasource/releases)
2. Extract the zip file into your Grafana plugins directory (typically `/var/lib/grafana/plugins`)
3. Restart Grafana

### Configuration

1. In Grafana, go to **Configuration → Data Sources**
2. Click **Add data source**
3. Search for and select "Ocient"
4. Configure the following settings:
   - **Host**: The hostname or IP address of your Ocient database
   - **Port**: The port number (defaults to 443 for HTTPS)
   - **Database**: The name of your Ocient database
   - **Username**: Your Ocient database username
   - **Password**: Your Ocient database password
   - **Skip TLS Verify**: Toggle to skip TLS certificate verification (optional)
5. Click **Save & Test** to verify the connection

### Using the Visual Query Builder

1. Create a new dashboard panel
2. Select the Ocient datasource
3. In the query editor, make sure "Query Builder" mode is selected
4. Select a schema from the dropdown
5. Select a table from the dropdown
6. Add columns to your query
7. Optionally, select a timestamp column as your time series column
8. Add WHERE clauses as needed
9. Click "Build Query" to generate the SQL

### Using Raw SQL

1. Toggle to "Raw SQL" mode in the query editor
2. Enter your SQL query
3. You can use `$__timeFrom()` and `$__timeTo()` macros to automatically filter by the dashboard time range

## Documentation

For more information on the Ocient database, visit the [Ocient Documentation](https://docs.ocient.com/).

## Support

This plugin is not officially supported by Ocient.  For issues, questions, or feature requests, please file an issue on our [GitHub repository](https://github.com/daveboutcher/ocient-datasource/issues).
