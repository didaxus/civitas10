const logtoManagement = require("../services/logtoManagement");

class LogtoManagementAdapter {
  constructor(client = logtoManagement) {
    this.client = client;
  }

  async ensureUser(input) {
    return this.client.createOrResolveLogtoUserByEmail(input);
  }

  async ensureOrganizationMembership({ organizationId, userId }) {
    return this.client.addUserToLogtoOrganization({ organizationId, userId });
  }

  async removeOrganizationMembership({ organizationId, userId }) {
    return this.client.removeUserFromLogtoOrganization({ organizationId, userId });
  }

  async replaceManagedOrganizationRoles({ organizationId, userId, roleIds = [], roleNames = [] }) {
    const currentRoles = this.client.listLogtoOrganizationUserRoles
      ? await this.client.listLogtoOrganizationUserRoles({ organizationId, userId })
      : [];
    const desiredIds = new Set(roleIds.filter(Boolean));
    const desiredNames = new Set(roleNames.filter(Boolean));
    const assigned = [];
    for (const roleId of desiredIds) {
      await this.client.assignOrganizationRoleToUser({ organizationId, userId, organizationRoleId: roleId });
      assigned.push({ roleId });
    }
    for (const roleName of desiredNames) {
      await this.client.assignOrganizationRoleToUser({ organizationId, userId, organizationRoleName: roleName });
      assigned.push({ roleName });
    }
    return { organizationId, userId, assigned, previousRoles: currentRoles };
  }

  async suspendOrganizationAccess({ organizationId, userId }) {
    return this.removeOrganizationMembership({ organizationId, userId });
  }

  async linkExternalIdentity({ organizationId, userId, externalIssuer, externalSubject, customData = {} }) {
    const linkedIdentity = { organizationId, externalIssuer, externalSubject };
    return this.client.updateLogtoUser({
      userId,
      customData: {
        ...customData,
        civitasExternalIdentities: [linkedIdentity],
      },
    });
  }
}

module.exports = { LogtoManagementAdapter };
