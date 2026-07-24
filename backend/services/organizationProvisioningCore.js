const {
  addUserToLogtoOrganization,
  assignOrganizationRoleToUser,
  createOrResolveLogtoUserByEmail,
  ensureOrganizationTemplate,
  listLogtoOrganizationRoles,
  replaceJitDefaultRolesForLogtoOrganization,
  replaceJitEmailDomainsForLogtoOrganization,
  JIT_FALLBACK_ORGANIZATION_ROLE_NAME,
  PROVISIONING_POLICY,
} = require("./logtoManagement");
const {
  buildOrganizationCreatePayload,
  buildUserCreatePayload,
  buildLogtoUsername,
} = require("./organizationProvisioningPayloads");
const { normalizeProvisioningSettings } = require("./organizationProvisioningSettings");
const { assertProvisionedRoleAllowed } = require("../authorization/provisioningGuard");

const emptyToNull = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const normalizeRoleNames = (value, { fallbackRoleName = JIT_FALLBACK_ORGANIZATION_ROLE_NAME } = {}) => {
  const input = Array.isArray(value) ? value : [];
  const roles = input.map((role) => (typeof role === "string" ? role.trim() : "")).filter(Boolean);
  for (const role of roles) assertProvisionedRoleAllowed({ roleName: role, source: "jit_default_roles" });
  if (roles.length === 0 && fallbackRoleName) {
    assertProvisionedRoleAllowed({ roleName: fallbackRoleName, source: "jit_default_roles_fallback" });
    roles.push(fallbackRoleName);
  }
  return Array.from(new Set(roles));
};

const normalizePhone = (value) => {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]+/g, "");
  if (!/^\+?[1-9]\d{6,14}$/.test(compact)) return null;
  return compact.startsWith("+") ? compact : `+${compact}`;
};


const normalizePositiveInteger = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const normalizePhonePrefix = (value) => {
  const raw = emptyToNull(value);
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]+/g, "");
  if (!/^\+?[1-9]\d{0,5}$/.test(compact)) return null;
  return compact.startsWith("+") ? compact : `+${compact}`;
};

const normalizeLocationInput = (business = {}) => {
  const location = business && typeof business.location === "object" ? business.location : {};
  const countryId = normalizePositiveInteger(location.countryId ?? business.countryId);
  const stateId = normalizePositiveInteger(location.stateId ?? business.stateId);
  const cityId = normalizePositiveInteger(location.cityId ?? business.cityId);
  const manualCity = emptyToNull(location.manualCity ?? business.manualCity);
  const phonePrefix = normalizePhonePrefix(location.phonePrefix ?? business.phonePrefix);
  const normalized = {
    countryId,
    stateId,
    cityId,
    manualCity,
    phonePrefix,
    countryCode: emptyToNull(location.countryCode ?? business.countryCode)?.toUpperCase() || null,
    stateCode: emptyToNull(location.stateCode ?? business.stateCode) || null,
    source: countryId || stateId || cityId || manualCity || phonePrefix ? "dr5hn/countries-states-cities-database" : null,
  };
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== null));
};

const normalizeBusinessInput = (business = {}) => {
  const input = business && typeof business === "object" ? business : {};
  const location = normalizeLocationInput(input);
  return {
    ...input,
    city: emptyToNull(input.city) || location.manualCity || undefined,
    phonePrefix: location.phonePrefix || normalizePhonePrefix(input.phonePrefix) || undefined,
    ...(Object.keys(location).length > 0 ? { location } : {}),
  };
};

