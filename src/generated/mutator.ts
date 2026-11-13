import axios, { AxiosRequestConfig, AxiosInstance, AxiosResponse } from "axios";

let currentBaseUrl = "";
let currentLicenseToken = "";
let currentTenantId = "";

const createAxiosInstance = (): AxiosInstance => {
  const headers: Record<string, string> = {};
  if (currentLicenseToken) {
    headers["Authorization"] = `Bearer ${currentLicenseToken}`;
  }
  // X-Tenant-Id is this service's auth header: configured tenant wins, else the
  // licence (services.json licenceAuth "tenant-header-fallback").
  if (currentTenantId) {
    headers["X-Tenant-Id"] = currentTenantId;
  } else if (currentLicenseToken) {
    headers["X-Tenant-Id"] = `Bearer ${currentLicenseToken}`;
  }
  return axios.create({ baseURL: currentBaseUrl, headers });
};

let AXIOS_INSTANCE = createAxiosInstance();

export const setApiConfig = (config: {
  baseUrl: string;
  apiToken?: string;
  tenantId?: string;
}) => {
  currentBaseUrl = config.baseUrl;
  currentLicenseToken = config.apiToken || "";
  currentTenantId = config.tenantId || "";
  AXIOS_INSTANCE = createAxiosInstance();
};

export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const controller = new AbortController();
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
    signal: controller.signal,
  }).then((response: AxiosResponse<T>) => response.data) as Promise<T> & {
    cancel: () => void;
  };
  promise.cancel = () => controller.abort();
  return promise;
};

export type ErrorType<Error> = Error;
