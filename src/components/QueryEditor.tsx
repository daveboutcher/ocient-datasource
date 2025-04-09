import React, { ChangeEvent, useEffect, useState, useCallback } from 'react';
import { 
  InlineField, 
  TextArea, 
  Stack, 
  Select, 
  Button, 
  InlineSwitch, 
  InlineFieldRow, 
  Alert,
  Checkbox,
  IconButton,
  FieldSet,
  Input,
  Modal,
  Spinner
} from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery, ColumnInfo, SelectedColumn, WhereClause } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  // Log when the component renders
  console.log('=== QueryEditor RENDERING ===');
  console.log('Props:', { query, onChange: !!onChange, onRunQuery: !!onRunQuery, datasource: !!datasource });
  // Local state for schema/table/column information
  const [schemas, setSchemas] = useState<Array<SelectableValue<string>>>([]);
  const [tables, setTables] = useState<Array<SelectableValue<string>>>([]);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Column and where clause state
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>(query.selectedColumns || []);
  const [whereClauses, setWhereClauses] = useState<WhereClause[]>(query.whereClauses || []);
  const [timeseriesColumn, setTimeseriesColumn] = useState<string | undefined>(query.timeseriesColumn);
  
  // For adding new columns/where clauses
  const [newColumnSelection, setNewColumnSelection] = useState<string>('');
  
  // For distinct values modal
  const [isValuesModalOpen, setIsValuesModalOpen] = useState<boolean>(false);
  const [loadingDistinctValues, setLoadingDistinctValues] = useState<boolean>(false);
  const [distinctValues, setDistinctValues] = useState<string[]>([]);
  const [totalValueCount, setTotalValueCount] = useState<number>(0);
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [currentWhereClauseIndex, setCurrentWhereClauseIndex] = useState<number>(-1);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [hasMoreValues, setHasMoreValues] = useState<boolean>(false);
  const PAGE_SIZE = 100;
  
  // Initialize the rawQuery flag from the query or default it to false
  const rawQuery = query.rawQuery !== undefined ? query.rawQuery : false;

  // Load schemas from the datasource
  const loadSchemas = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('Fetching schemas...');
      const schemaList = await datasource.getSchemas();
      console.log('Received schemas:', schemaList);
      setSchemas(schemaList.map(s => ({ label: s, value: s })));
    } catch (err) {
      console.error('Error loading schemas:', err);
      setError('Failed to load schemas. Please check your connection: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [datasource, setIsLoading, setError, setSchemas]);

  // Load tables for a selected schema
  const loadTables = useCallback(async (schema: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const tableList = await datasource.getTables(schema);
      setTables(tableList.map(t => ({ label: t, value: t })));
    } catch (err) {
      console.error('Error loading tables:', err);
      setError(`Failed to load tables for schema "${schema}".`);
    } finally {
      setIsLoading(false);
    }
  }, [datasource, setIsLoading, setError, setTables]);

  // Load columns for a selected table
  const loadColumns = useCallback(async (schema: string, table: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const columnList = await datasource.getColumns(schema, table);
      setColumns(columnList);
    } catch (err) {
      console.error('Error loading columns:', err);
      setError(`Failed to load columns for table "${schema}.${table}".`);
    } finally {
      setIsLoading(false);
    }
  }, [datasource, setIsLoading, setError, setColumns]);
  
  // When component mounts, load available schemas
  useEffect(() => {
    console.log('QueryEditor component mounted');
    console.log('Datasource object:', datasource);
    console.log('About to call loadSchemas()');
    loadSchemas();
  }, [datasource, loadSchemas]);

  // When schema changes, load available tables
  useEffect(() => {
    if (query.schema) {
      loadTables(query.schema);
    } else {
      setTables([]);
    }
  }, [query.schema, loadTables]);

  // When table changes, load columns
  useEffect(() => {
    if (query.schema && query.table) {
      loadColumns(query.schema, query.table);
    } else {
      setColumns([]);
    }
  }, [query.schema, query.table, loadColumns]);

  // Handle changes to the query text
  const onQueryTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange({ ...query, queryText: event.target.value });
  };

  // Handle changes to the schema selection
  const onSchemaChange = (selected: SelectableValue<string>) => {
    onChange({ 
      ...query, 
      schema: selected.value,
      // Clear the table selection when schema changes
      table: undefined
    });
  };

  // Handle changes to the table selection
  const onTableChange = (selected: SelectableValue<string>) => {
    onChange({ ...query, table: selected.value });
  };

  // Column selection handlers
  const onAddColumn = () => {
    if (!newColumnSelection) { return; }
    
    // Check if column is already selected
    if (selectedColumns.some(c => c.name === newColumnSelection)) { return; }
    
    const newColumn: SelectedColumn = {
      name: newColumnSelection,
      isTimeseriesColumn: false,
    };
    
    const updatedColumns = [...selectedColumns, newColumn];
    setSelectedColumns(updatedColumns);
    setNewColumnSelection('');
    
    // Update query
    onChange({
      ...query,
      selectedColumns: updatedColumns,
    });
  };
  
  const onRemoveColumn = (columnName: string) => {
    const updatedColumns = selectedColumns.filter(c => c.name !== columnName);
    setSelectedColumns(updatedColumns);
    
    // If we're removing the timeseries column, update that as well
    let updatedTimeseriesColumn = timeseriesColumn;
    if (timeseriesColumn === columnName) {
      updatedTimeseriesColumn = undefined;
      setTimeseriesColumn(undefined);
    }
    
    // Update query
    onChange({
      ...query,
      selectedColumns: updatedColumns,
      timeseriesColumn: updatedTimeseriesColumn,
    });
  };
  
  const onToggleTimeseriesColumn = (columnName: string, isTimeseriesColumn: boolean) => {
    // Find the column data to check if it's a timestamp
    const columnInfo = columns.find(c => c.column_name === columnName);
    const isTimestampType = columnInfo?.data_type.toLowerCase().includes('timestamp') || 
                           columnInfo?.data_type.toLowerCase().includes('date');
    
    if (!isTimestampType && isTimeseriesColumn) {
      // Warning: Selected a non-timestamp column as timeseries
      console.warn(`Column ${columnName} is not a timestamp type but was selected as timeseries column`);
    }
    
    // Update the column's isTimeseriesColumn flag
    const updatedColumns = selectedColumns.map(c => {
      if (c.name === columnName) {
        return { ...c, isTimeseriesColumn };
      }
      // Only one column can be timeseries column
      if (isTimeseriesColumn) {
        return { ...c, isTimeseriesColumn: false };
      }
      return c;
    });
    
    setSelectedColumns(updatedColumns);
    
    // Update timeseries column state
    const newTimeseriesColumn = isTimeseriesColumn ? columnName : undefined;
    setTimeseriesColumn(newTimeseriesColumn);
    
    // Update query
    onChange({
      ...query,
      selectedColumns: updatedColumns,
      timeseriesColumn: newTimeseriesColumn,
    });
  };
  
  // Where clause handlers
  const onAddWhereClause = () => {
    const newClause: WhereClause = {
      column: columns.length > 0 ? columns[0].column_name : '',
      operator: '=',
      value: '',
    };
    
    const updatedClauses = [...whereClauses, newClause];
    setWhereClauses(updatedClauses);
    
    // Update query
    onChange({
      ...query,
      whereClauses: updatedClauses,
    });
  };
  
  const onRemoveWhereClause = (index: number) => {
    const updatedClauses = whereClauses.filter((_, i) => i !== index);
    setWhereClauses(updatedClauses);
    
    // Update query
    onChange({
      ...query,
      whereClauses: updatedClauses,
    });
  };
  
  const onUpdateWhereClause = (index: number, field: keyof WhereClause, value: string) => {
    const updatedClauses = whereClauses.map((clause, i) => {
      if (i === index) {
        return { ...clause, [field]: value };
      }
      return clause;
    });
    
    setWhereClauses(updatedClauses);
    
    // Update query
    onChange({
      ...query,
      whereClauses: updatedClauses,
    });
  };
  
  // Reset distinct values state
  const resetDistinctValuesState = useCallback(() => {
    setDistinctValues([]);
    setSelectedValue('');
    setSearchFilter('');
    setCurrentPage(0);
    setTotalValueCount(0);
    setHasMoreValues(false);
  }, []);

  // Load distinct values for a column - open modal and load first page
  const loadDistinctValues = useCallback(async (index: number) => {
    const clause = whereClauses[index];
    if (!query.schema || !query.table || !clause.column) {
      return;
    }
    
    setCurrentWhereClauseIndex(index);
    resetDistinctValuesState();
    setIsValuesModalOpen(true);
    setLoadingDistinctValues(true);
    
    // Load first page directly
    try {
      const result = await datasource.getDistinctColumnValues(
        query.schema, 
        query.table, 
        clause.column, 
        { limit: PAGE_SIZE, offset: 0 }
      );
      
      setDistinctValues(result.values);
      setTotalValueCount(result.totalCount);
      setHasMoreValues(result.hasMore);
    } catch (err) {
      console.error('Error loading distinct values:', err);
      setError(`Failed to load values for column "${clause.column}".`);
    } finally {
      setLoadingDistinctValues(false);
    }
  }, [datasource, query.schema, query.table, whereClauses, resetDistinctValuesState]);
  
  // Navigate to next/previous page
  const navigatePage = useCallback((direction: 'next' | 'prev') => {
    const newPage = direction === 'next' ? currentPage + 1 : Math.max(0, currentPage - 1);
    
    if (currentWhereClauseIndex !== -1 && query.schema && query.table) {
      const clause = whereClauses[currentWhereClauseIndex];
      if (clause.column) {
        setLoadingDistinctValues(true);
        
        datasource.getDistinctColumnValues(
          query.schema, 
          query.table, 
          clause.column, 
          {
            limit: PAGE_SIZE,
            offset: newPage * PAGE_SIZE,
            searchPattern: searchFilter
          }
        ).then(result => {
          setDistinctValues(result.values);
          setTotalValueCount(result.totalCount);
          setHasMoreValues(result.hasMore);
          setCurrentPage(newPage);
        }).catch(err => {
          console.error('Error loading distinct values:', err);
          setError('Failed to load values for column ' + clause.column);
        }).finally(() => {
          setLoadingDistinctValues(false);
        });
      }
    }
  }, [datasource, query.schema, query.table, whereClauses, currentWhereClauseIndex, currentPage, searchFilter]);
  
  
  // Handle search input changes
  const handleSearchChange = useCallback((newSearchText: string) => {
    setSearchFilter(newSearchText);
    // Reset to first page when search changes
    setCurrentPage(0);
    
    // We need to call loadDistinctValuesPage directly here to avoid circular dependency
    if (currentWhereClauseIndex !== -1 && query.schema && query.table) {
      const clause = whereClauses[currentWhereClauseIndex];
      if (clause.column) {
        setLoadingDistinctValues(true);
        
        datasource.getDistinctColumnValues(
          query.schema, 
          query.table, 
          clause.column, 
          {
            limit: PAGE_SIZE,
            offset: 0,
            searchPattern: newSearchText
          }
        ).then(result => {
          setDistinctValues(result.values);
          setTotalValueCount(result.totalCount);
          setHasMoreValues(result.hasMore);
          
          // If there's only one value and we're doing a search, auto-select it
          if (result.values.length === 1 && newSearchText) {
            setSelectedValue(result.values[0]);
          }
        }).catch(err => {
          console.error('Error loading distinct values:', err);
          setError('Failed to load values for column ' + clause.column);
        }).finally(() => {
          setLoadingDistinctValues(false);
        });
      }
    }
  }, [datasource, query.schema, query.table, whereClauses, currentWhereClauseIndex]);
  
  // Apply selected value to where clause
  const applySelectedValue = () => {
    if (currentWhereClauseIndex !== -1 && selectedValue) {
      onUpdateWhereClause(currentWhereClauseIndex, 'value', selectedValue);
    }
    
    // Close the modal
    setIsValuesModalOpen(false);
  };

  // Toggle between raw query mode and structured builder
  const onRawQueryToggle = () => {
    onChange({ ...query, rawQuery: !rawQuery });
  };

  // Build SQL query from schema, table, columns, and where clauses
  const buildQuery = () => {
    if (query.schema && query.table) {
      // Get columns string
      let columnsStr = '*';
      if (selectedColumns.length > 0) {
        columnsStr = selectedColumns.map(c => c.name).join(', ');
      }
      
      // Start building the SQL
      let sql = `SELECT ${columnsStr} FROM ${query.schema}.${query.table}`;
      
      // Add WHERE clauses
      if (whereClauses.length > 0 || timeseriesColumn) {
        sql += ' WHERE ';
        
        // Add regular WHERE clauses
        const whereClauseStrings = whereClauses.map(clause => 
          `${clause.column} ${clause.operator} '${clause.value}'`
        );
        
        // Add time range filter for timeseries column if specified
        if (timeseriesColumn) {
          const timeFilter = `${timeseriesColumn} >= $__timeFrom() AND ${timeseriesColumn} <= $__timeTo() ORDER BY ${timeseriesColumn} ASC`;
          whereClauseStrings.push(timeFilter);
        }
        
        sql += whereClauseStrings.join(' AND ');
      }
      
      onChange({ ...query, queryText: sql });
      onRunQuery();
    }
  };

  // Run the query
  const onRunQueryClick = () => {
    onRunQuery();
  };

  return (
    <Stack gap={1} direction="column">
      {error && (
        <Alert title="Error" severity="error" onRemove={() => setError(null)}>
          {error}
        </Alert>
      )}

      <InlineFieldRow>
        <InlineField label="Query Mode" tooltip="Switch between SQL editor and query builder">
          <InlineSwitch
            value={rawQuery}
            onChange={onRawQueryToggle}
            label={rawQuery ? 'Raw SQL' : 'Query Builder'}
          />
        </InlineField>
      </InlineFieldRow>
      
      {!rawQuery && (
        <Alert title="UI Tip" severity="info" style={{ marginBottom: '8px' }} onRemove={() => {}}>
          To see dropdown options, click in any dropdown field and type a space
        </Alert>
      )}

      {rawQuery ? (
        <InlineField label="SQL Query" grow tooltip="Enter SQL query to execute against Ocient">
          <TextArea
            id="query-editor-query-text"
            rows={5}
            className="gf-form-input"
            onChange={onQueryTextChange}
            value={query.queryText || ''}
            required
            placeholder="SELECT * FROM my_table LIMIT 100"
            onBlur={onRunQueryClick}
          />
        </InlineField>
      ) : (
        <>
          <InlineFieldRow>
            <InlineField label="Schema" tooltip="Select a database schema">
              <Select
                options={schemas}
                value={schemas.find(s => s.value === query.schema)}
                onChange={onSchemaChange}
                isLoading={isLoading}
                placeholder={isLoading ? "Loading schemas..." : "Type space to see options"}
                width={30}
                isClearable
              />
            </InlineField>
          </InlineFieldRow>

          <InlineFieldRow>
            <InlineField label="Table" tooltip="Select a table from the schema">
              <Select
                options={tables}
                value={tables.find(t => t.value === query.table)}
                onChange={onTableChange}
                isLoading={isLoading}
                placeholder={isLoading ? "Loading tables..." : "Type space to see options"}
                width={30}
                isDisabled={!query.schema}
                isClearable
              />
            </InlineField>
          </InlineFieldRow>

          {columns.length > 0 && (
            <FieldSet label="Available Columns" style={{ marginBottom: '10px' }}>
              <div style={{ marginBottom: '8px' }}>
                {columns.map(col => (
                  <div key={col.column_name} style={{ marginBottom: '4px' }}>
                    <strong>{col.column_name}</strong> ({col.data_type})
                    {col.is_nullable === 'YES' ? ' NULLABLE' : ''}
                  </div>
                ))}
              </div>
            </FieldSet>
          )}
          
          {/* Column Selection Section */}
          <FieldSet label="Selected Columns">
            {selectedColumns.length === 0 && (
              <div style={{ marginBottom: '8px' }}>No columns selected - will use * (all columns)</div>
            )}
            
            {selectedColumns.map((col, index) => (
              <div key={index} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                <span style={{ marginRight: '8px' }}>{col.name}</span>
                
                {/* Add timeseries checkbox for timestamp columns */}
                {columns.find(c => 
                  c.column_name === col.name && 
                  (c.data_type.toLowerCase().includes('timestamp') || c.data_type.toLowerCase().includes('date'))
                ) && (
                  <InlineField label="Time Column" tooltip="Use this column for time series data" style={{ marginRight: '8px' }}>
                    <Checkbox 
                      value={col.isTimeseriesColumn} 
                      onChange={e => onToggleTimeseriesColumn(col.name, e.currentTarget.checked)} 
                    />
                  </InlineField>
                )}
                
                <IconButton name="trash-alt" onClick={() => onRemoveColumn(col.name)} tooltip="Remove column" />
              </div>
            ))}
            
            {/* Add Column Dropdown */}
            <div style={{ display: 'flex', marginTop: '8px', marginBottom: '8px' }}>
              <Select
                options={columns.map(c => ({ label: c.column_name, value: c.column_name }))}
                value={newColumnSelection}
                onChange={e => setNewColumnSelection(e.value || '')}
                placeholder={isLoading ? "Loading columns..." : "Type space to see options"}
                width={30}
                isDisabled={!query.schema || !query.table}
                menuPlacement="bottom"
              />
              <Button 
                onClick={onAddColumn} 
                variant="secondary" 
                disabled={!newColumnSelection}
                style={{ marginLeft: '8px' }}
              >
                Add Column
              </Button>
            </div>
          </FieldSet>
          
          {/* Where Clauses Section */}
          <FieldSet label="WHERE Clauses">
            {whereClauses.length === 0 && (
              <div style={{ marginBottom: '8px' }}>No WHERE clauses - all rows will be returned</div>
            )}
            
            {whereClauses.map((clause, index) => (
              <div key={index} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center' }}>
                {/* Column dropdown */}
                <Select
                  options={columns.map(c => ({ label: c.column_name, value: c.column_name }))}
                  value={clause.column}
                  onChange={e => onUpdateWhereClause(index, 'column', e.value || '')}
                  width={15}
                  placeholder="Type space to see options"
                />
                
                {/* Operator dropdown */}
                <Select
                  options={[
                    { label: '=', value: '=' },
                    { label: '!=', value: '!=' },
                    { label: '>', value: '>' },
                    { label: '>=', value: '>=' },
                    { label: '<', value: '<' },
                    { label: '<=', value: '<=' },
                    { label: 'LIKE', value: 'LIKE' },
                  ]}
                  value={clause.operator}
                  onChange={e => onUpdateWhereClause(index, 'operator', e.value || '')}
                  width={8}
                  style={{ marginLeft: '4px' }}
                  placeholder="Type space"
                />
                
                {/* Value input */}
                <Input
                  value={clause.value}
                  onChange={e => onUpdateWhereClause(index, 'value', e.currentTarget.value)}
                  width={15}
                  style={{ marginLeft: '4px' }}
                  placeholder="Value"
                />
                
                {/* Values button - only show if column is selected */}
                {clause.column && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadDistinctValues(index)}
                    style={{ marginLeft: '4px' }}
                    icon="list-ul"
                    tooltip="Get distinct values for this column"
                  >
                    Values
                  </Button>
                )}
                
                {/* Remove button */}
                <IconButton 
                  name="trash-alt" 
                  onClick={() => onRemoveWhereClause(index)} 
                  tooltip="Remove condition"
                  style={{ marginLeft: '4px' }}
                />
              </div>
            ))}
            
            <Button 
              onClick={onAddWhereClause} 
              variant="secondary" 
              disabled={!query.schema || !query.table || columns.length === 0}
              style={{ marginTop: '8px' }}
            >
              Add WHERE Clause
            </Button>
          </FieldSet>
          
          {/* Timeseries note */}
          {timeseriesColumn && (
            <Alert title="Time Filter" severity="info">
              A time range filter will be automatically added for column <strong>{timeseriesColumn}</strong>.
            </Alert>
          )}
          
          <div className="gf-form" style={{ marginTop: '16px' }}>
            <Button
              onClick={buildQuery}
              disabled={!query.schema || !query.table}
              variant="primary"
            >
              Build Query
            </Button>
          </div>

          {query.queryText && (
            <InlineField label="Generated SQL" grow>
              <TextArea
                rows={3}
                value={query.queryText}
                readOnly
              />
            </InlineField>
          )}
        </>
      )}

      {/* Distinct Values Selection Modal */}
      {isValuesModalOpen && (
        <Modal
          isOpen={isValuesModalOpen}
          title={`Select Value for ${whereClauses[currentWhereClauseIndex]?.column || 'Column'}`}
          onDismiss={() => setIsValuesModalOpen(false)}
        >
          <div style={{ padding: '16px' }}>
            <Stack direction="column" gap={2}>
              {/* Value count info */}
              {totalValueCount > 0 && (
                <div>
                  <small>
                    {totalValueCount > PAGE_SIZE 
                      ? `Showing ${currentPage * PAGE_SIZE + 1}-${Math.min((currentPage + 1) * PAGE_SIZE, totalValueCount)} of ${totalValueCount} values` 
                      : `${totalValueCount} values found`}
                  </small>
                </div>
              )}
              
              {/* Search filter with debounce - this uses server-side filtering */}
              <div>
                <Input
                  placeholder="Search values..."
                  value={searchFilter}
                  onChange={e => handleSearchChange(e.currentTarget.value)}
                  width={30}
                  prefix={<IconButton name="search" aria-label="Search values" />}
                />
                {searchFilter && (
                  <small style={{ display: 'block', marginTop: '4px' }}>
                    Searching for values containing &quot;{searchFilter}&quot;
                  </small>
                )}
              </div>

              {/* Values list */}
              <div 
                style={{ 
                  maxHeight: '300px', 
                  overflowY: 'auto', 
                  border: '1px solid var(--border-weak)', 
                  borderRadius: '4px', 
                  padding: '8px',
                  backgroundColor: 'var(--background-secondary)'
                }}
              >
                {loadingDistinctValues ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                    <Spinner size={24} />
                  </div>
                ) : distinctValues.length === 0 ? (
                  <div style={{ 
                    padding: '12px', 
                    textAlign: 'center',
                    color: 'var(--text-secondary)'
                  }}>
                    {searchFilter 
                      ? `No values matching "${searchFilter}" found`.replace(/"/g, '&quot;') 
                      : 'No values found'}
                  </div>
                ) : (
                  <div 
                  className="vertical-radio-list"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                    {distinctValues.map((value, index) => (
                      <div 
                        key={index} 
                        className={`radio-item ${selectedValue === value ? 'selected-item' : ''}`} 
                        style={{ 
                          padding: '6px 8px', 
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: selectedValue === value ? 'var(--background-hover)' : 'transparent',
                          transition: 'background-color 150ms ease',
                          color: 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        onClick={() => setSelectedValue(value)}
                        onMouseEnter={(e) => { 
                          if (selectedValue !== value) {
                            e.currentTarget.style.backgroundColor = 'var(--background-hover)';
                            e.currentTarget.style.opacity = '0.8';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedValue !== value) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.opacity = '1';
                          }
                        }}
                      >
                        <input
                          type="radio"
                          id={`value-option-${index}`}
                          name="distinct-value"
                          value={value}
                          checked={selectedValue === value}
                          onChange={() => setSelectedValue(value)}
                          style={{ 
                            marginRight: '8px',
                            accentColor: 'var(--primary-text-link)' 
                          }}
                        />
                        <label 
                          htmlFor={`value-option-${index}`}
                          style={{ 
                            cursor: 'pointer',
                            wordBreak: 'break-word',
                            width: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: selectedValue === value ? '500' : 'normal'
                          }}
                          title={value}
                        >
                          {value}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Pagination controls */}
              {totalValueCount > PAGE_SIZE && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigatePage('prev')}
                    disabled={currentPage === 0 || loadingDistinctValues}
                    icon="angle-left"
                  >
                    Previous
                  </Button>
                  
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    Page {currentPage + 1} of {Math.ceil(totalValueCount / PAGE_SIZE)}
                  </div>
                  
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigatePage('next')}
                    disabled={!hasMoreValues || loadingDistinctValues}
                    icon="angle-right"
                  >
                    Next
                  </Button>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <Button variant="secondary" onClick={() => setIsValuesModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={applySelectedValue}
                  disabled={!selectedValue}
                >
                  Apply
                </Button>
              </div>
            </Stack>
          </div>
        </Modal>
      )}
    </Stack>
  );
}
