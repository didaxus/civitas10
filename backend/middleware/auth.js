const { createRemoteJWKSet, jwtVerify, errors: joseErrors } = require("jose");
const { withTimeout } = require("../services/timeouts");
const { validateDeploymentConfig } = require("../../core/deployment/deployment-kernel.cjs");
const deploymentConfig = validateDeploymentConfig({ service: "backend" });

const ORGANIZATION_AUDIENCE_PREFIX = deploymentConfig.contract.organizationAudiencePrefix || deploymentConfig.contract.logto?.organizationAudiencePrefix || deploymentConfig.logtoOrganizationAudiencePrefix;
const LOGTO_JWKS_TIMEOUT_MS = 5000;
const LOGTO_JWT_VERIFY_TIMEOUT_MS = 6000;
let jwks;

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Logto authentication`);
  }
  return value;
};

const normalizeLogtoEndpoint = (endpoint) => endpoint.replace(/\/+$/, "").replace(/\/oidc$/, "");
const assertUrlResource = (resource) => {
  if (!/^https:\/\//i.test(resource || "")) {
    throw new Error("LOGTO_API_RESOURCE must be the canonical HTTPS Logto API resource URL");
  }
  if (resource !== deploymentConfig.logtoResource) {
    throw new Error("Invalid Logto API Resource drift detected");
  }
  return resource;
};
const getLogtoIssuer = () => `${normalizeLogtoEndpoint(deploymentConfig.logtoEndpoint)}/oidc`;
const getLogtoJwksUrl = () => `${getLogtoIssuer()}/jwks`;

const getJwks = () => {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(getLogtoJwksUrl()), {
      timeoutDuration: LOGTO_JWKS_TIMEOUT_MS,
    });
  }
  return jwks;
};

const normalizeAudience = (audience) => (Array.isArray(audience) ? audience[0] : audience);
const normalizeAudiences = (audience) => (Array.isArray(audience) ? audience : [audience]).filter(Boolean);
const hasAudience = (payloadOrAudience, expectedAudience) => normalizeAudiences(payloadOrAudience).includes(expectedAudience);

const getTokenFromHeader = (headers) => {
  const authorization = headers.authorization;

  if (!authorization) {
    const error = new Error("Authorization header missing");
    error.status = 401;
    throw error;
  }

  const [type, token] = authorization.split(" ");
  if (type !== "Bearer" || !token) {
    const error = new Error("Authorization header must use Bearer token");
    error.status = 401;
    throw error;
  }

  return token;
};

const decodeJwtPayload = (token) => {
  try {
    const [, payloadBase64] = token.split(".");
    if (!payloadBase64) {
      throw new Error("Invalid token format");
    }

    return JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
  } catch (error) {
    const decodeError = new Error("Failed to decode token payload");
    decodeError.status = 401;
    throw decodeError;
  }
};

const extractOrganizationId = (payloadOrAudience) => {
  if (payloadOrAudience && typeof payloadOrAudience === "object") {
    if (payloadOrAudience.organization_id) {
      return payloadOrAudience.organization_id;
    }

    if (payloadOrAudience.organizationId) {
      return payloadOrAudience.organizationId;
    }

    return extractOrganizationId(payloadOrAudience.aud);
  }

  const audiences = Array.isArray(payloadOrAudience) ? payloadOrAudience : [payloadOrAudience];
  const organizationAudience = audiences.find(
    (audience) => typeof audience === "string" && audience.startsWith(ORGANIZATION_AUDIENCE_PREFIX)
  );

  if (organizationAudience) {
    return organizationAudience.slice(ORGANIZATION_AUDIENCE_PREFIX.length);
  }

  return null;
};

const parseScopes = (scope) => (typeof scope === "string" ? scope.split(" ").filter(Boolean) : []);

const parseClaimList = (value) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  return [];
};

const getClaimValue = (payload = {}, claimNames = []) => {
  for (const claimName of claimNames) {
    if (Object.hasOwn(payload, claimName)) {
      return payload[claimName];
    }
  }
  return undefined;
};

const GLOBAL_ROLE_CLAIMS = [
  ["global_roles"],
  ["role_names"],
  ["roles"],
  ["globalRoles"],
  ["https://civitas.didaxus.com/claims/global_roles", "https://civitas.didaxus.com/global_roles"],
  ["https://civitas.didaxus.com/claims/role_names", "https://civitas.didaxus.com/role_names"],
];

const extractGlobalRoleNames = (payload = {}) => {
  const candidates = GLOBAL_ROLE_CLAIMS.map((claimNames) => getClaimValue(payload, claimNames));
  return [...new Set(candidates.flatMap(parseClaimList))];
};

const extractOrganizationRoleNames = (payload = {}) => {
  const candidates = [payload.organization_roles, payload.organizationRoles, payload.org_roles];
  return [...new Set(candidates.flatMap(parseClaimList))];
};

const extractRoleNames = (payload = {}) => {
  return [...new Set([...extractGlobalRoleNames(payload), ...extractOrganizationRoleNames(payload)])];
};

const hasRequiredScopes = (tokenScopes, requiredScopes = []) => {
  if (!requiredScopes || requiredScopes.length === 0) return true;
  const scopeSet = tokenScopes instanceof Set ? tokenScopes : new Set(tokenScopes || []);
  return requiredScopes.every((scope) => scopeSet.has(scope));
};

const hasAnyRequiredScope = (tokenScopes, requiredScopes = []) => {
  if (!requiredScopes || requiredScopes.length === 0) return true;
  const scopeSet = tokenScopes instanceof Set ? tokenScopes : new Set(tokenScopes || []);
  return requiredScopes.some((scope) => scopeSet.has(scope));
};

const normalizeScopeRequirements = ({ requiredScopes, requiredAllScopes, requiredAnyScopes, allowAuthOnly = false } = {}) => {
  const all = requiredAllScopes || requiredScopes || [];
  const any = requiredAnyScopes || [];
  if (!Array.isArray(all) || !Array.isArray(any)) throw new Error("Scope requirements must be arrays");
  if (!allowAuthOnly && all.length === 0 && any.length === 0) throw new Error("Authorization guard requires at least one required scope; use requireAuth for auth-only routes.");
  return { requiredAllScopes: [...all], requiredAnyScopes: [...any] };
};

const buildAuthContext = ({ payload, tokenType, organizationId }) => {
  const scopeSet = new Set(parseScopes(payload.scope));
  const globalRoles = extractGlobalRoleNames(payload);
  const organizationRoles = extractOrganizationRoleNames(payload);
  return {
    tokenValidated: true,
    subject: payload.sub,
    tokenType,
    audience: normalizeAudiences(payload.aud),
    organizationId: organizationId || null,
    scopes: scopeSet,
    globalRoles,
    organizationRoles,
    roles: [...new Set([...globalRoles, ...organizationRoles])],
    claims: payload,
    tokenId: payload.jti,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
};

const attachAuthContext = (req, authContext) => {
  req.auth = authContext;
  req.user = {
    id: authContext.subject,
    sub: authContext.subject,
    scopes: [...authContext.scopes],
    organizationId: authContext.organizationId,
    roles: authContext.roles,
    globalRoles: authContext.globalRoles,
    organizationRoles: authContext.organizationRoles,
    claims: authContext.claims,
  };
};

const verifyJwt = async (token, audience) => {
  return withTimeout(
    async () => {
      const { payload } = await jwtVerify(token, getJwks(), {
        issuer: getLogtoIssuer(),
        audience,
      });

      return payload;
    },
    {
      timeoutMs: LOGTO_JWT_VERIFY_TIMEOUT_MS,
      label: "Logto JWT verification",
      code: "LOGTO_JWT_VERIFY_TIMEOUT",
      name: "LogtoJwtVerifyTimeoutError",
      status: 504,
    }
  );
};

const buildAuthFailure = (error, expiredMessage, invalidMessage) => {
  if (error instanceof joseErrors.JWTExpired) {
    return {
      status: 401,
      body: { error: "Unauthorized", message: expiredMessage },
    };
  }

  if (error?.code === "LOGTO_JWT_VERIFY_TIMEOUT") {
    return {
      status: 504,
      body: {
        error: "Gateway Timeout",
        message: "Logto tardó demasiado en validar el token de acceso. Reintenta en unos segundos o valida la disponibilidad del proveedor de identidad.",
        code: error.code,
        timeoutMs: error.timeoutMs || LOGTO_JWT_VERIFY_TIMEOUT_MS,
      },
    };
  }

  return {
    status: error?.status || 401,
    body: { error: "Unauthorized", message: invalidMessage },
  };
};

const buildScopeFailure = (requiredAllScopes, requiredAnyScopes, message) => ({
  error: "Forbidden",
  code: "permission_missing",
  message,
  ...(requiredAllScopes.length === 1 && requiredAnyScopes.length === 0 ? { requiredPermission: requiredAllScopes[0] } : {}),
  decisionId: `authz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
});

