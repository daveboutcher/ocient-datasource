import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

export interface MyQuery extends DataQuery {
  queryText?: string;
  schema?: string;
  table?: string;
  rawQuery?: boolean; // Flag to toggle between raw SQL and structured builder
  selectedColumns?: SelectedColumn[];
  whereClauses?: WhereClause[];
  timeseriesColumn?: string; // Name of the column to use for time series data
}

export interface SelectedColumn {
  name: string;
  isTimeseriesColumn?: boolean;
}

export interface WhereClause {
  column: string;
  operator: string;
  value: string;
}

export const DEFAULT_QUERY: Partial<MyQuery> = {
  queryText: 'SELECT 1',
  rawQuery: false,
};

// Interface for column metadata - simplified to only what we need
export interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface DataPoint {
  Time: number;
  Value: number;
}

export interface DataSourceResponse {
  datapoints: DataPoint[];
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  host?: string;
  port?: number;
  database?: string;
  insecureSkipVerify?: boolean;
}

// Default values for datasource configuration
export const DEFAULT_CONFIG: Partial<MyDataSourceOptions> = {
  port: 443,
  insecureSkipVerify: true
};

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface MySecureJsonData {
  username?: string;
  password?: string;
}
