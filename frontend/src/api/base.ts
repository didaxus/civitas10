import { useLogto } from "@logto/react";
import { useMemo } from "react";
import { APP_ENV } from "../env";
import { getMissingScopes, OWNER_SHELL_REQUIRED_SCOPES } from "../authz/ownerScopes";
import { tenantRequestSignal } from "../tenant/lifecycle";

const API_URL = APP_ENV.api.url;
const API_RESOURCE = APP_ENV.api.resource;

type JwtPayload = {
  aud?: string | string[];
  sub?: string;
  client_id?: string;
  scope?: string;
  [key: string]: unknown;
};

export type ApiError = {
  message: string;
  status?: number;
};

export class ApiRequestError extends Error {
  status?: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status?: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const decodeAccessTokenPayload = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
};

const hasAudience = (payload: JwtPayload | null, resource: string) => {
  const audiences = Array.isArray(payload?.aud) ? payload?.aud : [payload?.aud];
  return audiences.includes(resource);
};

const parseTokenScopes = (scope?: string) => (typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : []);
const parseClaimList = (value: unknown) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  return [];
};

export const getAccessTokenDiagnostics = (token: string) => {
  const payload = decodeAccessTokenPayload(token);
  const scopes = parseTokenScopes(payload?.scope);
  const globalRoles = [
    ...parseClaimList(payload?.global_roles),
    ...parseClaimList(payload?.globalRoles),
    ...parseClaimList(payload?.roles),
    ...parseClaimList(payload?.role_names),
    ...parseClaimList(payload?.["https://civitas.didaxus.com/claims/global_roles"]),
    ...parseClaimList(payload?.["https://civitas.didaxus.com/global_roles"]),
  ];
  return {
    aud: payload?.aud ?? null,
    scope: payload?.scope ?? "",
    scopes,
    globalRoles: [...new Set(globalRoles)],
    hasExpectedAudience: hasAudience(payload, API_RESOURCE),
    expectedAudience: API_RESOURCE,
    missingOwnerShellScopes: getMissingScopes(scopes, OWNER_SHELL_REQUIRED_SCOPES),
  };
};

const assertOwnerUserAccessToken = (token: string) => {
  const payload = decodeAccessTokenPayload(token);

  if (payload?.client_id && payload.sub === payload.client_id) {
    throw new ApiRequestError(
      "Owner API token is not a user access token. Check that VITE_LOGTO_APP_ID points to the Logto SPA application, not the backend M2M application.",
      401,
      "OWNER_TOKEN_IS_CLIENT_TOKEN",
      { sub: payload.sub, client_id: payload.client_id, aud: payload.aud },
    );
  }

  if (payload && !hasAudience(payload, API_RESOURCE)) {
    throw new ApiRequestError(
      "Owner API token audience does not match the configured Civitas API resource.",
      401,
      "OWNER_TOKEN_AUDIENCE_MISMATCH",
      { aud: payload.aud, expected: API_RESOURCE },
    );
  }
};

const warnIfOwnerTokenLooksInsufficient = (token: string) => {
  const meta = import.meta as ImportMeta & { env?: { DEV?: boolean } };
  if (!meta.env?.DEV) return;

  const diagnostics = getAccessTokenDiagnostics(token);
  const missingScopes = diagnostics.missingOwnerShellScopes;
  if (diagnostics.hasExpectedAudience && missingScopes.length === 0) return;

  console.warn("Civitas owner API access token is missing expected claims", {
    aud: diagnostics.aud,
    expectedAudience: diagnostics.expectedAudience,
    scope: diagnostics.scope,
    missingOwnerShellScopes: missingScopes,
  });
};

const isJsonContentType = (contentType: string | null) => {
  const normalized = (contentType || "").toLowerCase();
  return normalized.includes("application/json") || normalized.includes("+json");
};

const readBodyPreview = async (response: Response) => {
  try {
    return (await response.text()).slice(0, 200);
  } catch {
    return "";
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readJsonResponse = async <T = any>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") || "";
  if (!isJsonContentType(contentType)) {
    const bodyPreview = await readBodyPreview(response);
    const responseUrl = response.url ? ` from ${response.url}` : "";
    throw new ApiRequestError(
      `Civitas API returned a non-JSON response (${response.status})${responseUrl}. Check VITE_API_URL/API_URL and proxy routing so /api/* reaches the backend. Content-Type: ${contentType || "unknown"}. Body preview: ${bodyPreview}`,
      response.status,
      "API_NON_JSON_RESPONSE",
      { contentType: contentType || null, bodyPreview, url: response.url || null },
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiRequestError(
      `Civitas API returned invalid JSON (${response.status}).`,
      response.status,
      "API_INVALID_JSON_RESPONSE",
      { url: response.url || null, cause: error instanceof Error ? error.message : String(error) },
    );
  }
};

const parseApiErrorBody = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!isJsonContentType(contentType)) {
    return {
      __nonJson: true,
      contentType,
      bodyPreview: await readBodyPreview(response),
      url: response.url || null,
    };
  }

  try {
    return await readJsonResponse(response);
  } catch {
    return null;
  }
};

