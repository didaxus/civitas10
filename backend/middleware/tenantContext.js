const crypto = require("node:crypto");

const TENANT_CONTEXT_VERSION = "civitas.tenant-context/v1";
const HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

const normalizeHostname = (value) => String(value || "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");

const parseHostnameBindings = (raw = process.env.CIVITAS_TENANT_HOSTNAMES || "{}") => {
  const input = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!input || Array.isArray(input) || typeof input !== "object") throw new Error("CIVITAS_TENANT_HOSTNAMES must be a JSON object");
  return new Map(Object.entries(input).map(([hostname, organizationId]) => {
    const normalized = normalizeHostname(hostname);
    if (!HOSTNAME_PATTERN.test(normalized) || !organizationId) throw new Error("Invalid tenant hostname binding");
    return [normalized, String(organizationId)];
  }));
};

const requestHostname = (req) => normalizeHostname(req.hostname || req.headers?.host);

const resolveTenantContext = ({ hostname, sessionOrganizationId, subject, bindings, now = new Date() }) => {
  const organizationId = bindings.get(normalizeHostname(hostname));
  if (!organizationId) return { ok: false, status: 404, code: "TENANT_CONTEXT_NOT_FOUND" };
  if (!sessionOrganizationId || organizationId !== sessionOrganizationId) {
    return { ok: false, status: 403, code: "TENANT_SESSION_MISMATCH" };
  }
  const resolvedAt = now.toISOString();
  const binding = crypto.createHash("sha256").update(`${normalizeHostname(hostname)}\0${organizationId}\0${subject || ""}`).digest("base64url");
  return { ok: true, context: Object.freeze({ version: TENANT_CONTEXT_VERSION, organizationId, hostname: normalizeHostname(hostname), subject: subject || null, resolvedAt, binding }) };
};

const createTenantContextMiddleware = ({ bindings = parseHostnameBindings() } = {}) => (req, res, next) => {
  const result = resolveTenantContext({
    hostname: requestHostname(req),
    sessionOrganizationId: req.auth?.organizationId,
    subject: req.auth?.subject,
    bindings,
  });
  if (!result.ok) return res.status(result.status).json({ error: "TenantContextError", code: result.code, message: "Tenant context could not be resolved." });
  req.tenantContext = result.context;
  return next();
};

const tenantOrganizationId = (req) => {
  if (!req.tenantContext?.organizationId) throw Object.assign(new Error("Authoritative tenant context is required"), { status: 403, code: "TENANT_CONTEXT_REQUIRED" });
  return req.tenantContext.organizationId;
};

module.exports = { TENANT_CONTEXT_VERSION, normalizeHostname, parseHostnameBindings, requestHostname, resolveTenantContext, createTenantContextMiddleware, tenantOrganizationId };
