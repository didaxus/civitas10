export type BrandedString<Brand extends string> = string & { readonly __brand?: Brand };

export type CapabilityKey = "lms" | "crm" | "support" | "scheduling" | "payments" | "email" | "storage" | "analytics" | "notifications" | "automation" | "community" | "owner" | "account" | "planning";
export type ScreenId = BrandedString<"ScreenId">;
export type ActionId = BrandedString<"ActionId">;
export type MenuKey = BrandedString<"MenuKey">;
export type FeatureFlagKey = BrandedString<"FeatureFlagKey">;
export type PermissionKey = BrandedString<"PermissionKey">;
export type PolicyKey = BrandedString<"PolicyKey">;
export type RouteId = BrandedString<"RouteId">;
export type IconKey = "back" | "overview" | "governance" | "operations" | "organizations" | "directory" | "create" | "settings" | "profile" | "grades" | "groups" | "planning" | "roles" | "roleNames" | "dataScopes" | "structure" | "segmentation" | "accessExplorer" | "logs" | "members";
export type ResponsiveGroupKey = "owner" | "governance" | "organizations" | "operations" | "settings" | "account" | "academics";
