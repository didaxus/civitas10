export type RouteParams = Record<string, string | number>;

export type DefinedRoute<Pattern extends string = string> = {
  readonly pattern: Pattern;
  build: (params?: RouteParams) => string;
};

export type OrganizationScopedRouteInput = {
  organizationId: string;
  pattern: string;
  params?: RouteParams;
  expectedOrganizationId?: string;
};

const paramPattern = /:([A-Za-z][A-Za-z0-9_]*)/g;
const routePlaceholderPattern = /^:[A-Za-z][A-Za-z0-9_]*$/;
const organizationIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const unsafeInternalRoutePattern = /^(?:https?:|\/\/)|javascript:|data:|\.\.|\\/i;
const organizationScopedPattern = /^\/o\/:organizationId(?:\/|$)/;
const encodedOrganizationPlaceholderPattern = /%3AorganizationId/i;

export const organizationScopedRouteTemplate = (suffix = "") => {
  if (suffix && !suffix.startsWith("/")) {
    throw new Error("organization_route_suffix_invalid");
  }
  return `/o/:organizationId${suffix}`;
};

export const isConcreteRouteParam = (value: string | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0 && !routePlaceholderPattern.test(value);

const assertInternalRoutePattern = (pattern: string) => {
  if (!pattern.startsWith("/") || unsafeInternalRoutePattern.test(pattern)) {
    throw new Error("route_pattern_invalid");
  }
};

const assertConcreteOrganizationId = (organizationId: string) => {
  if (!organizationIdPattern.test(organizationId) || organizationId.includes("/") || organizationId.includes("\\")) {
    throw new Error("organization_id_invalid");
  }
};

const encodeRouteParam = ({ name, value }: { name: string; value: string | number | undefined }) => {
  const stringValue = value === undefined || value === null ? undefined : String(value);
  if (!isConcreteRouteParam(stringValue) || stringValue === `:${name}` || stringValue.includes("/") || stringValue.includes("\\")) {
    throw new Error(`route_param_invalid:${name}`);
  }
  const encoded = encodeURIComponent(stringValue);
  if (name === "organizationId" && encodedOrganizationPlaceholderPattern.test(encoded)) {
    throw new Error(`route_param_invalid:${name}`);
  }
  return encoded;
};

const assertNoRawPlaceholders = (href: string) => {
  if (paramPattern.test(href) || encodedOrganizationPlaceholderPattern.test(href)) {
    throw new Error("unresolved_route_placeholder");
  }
};

export const defineRoute = <Pattern extends string>(pattern: Pattern): DefinedRoute<Pattern> => {
  return Object.freeze({
    pattern,
    build(values: RouteParams = {}) {
      return pattern.replace(paramPattern, (placeholder, name: string) => {
        const value = values[name];
        if (!isConcreteRouteParam(value === undefined || value === null ? undefined : String(value)) || String(value) === placeholder) {
          throw new Error(`Missing concrete route param ${name} for ${pattern}`);
        }
        return encodeURIComponent(String(value));
      });
    },
  });
};

export const buildOrganizationScopedRoute = ({
  organizationId,
  pattern,
  params = {},
  expectedOrganizationId,
}: OrganizationScopedRouteInput) => {
  assertConcreteOrganizationId(organizationId);
  if (expectedOrganizationId !== undefined && organizationId !== expectedOrganizationId) {
    throw new Error("cross_tenant_route_reference");
  }
  assertInternalRoutePattern(pattern);
  if (!organizationScopedPattern.test(pattern)) {
    throw new Error("organization_route_placeholder_missing");
  }

  const href = pattern.replace(paramPattern, (_placeholder, name: string) => {
    if (name === "organizationId") {
      return encodeRouteParam({ name, value: organizationId });
    }
    return encodeRouteParam({ name, value: params[name] });
  });

  assertNoRawPlaceholders(href);
  assertInternalRoutePattern(href);
  return href;
};

export const routeRequiresParams = (route: DefinedRoute | string) => /:[A-Za-z][A-Za-z0-9_]*/.test(typeof route === "string" ? route : route.pattern);
