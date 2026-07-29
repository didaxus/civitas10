export type TenantContext = Readonly<{
  version: "civitas.tenant-context/v1";
  organizationId: string;
  hostname: string;
  subject: string | null;
  resolvedAt: string;
  binding: string;
}>;

export type TenantSessionContextDto = Readonly<{ tenantContext: TenantContext }>;
