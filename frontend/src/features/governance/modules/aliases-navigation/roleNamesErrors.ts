import { ApiRequestError } from "../../../../api/base";

export const roleNameMutationErrorMessage = (error: unknown) => {
  if (error instanceof ApiRequestError) {
    if (error.status === 403) return "You do not have permission to change role display names.";
    if (error.status === 409 && error.code === "role_label_duplicate") return "Another role already uses this display name.";
    if (error.status === 409 && error.code === "role_label_version_stale") return "This display name was changed by another administrator.";
    if (error.status === 409) return "This display name was changed by another administrator.";
    if (error.status === 500 || error.status === 503) return "Display name could not be saved. Try again.";
  }
  return "Display name could not be saved. Try again.";
};
