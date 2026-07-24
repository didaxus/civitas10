const test = require("node:test");
const assert = require("node:assert/strict");
const { buildLogtoUsername, buildOrganizationCreatePayload, buildUserCreatePayload } = require("../services/organizationProvisioningPayloads");
const { normalizeProvisioningInput } = require("../services/organizationProvisioningCore");

test("owner onboarding derives Logto-safe usernames from email local-part", () => {
  assert.equal(buildLogtoUsername({ email: "j.rodriguez@ejemplo.com" }), "j_rodriguez");
  assert.equal(buildLogtoUsername({ email: "1.José+Admin@ejemplo.com" }), "_1_jose_admin");
  assert.match(buildLogtoUsername({ email: "a".repeat(140) + "@ejemplo.com" }), /^[a-z_][a-z0-9_]{0,127}$/);
});

test("normalized provisioning input and Logto payload carry the generated username", () => {
  const normalized = normalizeProvisioningInput({
    name: "Colegio Demo",
    appSubdomain: "colegio-demo",
    appBaseDomain: "didaxus.com",
    adminDomain: "colegio.edu.co",
    segmentation: { tags: ["org-colegio-demo"], lists: ["onboarding-colegio-demo"] },
    administrativeContacts: [{ firstName: "Juan", firstSurname: "Rodriguez", email: "j.rodriguez@ejemplo.com", organizationRoleName: "organization_payroll" }],
  });

  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.value.canonical.administrativeContacts[0].username, "j_rodriguez");
  assert.deepEqual(normalized.value.canonical.administrativeContacts[0].segmentation, {
    roleTag: "organization_payroll",
    organizationTags: ["org-colegio-demo"],
    organizationLists: ["onboarding-colegio-demo"],
  });
  const payload = buildUserCreatePayload(normalized.value.canonical.administrativeContacts[0]);
  assert.equal(payload.username, "j_rodriguez");
  assert.equal(payload.avatar, "");
  assert.equal(payload.profile.nickname, "j_rodriguez");
  assert.equal(payload.profile.preferredUsername, undefined);
  assert.equal(payload.customData.civitasProfile, undefined);
  assert.deepEqual(payload.customData.contact.segmentation, {
    roleTag: "organization_payroll",
    userTags: ["organization_payroll", "org-colegio-demo"],
    organizationTags: ["org-colegio-demo"],
    organizationLists: ["onboarding-colegio-demo"],
  });
  assert.equal(payload.customData.contact.source, "");
  assert.equal(payload.customData.secondFamilyName, "");
});


test("member contact payload separates Logto profile and customData spaces", () => {
  assert.deepEqual(buildUserCreatePayload({}), {
    primaryEmail: "",
    primaryPhone: "",
    name: "",
    username: "",
    avatar: "",
    profile: {
      familyName: "",
      givenName: "",
      middleName: "",
      nickname: "",
    },
    customData: {
      contact: {
        key: "",
        phone: "",
        source: "",
        fullName: "",
        position: "",
        segmentation: {
          roleTag: "",
          userTags: [],
          organizationTags: [],
          organizationLists: [],
        },
        phoneExtension: "",
        organizationRoleName: "",
      },
      secondFamilyName: "",
    },
  });
});


test("organization customData uses required Logto profile structure", () => {
  const normalized = normalizeProvisioningInput({
    name: "Colegio Demo",
    description: "Institución demo",
    entryUrl: "https://colegio-demo.didaxus.com",
    appSubdomain: "colegio-demo",
    appBaseDomain: "didaxus.com",
    adminDomain: "colegio.edu.co",
    oidcRedirectUri: "https://colegio-demo.didaxus.com/callback",
    contact: { email: "owner@example.test", owner: "Owner", phone: "+573001112233" },
    business: { nit: "900123456", city: "Bogotá", country: "Colombia", description: "Colegio" },
    segmentation: { tags: ["org-colegio-demo"], lists: ["onboarding-colegio-demo"] },
    administrativeContacts: [{ firstName: "Juan", firstSurname: "Rodriguez", secondSurname: "Perez", email: "j.rodriguez@ejemplo.com", organizationRoleName: "organization_payroll" }],
    jitProvisioning: { defaultRoleNames: ["organization_member"] },
  });

  assert.deepEqual(normalized.errors, []);
  const { customData } = buildOrganizationCreatePayload(normalized.value);

  assert.equal(customData.provisioning.jitDefaultRoleNames, undefined);
  assert.equal(customData.civitasProfile, undefined);
  assert.equal(customData.mainContactOfCivitas.administrativeContacts, undefined);
  assert.equal(customData.mainContactOfCivitas.downstream, undefined);
  assert.equal(customData.mainContactOfCivitas.userData, undefined);
  assert.equal(customData.mainContactOfCivitas.secondFamilyName, undefined);
  assert.deepEqual(customData.mainContactOfCivitas.segmentation, {
    organizationTags: ["org-colegio-demo"],
    organizationLists: ["onboarding-colegio-demo"],
  });
});
