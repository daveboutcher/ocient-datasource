import React, { ChangeEvent } from 'react';
import { InlineField, Input, SecretInput } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { MyDataSourceOptions, MySecureJsonData, DEFAULT_CONFIG } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions, MySecureJsonData> {}

export function ConfigEditor(props: Props) {
  // Log when the component renders
  console.log('=== ConfigEditor RENDERING ===');
  console.log('ConfigEditor Props:', { ...props, options: { ...props.options }});
  
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;
  
  // Set default values if not already set
  React.useEffect(() => {
    console.log('ConfigEditor useEffect running - initial jsonData:', jsonData);
    console.log('DEFAULT_CONFIG:', DEFAULT_CONFIG);
    
    const defaultedJsonData = {
      ...DEFAULT_CONFIG,
      ...jsonData,
    };
    
    console.log('Defaulted jsonData:', defaultedJsonData);
    
    // Only update if values have changed
    if (JSON.stringify(defaultedJsonData) !== JSON.stringify(jsonData)) {
      console.log('Updating options with defaulted values');
      onOptionsChange({
        ...options,
        jsonData: defaultedJsonData,
      });
    } else {
      console.log('No need to update options, values already set');
    }
  }, [jsonData, onOptionsChange, options]);
  
  // Log when any configuration change is saved
  React.useEffect(() => {
    console.log('Current configuration:', {
      host: jsonData.host,
      port: jsonData.port,
      database: jsonData.database,
      insecureSkipVerify: jsonData.insecureSkipVerify,
      username: secureJsonFields.username ? '(configured)' : (secureJsonData?.username || '(not set)'),
      password: secureJsonFields.password ? '(configured)' : (secureJsonData?.password ? '(set but not saved)' : '(not set)'),
    });
  }, [jsonData, secureJsonData, secureJsonFields]);

  const onHostChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        host: event.target.value,
      },
    });
  };

  const onPortChange = (event: ChangeEvent<HTMLInputElement>) => {
    const port = parseInt(event.target.value, 10);
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        port: isNaN(port) ? undefined : port,
      },
    });
  };

  const onDatabaseChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        database: event.target.value,
      },
    });
  };

  const onSkipVerifyChange = (event: ChangeEvent<HTMLInputElement>) => {
    const skipVerify = event.target.checked;
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        insecureSkipVerify: skipVerify,
      },
    });
  };

  // Secure fields (only sent to the backend)
  const onUsernameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        username: event.target.value,
      },
    });
  };

  const onPasswordChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        password: event.target.value,
      },
    });
  };

  const onResetUsername = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        username: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        username: '',
      },
    });
  };

  const onResetPassword = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        password: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        password: '',
      },
    });
  };

  return (
    <>
      <InlineField label="Host" labelWidth={14} interactive tooltip={'Ocient server hostname or IP'}>
        <Input
          id="config-editor-host"
          onChange={onHostChange}
          value={jsonData.host || ''}
          placeholder="Enter the host, e.g. localhost"
          width={40}
        />
      </InlineField>
      <InlineField label="Port" labelWidth={14} interactive tooltip={'Ocient server port'}>
        <Input
          id="config-editor-port"
          onChange={onPortChange}
          value={jsonData.port || DEFAULT_CONFIG.port || ''}
          type="number"
          placeholder="Enter the port, default is 443"
          width={40}
        />
      </InlineField>
      <InlineField label="Database" labelWidth={14} interactive tooltip={'Database name'}>
        <Input
          id="config-editor-database"
          onChange={onDatabaseChange}
          value={jsonData.database || ''}
          placeholder="Enter the database name"
          width={40}
        />
      </InlineField>
      <InlineField 
        label="Skip TLS Verify" 
        labelWidth={14} 
        interactive 
        tooltip={'If selected, the server certificate will not be verified for HTTPS connections'}
      >
        <input
          id="config-editor-skip-verify"
          type="checkbox"
          onChange={onSkipVerifyChange}
          checked={jsonData.insecureSkipVerify || false}
        />
      </InlineField>
      <InlineField label="Username" labelWidth={14} interactive tooltip={'Database username'}>
        <SecretInput
          id="config-editor-username"
          isConfigured={secureJsonFields.username}
          value={secureJsonData?.username || ''}
          placeholder="Enter your username"
          width={40}
          onReset={onResetUsername}
          onChange={onUsernameChange}
        />
      </InlineField>
      <InlineField label="Password" labelWidth={14} interactive tooltip={'Database password'}>
        <SecretInput
          id="config-editor-password"
          isConfigured={secureJsonFields.password}
          value={secureJsonData?.password || ''}
          placeholder="Enter your password"
          width={40}
          onReset={onResetPassword}
          onChange={onPasswordChange}
        />
      </InlineField>
    </>
  );
}
