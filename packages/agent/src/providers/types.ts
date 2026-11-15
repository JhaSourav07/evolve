export interface OllamaModelInfo {
  name: string;
  size: number;
  parameterSize?: string | undefined;
  family?: string | undefined;
  format?: string | undefined;
  quantizationLevel?: string | undefined;
  modifiedAt?: string | undefined;
}

export interface OllamaHealthResult {
  isHealthy: boolean;
  version?: string | undefined;
  modelsAvailable: number;
  activeModel?: string | undefined;
  error?: string | undefined;
}

export interface OllamaProviderConfig {
  baseUrl?: string | undefined;
  model?: string | undefined;
  defaultTemperature?: number | undefined;
  timeoutMs?: number | undefined;
}