const buildApiErrorMessage = async (response: Response) => {
  const data = await parseApiErrorBody(response);
  if (data?.__nonJson) {
    return {
      message: `Civitas API returned a non-JSON response (${response.status}). Check VITE_API_URL/API_URL and proxy routing so /api/* reaches the backend. Content-Type: ${data.contentType || "unknown"}. Body preview: ${data.bodyPreview}`,
      code: "API_NON_JSON_RESPONSE",
      details: data,
    };
  }
  const technicalMessage =
    typeof data?.message === "string" && data.message.length > 0
      ? data.message
      : typeof data?.error === "string" && data.error.length > 0
        ? data.error
        : null;

  if (response.status === 401) {
    console.error("Civitas API rejected the access token", data);
    return {
      message: "Your owner session could not be authorized by the Civitas API. Sign out and sign in again; if it continues, verify the Logto SPA app and API resource configuration.",
      code: data?.code || data?.details?.code || "OWNER_API_TOKEN_REJECTED",
      details: data || technicalMessage,
    };
  }

  if (response.status === 403) {
    const requiredScopes = Array.isArray(data?.requiredScopes) ? data.requiredScopes.join(", ") : null;
    const requiredGlobalRole = data?.requiredGlobalRole || (typeof data?.message === "string" && data.message.includes("global role") ? "owner_global" : null);
    const message = requiredScopes
      ? `Your session is authenticated, but the global Civitas API token is missing required scopes: ${requiredScopes}.`
      : requiredGlobalRole
        ? `Your session is authenticated, but it does not include the ${requiredGlobalRole} global role required for this owner area.`
        : technicalMessage || "Your session is authenticated, but the Civitas API rejected the requested operation.";
    return {
      message,
      code: data?.code || (requiredScopes ? "OWNER_GLOBAL_SCOPES_REQUIRED" : requiredGlobalRole ? "OWNER_GLOBAL_ROLE_REQUIRED" : "OWNER_API_FORBIDDEN"),
      details: data || technicalMessage,
    };
  }

  const fallbackMessage = `API request failed: ${response.status} ${response.statusText}`.trim();
  return {
    message: technicalMessage || fallbackMessage,
    code: data?.code || null,
    details: data,
  };
};

const joinApiUrl = (endpoint: string) => `${API_URL.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;

export const useApi = () => {
  const { getAccessToken, getOrganizationToken } = useLogto();

  const globalApiFetch = useMemo(
    () => async (endpoint: string, options: RequestInit = {}) => {
      try {
        const token = await getAccessToken(API_RESOURCE);

        if (!token) {
          throw new ApiRequestError("Failed to get access token for global API resource");
        }

        const response = await fetch(joinApiUrl(endpoint), {
          ...options,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers,
          },
        });

        if (!response.ok) {
          const apiError = await buildApiErrorMessage(response);
          throw new ApiRequestError(apiError.message, response.status, apiError.code, apiError.details);
        }

        return await readJsonResponse(response);
      } catch (error) {
        if (error instanceof ApiRequestError) {
          throw error;
        }
        throw new ApiRequestError(error instanceof Error ? error.message : String(error));
      }
    },
    [getAccessToken]
  );

  const organizationApiFetch = useMemo(
    () => async (organizationId: string, endpoint: string, options: RequestInit = {}) => {
      try {
        const token = await getOrganizationToken(organizationId);
        if (!token) throw new ApiRequestError("User is not a member of the organization");

        const response = await fetch(joinApiUrl(endpoint), {
          ...options,
          signal: options.signal ?? tenantRequestSignal(),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers,
          },
        });

        if (!response.ok) {
          const apiError = await buildApiErrorMessage(response);
          throw new ApiRequestError(apiError.message, response.status, apiError.code, apiError.details);
        }

        return await readJsonResponse(response);
      } catch (error) {
        if (error instanceof ApiRequestError) throw error;
        throw new ApiRequestError(error instanceof Error ? error.message : String(error));
      }
    },
    [getOrganizationToken]
  );

  const ownerApiFetch = useMemo(
    () => async (endpoint: string, options: RequestInit = {}) => {
      try {
        const token = await getAccessToken(API_RESOURCE);
        if (!token) throw new ApiRequestError("Failed to get access token for owner API resource");
        assertOwnerUserAccessToken(token);
        warnIfOwnerTokenLooksInsufficient(token);

        const response = await fetch(joinApiUrl(endpoint), {
          ...options,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers,
          },
        });

        if (!response.ok) {
          const apiError = await buildApiErrorMessage(response);
          throw new ApiRequestError(apiError.message, response.status, apiError.code, apiError.details);
        }

        return await readJsonResponse(response);
      } catch (error) {
        if (error instanceof ApiRequestError) throw error;
        throw new ApiRequestError(error instanceof Error ? error.message : String(error));
      }
    },
    [getAccessToken]
  );

  return { globalApiFetch, organizationApiFetch, ownerApiFetch };
};