const normalizeAdministrativeContacts = (value = []) =>
  (Array.isArray(value) ? value : [])
    .map((contact, index) => {
      const firstName = emptyToNull(contact?.firstName) || emptyToNull(contact?.primerNombre);
      const middleName = emptyToNull(contact?.middleName) || emptyToNull(contact?.segundoNombre);
      const firstSurname =
        emptyToNull(contact?.firstSurname) ||
        emptyToNull(contact?.primerApellido) ||
        emptyToNull(contact?.lastName);
      const secondSurname =
        emptyToNull(contact?.secondSurname) || emptyToNull(contact?.segundoApellido);
      const email = emptyToNull(contact?.email)?.toLowerCase() || null;
      return {
        key:
          (typeof contact?.key === "string" && contact.key.trim()) ||
          `administrative_contact_${index + 1}`,
        firstName,
        middleName,
        firstSurname,
        secondSurname,
        name:
          emptyToNull(contact?.name) ||
          [firstName, middleName, firstSurname, secondSurname]
            .filter(Boolean)
            .join(" ") ||
          null,
        email,
        phone: normalizePhone(contact?.phone),
        phoneExtension: emptyToNull(contact?.phoneExtension ?? contact?.extension),
        position: emptyToNull(contact?.position),
        organizationRoleName: emptyToNull(contact?.organizationRoleName),
        username:
          emptyToNull(contact?.username) || buildLogtoUsername({ email }),
      };
    })
    .filter((contact) => contact.name || contact.email || contact.phone || contact.position);

const getAdministrativeContactUniquenessErrors = (contacts = []) => {
  const seen = new Map();
  const errors = [];
  for (const [index, contact] of contacts.entries()) {
    if (!contact.email) continue;
    if (seen.has(contact.email)) {
      errors.push({
        field: `administrativeContacts.${index}.email`,
        message: `Administrative contacts must use unique emails. ${contact.email} is repeated.`,
      });
      continue;
    }
    seen.set(contact.email, true);
  }
  return errors;
};

const normalizeSegmentationValues = (value) =>
  Array.from(new Set((Array.isArray(value) ? value : []).map(emptyToNull).filter(Boolean)));

function normalizeProvisioningInput(body = {}) {
  const settings = normalizeProvisioningSettings(body);
  const administrativeContacts = normalizeAdministrativeContacts(body.administrativeContacts);
  const segmentation =
    body.segmentation && typeof body.segmentation === "object"
      ? {
          tags: normalizeSegmentationValues(body.segmentation.tags),
          lists: normalizeSegmentationValues(body.segmentation.lists),
        }
      : {};
  const administrativeContactsWithSegmentation = administrativeContacts.map((contact) => ({
    ...contact,
    segmentation: {
      roleTag: contact.organizationRoleName,
      organizationTags: segmentation.tags || [],
      organizationLists: segmentation.lists || [],
    },
  }));
  const jitDefaultRoleNames = normalizeRoleNames(body.jitProvisioning?.defaultRoleNames);

  const errors = [];
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : undefined;

  if (!name) {
    errors.push({ field: "name", message: "Organization name is required" });
  }

  if (administrativeContacts.length === 0) {
    errors.push({ field: "administrativeContacts", message: "At least one administrative contact is required" });
  }

  administrativeContactsWithSegmentation.forEach((contact, index) => {
    if (!contact.firstName) {
      errors.push({ field: `administrativeContacts.${index}.firstName`, message: "Administrative contact first name is required" });
    }
    if (!contact.firstSurname) {
      errors.push({ field: `administrativeContacts.${index}.firstSurname`, message: "Administrative contact first surname is required" });
    }
    if (!contact.email) {
      errors.push({ field: `administrativeContacts.${index}.email`, message: "Administrative contact email is required" });
    }
    if (!contact.organizationRoleName) {
      errors.push({ field: `administrativeContacts.${index}.organizationRoleName`, message: "Administrative contact role is required" });
    } else {
      try { assertProvisionedRoleAllowed({ roleName: contact.organizationRoleName, source: "wizard_admin_contact" }); }
      catch (error) { errors.push({ field: `administrativeContacts.${index}.organizationRoleName`, message: error.code }); }
    }
  });

  errors.push(...settings.errors);
  errors.push(...getAdministrativeContactUniquenessErrors(administrativeContactsWithSegmentation));

  return {
    errors,
    value: {
      canonical: {
        name,
        description,
        administrativeContacts: administrativeContactsWithSegmentation,
        jitProvisioning: {
          domain: settings.value.adminDomain,
          defaultRoleNames: jitDefaultRoleNames,
          policy: PROVISIONING_POLICY,
        },
      },
      settings: settings.value,
      contact:
        body.contact && typeof body.contact === "object"
          ? body.contact
          : {},
      business: normalizeBusinessInput(body.business),
      segmentation,
    },
  };
}

