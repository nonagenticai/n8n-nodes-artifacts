/**
 * Mock for n8n-workflow module
 * Updated for auto-generated node architecture (v2)
 */

export class NodeOperationError extends Error {
  public node: any;
  public description?: string;

  constructor(node: any, messageOrError: string | Error, options?: { itemIndex?: number; description?: string }) {
    const message = messageOrError instanceof Error ? messageOrError.message : messageOrError;
    super(message);
    this.name = 'NodeOperationError';
    this.node = node;
    if (options?.description) this.description = options.description;
  }
}

export class NodeApiError extends Error {
  public node: any;
  public description?: string;

  constructor(node: any, errorOrObj: any, options?: { message?: string; description?: string }) {
    super(options?.message || (errorOrObj instanceof Error ? errorOrObj.message : String(errorOrObj)));
    this.name = 'NodeApiError';
    this.node = node;
    if (options?.description) this.description = options.description;
  }
}

export interface IDataObject {
  [key: string]: any;
}

export interface INodeExecutionData {
  json: IDataObject;
  binary?: Record<string, IBinaryData>;
  pairedItem?: { item: number };
}

export interface IBinaryData {
  fileName?: string;
  mimeType: string;
  data: string;
  fileSize?: number;
}

export interface IExecuteFunctions {
  getInputData(): INodeExecutionData[];
  getNodeParameter(parameterName: string, itemIndex: number, defaultValue?: any): any;
  getCredentials(type: string): Promise<IDataObject>;
  continueOnFail(): boolean;
  getNode(): any;
  helpers: {
    request: (options: any) => Promise<any>;
    httpRequest: (options: any) => Promise<any>;
    getBinaryDataBuffer: (itemIndex: number, propertyName: string) => Promise<Buffer>;
  };
}

export interface INodeType {
  description: INodeTypeDescription;
  execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}

export interface INodeTypeDescription {
  displayName: string;
  name: string;
  icon?: string;
  group: string[];
  version: number;
  subtitle?: string;
  description: string;
  defaults: {
    name: string;
  };
  inputs: string[];
  outputs: string[];
  credentials?: Array<{
    name: string;
    required: boolean;
  }>;
  properties: INodeProperties[];
}

export interface INodeProperties {
  displayName: string;
  name: string;
  type: string;
  default: any;
  required?: boolean;
  description?: string;
  options?: any[];
  displayOptions?: any;
  typeOptions?: any;
  placeholder?: string;
  noDataExpression?: boolean;
}

export interface ICredentialType {
  name: string;
  displayName: string;
  documentationUrl?: string;
  properties: INodeProperties[];
  test?: any;
  authenticate?: (credentials: ICredentialDataDecryptedObject, requestOptions: IHttpRequestOptions) => Promise<IHttpRequestOptions>;
}

export interface ICredentialTestFunctions {
  helpers: {
    request: (options: any) => Promise<any>;
  };
}

export interface INodeCredentialTestResult {
  status: string;
  message: string;
}

export interface ICredentialDataDecryptedObject {
  [key: string]: any;
}

export interface IHttpRequestOptions {
  url?: string;
  headers?: { [key: string]: string };
  body?: any;
  [key: string]: any;
}