const requireGlobalAccess = ({ resource = deploymentConfig.logtoResource, requiredScopes, requiredAllScopes, requiredAnyScopes, allowAuthOnly = false } = {}) => {
  if (!resource) throw new Error("Resource parameter is required for authentication");
  assertUrlResource(resource);
  const requirements = normalizeScopeRequirements({ requiredScopes, requiredAllScopes, requiredAnyScopes, allowAuthOnly });

  return async (req, res, next) => {
    try {
      const token = getTokenFromHeader(req.headers);
      const payload = await verifyJwt(token, resource);
      const organizationId = extractOrganizationId(payload);

      if (organizationId) {
        return res.status(401).json({ error: "Unauthorized", message: "Global API routes require a Logto global API access token, not an organization token.", code: "GLOBAL_TOKEN_REQUIRED" });
      }

      const authContext = buildAuthContext({ payload, tokenType: "global", organizationId: null });
      if (!hasRequiredScopes(authContext.scopes, requirements.requiredAllScopes) || !hasAnyRequiredScope(authContext.scopes, requirements.requiredAnyScopes)) {
        return res.status(403).json(buildScopeFailure(requirements.requiredAllScopes, requirements.requiredAnyScopes, "Insufficient global API permissions"));
      }

      attachAuthContext(req, authContext);
      return next();
    } catch (error) {
      const failure = buildAuthFailure(error, "Access token expired", "Invalid or missing access token");
      return res.status(failure.status).json(failure.body);
    }
  };
};