class InvalidInitialOrganizationRoleError extends Error {
  constructor({ requestedRole, availableRoles = [] } = {}) {
    super("El rol solicitado no existe en Logto para organizaciones.");
    this.name = "InvalidInitialOrganizationRoleError";
    this.error = "invalid_initial_organization_role";
    this.code = "INVALID_INITIAL_ORGANIZATION_ROLE";
    this.status = 422;
    this.requestedRole = requestedRole;
    this.availableRoles = availableRoles;
    this.body = { error: this.error, message: this.message, requestedRole, availableRoles };
  }
}

const getRoleName = (role = {}) => role.name || role.nameCache || role.key || null;
const getRoleId = (role = {}) => role.id || role.organizationRoleId || role.roleId || null;
const getUserId = (user = {}) => user.id || user.userId || user.logtoUserId || null;

function createRoleResolver(roles = []) {
  const normalizedRoles = roles.map((role) => ({ ...role, id: getRoleId(role), name: getRoleName(role) })).filter((role) => role.name);
  const byName = new Map(normalizedRoles.map((role) => [role.name, role]));
  const availableRoles = normalizedRoles.map((role) => role.name);
  return {
    availableRoles,
    normalizedRoles,
    requireRole(roleName) {
      const role = byName.get(roleName);
      if (!role) throw new InvalidInitialOrganizationRoleError({ requestedRole: roleName, availableRoles });
      return role;
    },
  };
}

