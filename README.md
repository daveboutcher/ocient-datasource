# Ocient Datasource Plugin for Grafana

This Grafana datasource plugin enables querying [Ocient](https://ocient.com/) databases directly from Grafana dashboards. It supports SQL queries, visual query building, and advanced features like schema browsing and column value selection.

![Ocient Datasource Plugin](src/img/logo.svg)

## Features

- **SQL Query Support**: Execute raw SQL queries against your Ocient database
- **REST API Integration**: Connects to Ocient via its REST API
- **Visual Query Builder**: Build queries without writing SQL using an intuitive UI
- **Schema Browser**: Browse schemas, tables, and columns from your database
- **Column Value Explorer**: View distinct values for columns when building WHERE clauses
- **Time Range Integration**: Automatic handling of Grafana time ranges in queries
- **TLS Support**: Secure connections with optional certificate verification

## Installation

### Prerequisites

- Grafana 9.x or later
- Network access to an Ocient database instance
- Ocient database credentials (username/password)

### Installing the Plugin

1. Download the latest release from the GitHub releases page
2. Extract the archive into your Grafana plugins directory (typically `/var/lib/grafana/plugins`)
3. Restart Grafana
4. Enable the plugin in your Grafana configuration

## Configuration

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

## Using the Plugin

### Writing SQL Queries

1. Create a new panel in a Grafana dashboard
2. Select your Ocient datasource
3. Switch to "Raw SQL" mode
4. Enter your SQL query
5. Use `$__timeFrom()` and `$__timeTo()` macros to automatically filter by the dashboard time range

Example:
```sql
SELECT timestamp, value 
FROM example_schema.sensor_data 
WHERE timestamp BETWEEN $__timeFrom() AND $__timeTo()
ORDER BY timestamp
```

### Using the Visual Query Builder

1. Create a new panel in a Grafana dashboard
2. Select your Ocient datasource
3. Use "Query Builder" mode (default)
4. Select a schema from the dropdown
5. Select a table from the dropdown
6. Add columns by clicking the **Add Column** button
7. Mark a timestamp column as the time series column (optional)
8. Add WHERE clauses by clicking the **Add WHERE Clause** button
9. Use the **Values** button to browse distinct values for fields
10. Click **Build Query** to generate the SQL query

### Working with Time Series Data

For time series visualizations:
1. Select a timestamp column in your query (in the visual query builder, mark it as "Time Column")
2. The plugin automatically formats the timestamp to be compatible with Grafana's time handling

## Supported SQL Features

The plugin supports the full range of SQL features available in Ocient, including:

- SELECT, WHERE, GROUP BY, ORDER BY clauses
- Aggregation functions (COUNT, SUM, AVG, etc.)
- JOINs between tables
- Subqueries
- User-defined functions
- Window functions

## Development

### Prerequisites

- Node.js 16 or newer
- Go 1.19 or newer
- Docker and Docker Compose (for local testing)

### Recent Changes

- Updated UI components to use Grafana's Combobox instead of the deprecated Select component

### Building from Source

1. Clone the repository:
```
git clone https://github.com/your-username/ocient-datasource.git
```

2. Install dependencies:
```
cd ocient-datasource
npm install
```

3. Build the plugin:
```
npm run build
```

4. Build the backend:
```
go build ./pkg/...
```

### Testing with Docker

Run the plugin in a Grafana Docker container:

```
npm run dev
```

This will start a Grafana instance with the plugin pre-installed.

### Running Tests

```
npm run test       # Run frontend tests
go test ./pkg/...  # Run backend tests
npm run e2e        # Run end-to-end tests
```

## Troubleshooting

- **Connection Issues**: Verify that your Ocient database is accessible from the Grafana server, and check that your credentials are correct
- **Schema Browser Empty**: Ensure your user has permissions to access the information_schema tables
- **Query Timeout**: For large datasets, consider adding LIMIT clauses or additional filtering

## License

This plugin is licensed under the [Apache 2.0 License](LICENSE).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please file an issue on the GitHub repository.