const requireAuth = (resource = deploymentConfig.logtoResource) => requireGlobalAccess({ resource, allowAuthOnly: true });

const getRequestScopeSet = (req) => req.auth?.scopes instanceof Set ? req.auth.scopes : new Set(Array.isArray(req.user?.scopes) ? req.user.scopes : []);

const requireScope = (requiredScope) => {
  if (!requiredScope || typeof requiredScope !== "string") throw new Error("requiredScope must be a permission string");
  return (req, res, next) => {
    if (!req.user && !req.auth) return res.status(401).json({ error: "Unauthorized", message: "Authentication is required." });
    if (!hasRequiredScopes(getRequestScopeSet(req), [requiredScope])) {
      return res.status(403).json({ error: "Forbidden", code: "permission_missing", requiredPermission: requiredScope, decisionId: `authz_${Date.now().toString(36)}` });
    }
    return next();
  };
};

const requireOrganizationRole = (requiredRoleName) => {
  return (req, res, next) => {
    if (!req.user && !req.auth) return res.status(401).json({ error: "Unauthorized", message: "Authentication is required." });
    const organizationId = req.auth?.organizationId || req.user?.organizationId || extractOrganizationId(req.user?.claims || req.auth?.claims || {});
    if (!organizationId) {
      return res.status(403).json({ error: "OrganizationContextRequired", message: "Organization authorization requires an organization-scoped token and membership context." });
    }
    const roles = Array.isArray(req.auth?.organizationRoles) ? req.auth.organizationRoles : (Array.isArray(req.user?.organizationRoles) ? req.user.organizationRoles : extractOrganizationRoleNames(req.user?.claims || {}));
    if (!roles.includes(requiredRoleName)) {
      return res.status(403).json({ error: "Forbidden", message: `Missing required Logto organization role: ${requiredRoleName}`, requiredRole: requiredRoleName, organizationId });
    }
    return next();
  };
};

const requireOrganizationAccess = ({ resource = deploymentConfig.logtoResource, requiredScopes, requiredAllScopes, requiredAnyScopes, requiredRoleName = null, requireOrganizationContext = true, allowAuthOnly = false } = {}) => {
  assertUrlResource(resource);
  const requirements = normalizeScopeRequirements({ requiredScopes, requiredAllScopes, requiredAnyScopes, allowAuthOnly });
  return async (req, res, next) => {
    try {
      const token = getTokenFromHeader(req.headers);
      const payload = await verifyJwt(token, resource);
      if (!hasAudience(payload.aud, resource)) { const error = new Error("Invalid organization token audience"); error.status = 401; throw error; }
      const verifiedOrganizationId = extractOrganizationId(payload);
      if (requireOrganizationContext && !verifiedOrganizationId) { const error = new Error("Organization token is missing organization context"); error.status = 401; throw error; }
      if (req.params?.organizationId && verifiedOrganizationId && req.params.organizationId !== verifiedOrganizationId) {
        return res.status(403).json({ error: "Forbidden", code: "organization_route_mismatch", message: "Organization token does not match requested organization" });
      }
      const authContext = buildAuthContext({ payload, tokenType: "organization", organizationId: verifiedOrganizationId });
      if (!hasRequiredScopes(authContext.scopes, requirements.requiredAllScopes) || !hasAnyRequiredScope(authContext.scopes, requirements.requiredAnyScopes)) {
        return res.status(403).json(buildScopeFailure(requirements.requiredAllScopes, requirements.requiredAnyScopes, "Insufficient organization permissions"));
      }
      attachAuthContext(req, authContext);
      if (requiredRoleName && !authContext.organizationRoles.includes(requiredRoleName)) {
        return res.status(403).json({ error: "Forbidden", message: `Missing required Logto organization role: ${requiredRoleName}`, requiredRole: requiredRoleName });
      }
      return next();
    } catch (error) {
      const failure = buildAuthFailure(error, "Organization token expired", "Invalid organization access token");
      return res.status(failure.status).json(failure.body);
    }
  };
};

module.exports = {
  decodeJwtPayload,
  extractOrganizationId,
  getTokenFromHeader,
  extractRoleNames,
  extractGlobalRoleNames,
  extractOrganizationRoleNames,
  hasRequiredScopes,
  requireAuth,
  requireGlobalAccess,
  requireOrganizationAccess,
  requireOrganizationRole,
  requireScope,
  verifyJwt,
};