async function runCanonicalOrganizationProvisioning({ input, actor = {}, recorder = null, logto = {} }) {
  const deps = {
    listLogtoOrganizationRoles,
    ensureOrganizationTemplate,
    createOrResolveLogtoUserByEmail,
    addUserToLogtoOrganization,
    assignOrganizationRoleToUser,
    replaceJitEmailDomainsForLogtoOrganization,
    replaceJitDefaultRolesForLogtoOrganization,
    createOrganization: createOrganizationFromCanonicalInput,
    ...logto,
  };
  const completedSteps = recorder?.getCompletedSteps ? await recorder.getCompletedSteps() : new Map();
  const getCompleted = (stepName) => completedSteps.get(stepName) || null;
  const recordStep = async (stepName, status, metadata = {}, error = null) => {
    if (recorder?.recordStep) await recorder.recordStep({ stepName, status, metadata, error });
  };
  const runStep = async (stepName, effect, { replayable = false } = {}) => {
    const previous = getCompleted(stepName);
    if (previous && !replayable) return { skipped: true, output: previous };
    await recordStep(stepName, "running", {});
    try {
      const output = await effect(previous);
      await recordStep(stepName, "completed", { output });
      completedSteps.set(stepName, output || {});
      return { skipped: false, output };
    } catch (error) {
      await recordStep(stepName, "failed", {}, error);
      throw error;
    }
  };

  let organization = null;
  let organizationId = null;
  let roleResolver = null;
  let template = null;
  const administrativeContactAssignments = [];

  try {
    if (recorder?.startOperation) await recorder.startOperation({ operationType: "organization.bootstrap", actor, input: { organizationName: input.canonical.name, requestEnvelope: input } });
    await runStep("organization.bootstrap.started", async () => ({ actorType: actor?.type || "owner_global" }));

    const requiredRoleNames = Array.from(new Set([
      ...input.canonical.jitProvisioning.defaultRoleNames,
      ...input.canonical.administrativeContacts.map((contact) => contact.organizationRoleName),
    ].filter(Boolean)));

    const rolesStep = await runStep("logto.organization_roles.list", async () => {
      const roles = await deps.listLogtoOrganizationRoles();
      return { roles, availableRoles: createRoleResolver(roles).availableRoles };
    }, { replayable: true });
    roleResolver = createRoleResolver(rolesStep.output.roles || []);
    for (const roleName of requiredRoleNames) roleResolver.requireRole(roleName);

    const templateStep = await runStep("logto.organization_template.validate", async () => ({ template: await deps.ensureOrganizationTemplate({ requiredRoleNames }), requiredRoleNames }), { replayable: true });
    template = templateStep.output.template || templateStep.output;

    const createStep = await runStep("logto.organization.create", async () => {
      const created = await deps.createOrganization(input);
      return { organization: created, organizationId: created.id };
    });
    organization = createStep.output.organization || { id: createStep.output.organizationId, name: input.canonical.name, description: input.canonical.description || null };
    organizationId = createStep.output.organizationId || organization.id;

    const jitRoleIds = [];
    for (const roleName of input.canonical.jitProvisioning.defaultRoleNames) {
      const role = roleResolver.requireRole(roleName);
      const roleId = getRoleId(role);
      if (!roleId) throw new Error(`Logto organization role ${roleName} exists but no role id was returned`);
      jitRoleIds.push(roleId);
    }

    if (input.canonical.jitProvisioning.domain) {
      await runStep("logto.organization_jit.email_domains.replace", async () => {
        await deps.replaceJitEmailDomainsForLogtoOrganization({ organizationId, emailDomains: [input.canonical.jitProvisioning.domain] });
        return { organizationId, emailDomains: [input.canonical.jitProvisioning.domain] };
      });
    }
    await runStep("logto.organization_jit.default_roles.replace", async () => {
      await deps.replaceJitDefaultRolesForLogtoOrganization({ organizationId, organizationRoleIds: jitRoleIds });
      return { organizationId, roleNames: input.canonical.jitProvisioning.defaultRoleNames, roleIds: jitRoleIds };
    });

    for (const contact of input.canonical.administrativeContacts) {
      const stepName = `logto.organization_user.assign_role:${contact.key}`;
      const assignmentStep = await runStep(stepName, async () => {
        const resolved = await deps.createOrResolveLogtoUserByEmail(buildUserCreatePayload(contact));
        const userId = getUserId(resolved.user);
        if (!userId) throw new Error(`Administrative contact ${contact.email} did not resolve a Logto user id`);
        const role = roleResolver.requireRole(contact.organizationRoleName);
        const roleId = getRoleId(role);
        if (!roleId) throw new Error(`Logto organization role ${contact.organizationRoleName} exists but no role id was returned`);
        await deps.addUserToLogtoOrganization({ organizationId, userId });
        await deps.assignOrganizationRoleToUser({ organizationId, userId, organizationRoleId: roleId, organizationRoleName: contact.organizationRoleName });
        return { key: contact.key, email: contact.email, organizationId, userId, roleName: contact.organizationRoleName, userCreated: Boolean(resolved.created), userSource: resolved.source, membershipAdded: true, roleAssigned: true, primaryOperationalContact: contact.key === input.canonical.administrativeContacts[0]?.key };
      });
      administrativeContactAssignments.push({
        key: contact.key,
        email: contact.email,
        logtoUserId: assignmentStep.output.userId,
        roleName: assignmentStep.output.roleName,
        userCreated: Boolean(assignmentStep.output.userCreated),
        userSource: assignmentStep.output.userSource,
        membershipAdded: Boolean(assignmentStep.output.membershipAdded),
        roleAssigned: Boolean(assignmentStep.output.roleAssigned),
        primaryOperationalContact: Boolean(assignmentStep.output.primaryOperationalContact),
        skipped: Boolean(assignmentStep.skipped),
      });
    }

    const result = {
      organization,
      organizationId,
      template,
      availableOrganizationRoles: roleResolver.availableRoles,
      jitProvisioning: { domain: input.canonical.jitProvisioning.domain, defaultRoleNames: input.canonical.jitProvisioning.defaultRoleNames, defaultRoleIds: jitRoleIds },
      administrativeContactAssignments,
      status: "created_with_logto_bootstrap",
      resume: { idempotent: completedSteps.size > 0 },
    };
    if (recorder?.completeOperation) await recorder.completeOperation({ organizationId, status: result.status, result });
    return result;
  } catch (error) {
    if (recorder?.failOperation) await recorder.failOperation({ organizationId, error, status: organizationId ? "bootstrap_incomplete" : "bootstrap_failed", result: { organizationId, organization } });
    throw error;
  }
}

function createOrganizationFromCanonicalInput(input) {
  return require("./logtoManagement").createLogtoOrganization(
    buildOrganizationCreatePayload({
      canonical: input.canonical,
      settings: input.settings,
      contact: input.contact,
      business: input.business,
      segmentation: input.segmentation,
    }),
  );
}

module.exports = {
  InvalidInitialOrganizationRoleError,
  createRoleResolver,
  normalizeProvisioningInput,
  runCanonicalOrganizationProvisioning,
};
