import { IconArrowLeft, IconBuilding, IconCirclePlus, IconLayoutDashboard, IconReportAnalytics, IconScale, IconUsersGroup, IconCalendarStats, IconServer, IconSettings, IconUser, IconUserShield, IconTags, IconDatabase, IconSitemap, IconRoute, IconEyeCheck, IconListDetails, type Icon } from "@tabler/icons-react";
import type { IconKey } from "../authorization/contracts/ids";

export const iconRegistry: Record<IconKey, Icon> = {
  back: IconArrowLeft,
  overview: IconLayoutDashboard,
  governance: IconScale,
  operations: IconServer,
  organizations: IconBuilding,
  directory: IconBuilding,
  create: IconCirclePlus,
  settings: IconSettings,
  profile: IconUser,
  grades: IconReportAnalytics,
  groups: IconUsersGroup,
  planning: IconCalendarStats,
  roles: IconUserShield,
  roleNames: IconTags,
  dataScopes: IconDatabase,
  structure: IconSitemap,
  segmentation: IconRoute,
  accessExplorer: IconEyeCheck,
  logs: IconListDetails,
  members: IconUsersGroup,
};

export const assertKnownIconKey = (iconKey: string): iconKey is IconKey => Object.prototype.hasOwnProperty.call(iconRegistry, iconKey);
