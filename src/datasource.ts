import { DataSourceInstanceSettings, CoreApp, ScopedVars } from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv } from '@grafana/runtime';
import { firstValueFrom } from 'rxjs';

import { MyQuery, MyDataSourceOptions, DEFAULT_QUERY, ColumnInfo } from './types';

export class DataSource extends DataSourceWithBackend<MyQuery, MyDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);
  }

  getDefaultQuery(_: CoreApp): Partial<MyQuery> {
    return DEFAULT_QUERY;
  }

  applyTemplateVariables(query: MyQuery, scopedVars: ScopedVars) {
    let queryText = query.queryText || '';
    
    // Replace template variables
    queryText = getTemplateSrv().replace(queryText, scopedVars);
    
    // Replace Grafana time macros with actual timestamps
    queryText = queryText.replace(/\$__timeFrom\(\)/g, `'${this.getTimeFromValue(scopedVars)}'`);
    queryText = queryText.replace(/\$__timeTo\(\)/g, `'${this.getTimeToValue(scopedVars)}'`);
    
    return {
      ...query,
      queryText,
    };
  }
  
  private getTimeFromValue(scopedVars: ScopedVars): string {
    // Get the timeFrom value in the format Ocient expects (YYYY-MM-DD HH:MM:SS)
    return this.formatOcientTimestamp(getTemplateSrv().replace('${__from:date:iso}', scopedVars));
  }
  
  private getTimeToValue(scopedVars: ScopedVars): string {
    // Get the timeTo value in the format Ocient expects (YYYY-MM-DD HH:MM:SS)
    return this.formatOcientTimestamp(getTemplateSrv().replace('${__to:date:iso}', scopedVars));
  }
  
  private formatOcientTimestamp(isoTimestamp: string): string {
    // Convert from ISO format to Ocient's preferred format
    const date = new Date(isoTimestamp);
    
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    // Format: YYYY-MM-DD HH:MM:SS
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  filterQuery(query: MyQuery): boolean {
    // if no query has been provided, prevent the query from being executed
    return !!query.queryText;
  }

  /**
   * Fetches the list of schemas from the database
   */
  async getSchemas(): Promise<string[]> {
    console.log('======= getSchemas method called =======');
    
    // Try to perform a simple test query first to check connection
    try {
      const testQuery = {
        refId: 'test',
        queryText: 'SELECT 1 as test',
      };
      
      console.log('Executing test query:', testQuery);
      const testResponse = await firstValueFrom(this.query({
        targets: [testQuery as MyQuery],
      } as any));
      
      console.log('Test query response:', testResponse);
    } catch (testError) {
      console.error('Test query failed:', testError);
    }
    
    // Now run the schema query
    const query = {
      refId: 'schemas',
      queryText: 'SELECT DISTINCT(table_schema) FROM information_schema.tables ORDER BY table_schema',
    };

    console.log('Schema query:', query);
    
    try {
      console.log('Sending schema query to backend...');
      const response = await firstValueFrom(this.query({
        targets: [query as MyQuery],
      } as any));
      
      console.log('Schema response received:', response);
      console.log('Response data:', response?.data);
      
      if (response?.data && response.data.length > 0) {
        console.log('Data frame:', response.data[0]);
        
        if (response.data[0].fields && response.data[0].fields.length > 0) {
          console.log('Fields:', response.data[0].fields);
          console.log('Values:', response.data[0].fields[0].values);
          
          // Extract the schema names from the first column of each row
          const schemas = response.data[0].fields[0].values.toArray();
          console.log('Extracted schemas:', schemas);
          return schemas;
        } else {
          console.error('Schema response has no fields');
        }
      } else {
        console.error('Schema response has no data frames');
      }

      return [];
    } catch (error) {
      console.error('Error fetching schemas:', error);
      throw error;
    }
  }

  /**
   * Fetches the list of tables for a given schema
   */
  async getTables(schema: string): Promise<string[]> {
    if (!schema) {
      return [];
    }

    const query = {
      refId: 'tables',
      queryText: `SELECT DISTINCT(table_name) FROM information_schema.tables WHERE table_schema = '${schema}' ORDER BY table_name`,
    };

    const response = await firstValueFrom(this.query({
      targets: [query as MyQuery],
    } as any));

    if (response?.data && response.data.length > 0) {
      // Extract the table names from the first column of each row
      return response.data[0].fields[0].values.toArray();
    }

    return [];
  }

  /**
   * Fetches the column information for a given schema and table
   */
  async getColumns(schema: string, table: string): Promise<ColumnInfo[]> {
    if (!schema || !table) {
      return [];
    }

    const query = {
      refId: 'columns',
      queryText: `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = '${table}' ORDER BY column_name`,
    };

    const response = await firstValueFrom(this.query({
      targets: [query as MyQuery],
    } as any));

    if (response?.data && response.data.length > 0) {
      // Transform the data frame into ColumnInfo objects
      const frame = response.data[0];
      const result: ColumnInfo[] = [];

      const nameField = frame.fields.find((f: any) => f.name === 'column_name');
      const typeField = frame.fields.find((f: any) => f.name === 'data_type');
      const nullableField = frame.fields.find((f: any) => f.name === 'is_nullable');
      const defaultField = frame.fields.find((f: any) => f.name === 'column_default');

      if (nameField && typeField && nullableField && defaultField) {
        const length = nameField.values.length;
        for (let i = 0; i < length; i++) {
          result.push({
            column_name: nameField.values.get(i),
            data_type: typeField.values.get(i),
            is_nullable: nullableField.values.get(i),
            column_default: defaultField.values.get(i),
          });
        }
      }

      return result;
    }

    return [];
  }

  /**
   * Fetches count of distinct values for a column
   * Used to determine if there are too many values to load at once
   */
  async getDistinctValueCount(schema: string, table: string, column: string): Promise<number> {
    if (!schema || !table || !column) {
      return 0;
    }

    const query = {
      refId: 'distinct_count',
      queryText: `SELECT COUNT(DISTINCT ${column}) AS value_count FROM ${schema}.${table} WHERE ${column} IS NOT NULL`,
    };

    try {
      const response = await firstValueFrom(this.query({
        targets: [query as MyQuery],
      } as any));

      if (response?.data && response.data.length > 0) {
        const frame = response.data[0];
        if (frame.fields && frame.fields.length > 0) {
          const countValue = frame.fields[0].values.get(0);
          return typeof countValue === 'number' ? countValue : 0;
        }
      }
    } catch (error) {
      console.error('Error fetching distinct value count:', error);
    }

    return 0;
  }

  /**
   * Fetches distinct values for a specific column in a table
   * Used for populating possible WHERE clause values
   */
  async getDistinctColumnValues(
    schema: string, 
    table: string, 
    column: string, 
    options?: { 
      limit?: number; 
      offset?: number; 
      searchPattern?: string;
    }
  ): Promise<{ values: string[]; totalCount: number; hasMore: boolean }> {
    if (!schema || !table || !column) {
      return { values: [], totalCount: 0, hasMore: false };
    }

    const limit = options?.limit || 100;
    const offset = options?.offset || 0;
    const searchPattern = options?.searchPattern || '';
    
    // Get total count of distinct values first
    const totalCount = await this.getDistinctValueCount(schema, table, column);
    
    // Build the query with optional filtering
    let queryText = `SELECT DISTINCT ${column} 
                     FROM ${schema}.${table} 
                     WHERE ${column} IS NOT NULL`;
      
    if (searchPattern) {
      // Add case-insensitive search filter if provided
      queryText += ` AND LOWER(CAST(${column} AS VARCHAR)) LIKE LOWER('%${searchPattern}%')`;
    }
      
    queryText += ` ORDER BY ${column} ASC 
                  LIMIT ${limit} OFFSET ${offset}`;

    const query = {
      refId: 'distinct_values',
      queryText: queryText,
    };

    try {
      const response = await firstValueFrom(this.query({
        targets: [query as MyQuery],
      } as any));

      if (response?.data && response.data.length > 0) {
        // Extract the values from the first column
        const frame = response.data[0];
        if (frame.fields && frame.fields.length > 0) {
          // Convert all values to strings
          const values = frame.fields[0].values.toArray().map((value: any) => String(value));
          return { 
            values, 
            totalCount, 
            hasMore: offset + values.length < totalCount 
          };
        }
      }
    } catch (error) {
      console.error('Error fetching distinct values:', error);
    }

    return { values: [], totalCount, hasMore: false };
  }
}
