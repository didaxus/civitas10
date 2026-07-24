import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  OwnerShell,
  PageHeader,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/owner/OwnerUI";
import {
  AlertStrip,
  ActionBar,
  FormField,
  SectionCard,
  StateRegion,
  StatusPill,
  Stepper,
} from "../shared/ui";
import { useOwnerApi, type CreateOwnerOrganizationInput } from "../api/owner";
import {
  useLocationsApi,
  type CountryOption,
  type StateOption,
  type CityOption,
} from "../api/locations";

const APP_BASE_DOMAINS = ["didaxus.com"] as const;
const LOCATION_CATALOG_SOURCE =
  "dr5hn/countries-states-cities-database" as const;
const DEFAULT_COUNTRY_ISO2 = "CO";

const LOGTO_USERNAME_MAX_LENGTH = 128;

const normalizeLogtoUsername = (value: string) => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^([^a-z_])/, "_$1")
    .replace(/^_+$/, "")
    .slice(0, LOGTO_USERNAME_MAX_LENGTH);
  return normalized || "";
};

const buildLogtoUsernameFromEmail = (email: string) =>
  normalizeLogtoUsername(email.split("@")[0] || "");

const phoneDigits = (value: string) => value.replace(/\D/g, "");
const hasDialableLocalNumber = (value: string) => phoneDigits(value).length > 0;
const MIN_LOCAL_PHONE_DIGITS = 4;

const buildPhoneFromParts = (prefix: string, localNumber: string) => {
  const number = normalizePhoneValue(localNumber);
  if (!hasDialableLocalNumber(number)) return undefined;
  const normalizedPrefix = normalizePhoneValue(prefix);
  if (!normalizedPrefix) return undefined;
  return [normalizedPrefix, number].join(" ");
};

const includePhoneParts = (prefix: string, localNumber: string) =>
  Boolean(normalizePhoneValue(prefix) && hasDialableLocalNumber(localNumber));

const normalizeSegmentationLabel = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const buildSegmentationDefaults = (organizationName: string) => {
  const label = normalizeSegmentationLabel(organizationName);
  return label ? { tags: [label], lists: [label] } : { tags: [], lists: [] };
};

const formatPhonePrefix = (phoneCode?: string | null) =>
  phoneCode ? `+${phoneCode.replace(/^\+/, "")}` : "";
const getCountryDialCode = (country: CountryOption | null) =>
  formatPhonePrefix(country?.phoneCode);

type AdministrativeContact = {
  id: string;
  firstName: string;
  middleName: string;
  firstSurname: string;
  secondSurname: string;
  email: string;
  phonePrefix: string;
  phoneNumber: string;
  phoneExtension: string;
  position: string;
  organizationRoleName: string;
  username: string;
};

type OrganizationTemplateRole = {
  id: string;
  name: string;
};

type OrganizationTemplateResponse = {
  roles: OrganizationTemplateRole[];
  requiredRoleNames?: string[];
  missingRoleNames?: string[];
  ready: boolean;
};

type FormState = {
  name: string;
  description: string;
  appSubdomain: string;
  appBaseDomain: string;
  adminDomain: string;
  jitDefaultRoleName: string;
  business: {
    website: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    countryId: string;
    stateId: string;
    cityId: string;
    manualCity: string;
    contactEmail: string;
    phonePrefix: string;
    phoneNumber: string;
    postalCode: string;
    country: string;
    numberOfEmployees: string;
    industry: string;
    type: string;
    about: string;
    nit: string;
    verificationDigit: string;
  };
  segmentation: {
    tags: string[];
    lists: string[];
  };
  administrativeContacts: AdministrativeContact[];
};

type WizardGlobalState = {
  companyPrefix: string;
};

type CreatedState = {
  organizationId: string;
  organizationName: string;
  organizationDescription: string | null;
  firstAdminUserId: string | null;
  assignedOrganizationRole: string | null;
  idempotencyKey: string | null;
  administrativeContactAssignments: Array<{
    key: string;
    email: string;
    logtoUserId: string;
    roleName: string;
    userCreated: boolean;
    userSource: string;
  }>;
};

const normalizePhoneValue = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const emptyContact = (
  index: number,
  roleName = "",
  phonePrefix = "",
): AdministrativeContact => ({
  id: `contact-${index}`,
  firstName: "",
  middleName: "",
  firstSurname: "",
  secondSurname: "",
  email: "",
  phonePrefix,
  phoneNumber: "",
  phoneExtension: "",
  position: "",
  organizationRoleName: roleName,
  username: "",
});

const initialFormState = (defaultRoleName = ""): FormState => ({
  name: "",
  description: "",
  appSubdomain: "",
  appBaseDomain: APP_BASE_DOMAINS[0],
  adminDomain: "",
  jitDefaultRoleName: "",
  business: {
    website: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    countryId: "",
    stateId: "",
    cityId: "",
    manualCity: "",
    contactEmail: "",
    phonePrefix: "",
    phoneNumber: "",
    postalCode: "",
    country: "",
    numberOfEmployees: "",
    industry: "",
    type: "",
    about: "",
    nit: "",
    verificationDigit: "",
  },
  segmentation: {
    tags: [],
    lists: [],
  },
  administrativeContacts: [emptyContact(1, defaultRoleName)],
});

const toSentence = (value: string) => value.trim();
const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailFormatError = (value: string) => {
  const trimmed = value.trim();
  return trimmed && !EMAIL_FORMAT_PATTERN.test(trimmed)
    ? "Enter a valid email address."
    : "";
};
const emptyValue = "— vacío";
const optionalValue = "no especificado";

type EmailFieldErrors = {
  businessContactEmail?: string;
  administrativeContacts: Record<string, string | undefined>;
};

type ReviewField = {
  label: string;
  value: string;
  required?: boolean;
};

const isMissingRequiredReviewField = (field: ReviewField) =>
  Boolean(field.required && !toSentence(field.value));

const parseDelimitedValues = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );

const inputClassName = "civitas-field";

const wizardSteps = [
  { id: "organization", label: "Organization" },
  { id: "admins", label: "Administrative users" },
  { id: "segmentation", label: "Segmentation" },
  { id: "review", label: "Review & submit" },
] as const;

const OwnerOrganizationsPage = () => {
  const ownerApi = useOwnerApi();
  const locationsApi = useLocationsApi();
  const [template, setTemplate] = useState<OrganizationTemplateResponse | null>(
    null,
  );
  const [templateLoading, setTemplateLoading] = useState(true);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialFormState());
  const [globalWizardState, setGlobalWizardState] = useState<WizardGlobalState>(
    { companyPrefix: "" },
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedState | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [segmentationEdited, setSegmentationEdited] = useState({
    tags: false,
    lists: false,
  });
  const [emailErrors, setEmailErrors] = useState<EmailFieldErrors>({
    administrativeContacts: {},
  });

  useEffect(() => {
    let cancelled = false;

    const loadTemplate = async () => {
      setTemplateLoading(true);
      setTemplateError(null);
      try {
        const response = await ownerApi.getOrganizationTemplate();
        if (cancelled) return;
        setTemplate(response);
        setForm((current) => {
          return {
            ...current,
            jitDefaultRoleName: current.jitDefaultRoleName,
            administrativeContacts: current.administrativeContacts.map(
              (contact, index) => ({
                ...contact,
                organizationRoleName: contact.organizationRoleName,
                phonePrefix: normalizePhoneValue(contact.phonePrefix),
                id: `contact-${index + 1}`,
              }),
            ),
          };
        });
      } catch (error) {
        if (cancelled) return;
        setTemplateError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    };

    void loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [ownerApi]);

  useEffect(() => {
    let cancelled = false;
    locationsApi
      .listCountries()
      .then((rows) => {
        if (cancelled) return;
        setCountries(rows);
        setLocationsError(
          rows.length === 0
            ? "Location catalog is empty. Run the backend location import before using country/state/city selects."
            : null,
        );
        setForm((current) => {
          if (current.business.countryId || rows.length === 0) return current;
          const defaultCountry =
            rows.find((country) => country.iso2 === DEFAULT_COUNTRY_ISO2) ||
            rows[0];
          const phonePrefix = getCountryDialCode(defaultCountry);
          setGlobalWizardState((globalState) => ({
            ...globalState,
            companyPrefix: phonePrefix,
          }));
          return {
            ...current,
            business: {
              ...current.business,
              countryId: String(defaultCountry.id),
              country: defaultCountry.name,
              phonePrefix,
            },
          };
        });
      })
      .catch((error) => {
        if (!cancelled)
          setLocationsError(
            error instanceof Error ? error.message : String(error),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [locationsApi]);

  useEffect(() => {
    const countryId = Number(form.business.countryId);
    setStates([]);
    setCities([]);
    if (!countryId) return;
    let cancelled = false;
    locationsApi
      .listStates(countryId)
      .then((rows) => {
        if (!cancelled) setStates(rows);
      })
      .catch(() => {
        if (!cancelled) setStates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.business.countryId, locationsApi]);

  useEffect(() => {
    const stateId = Number(form.business.stateId);
    setCities([]);
    if (!stateId) return;
    let cancelled = false;
    locationsApi
      .listCities(stateId)
      .then((rows) => {
        if (!cancelled) setCities(rows);
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.business.stateId, locationsApi]);

  const adminRoleOptions = useMemo(() => template?.roles ?? [], [template]);
  const selectedCountry = useMemo(
    () =>
      countries.find(
        (country) => String(country.id) === form.business.countryId,
      ) ?? null,
    [countries, form.business.countryId],
  );

  useEffect(() => {
    let cancelled = false;
    const applyCompanyPrefix = (prefix: string) => {
      if (cancelled) return;
      setGlobalWizardState((globalState) => ({
        ...globalState,
        companyPrefix: prefix,
      }));
      setForm((current) =>
        current.business.phonePrefix === prefix
          ? current
          : {
              ...current,
              business: { ...current.business, phonePrefix: prefix },
            },
      );
    };

    if (!selectedCountry) {
      applyCompanyPrefix("");
      return () => {
        cancelled = true;
      };
    }

    const countryListPrefix = getCountryDialCode(selectedCountry);
    if (countryListPrefix) applyCompanyPrefix(countryListPrefix);

    void locationsApi
      .getPhoneCode(selectedCountry.id)
      .then((phoneCode) => {
        const fetchedPrefix = formatPhonePrefix(phoneCode) || countryListPrefix;
        applyCompanyPrefix(fetchedPrefix);
      })
      .catch(() => {
        applyCompanyPrefix(countryListPrefix);
      });

    return () => {
      cancelled = true;
    };
  }, [locationsApi, selectedCountry]);
  const regionOptions = states;
  const selectedRegion = useMemo(
    () =>
      states.find((state) => String(state.id) === form.business.stateId) ??
      null,
    [states, form.business.stateId],
  );
  const cityOptions = cities;
  const selectedCity = useMemo(
    () =>
      cities.find((city) => String(city.id) === form.business.cityId) ?? null,
    [cities, form.business.cityId],
  );
  const hasInvalidBusinessEmail = Boolean(
    emailFormatError(form.business.contactEmail),
  );
  const hasInvalidAdministrativeEmail = form.administrativeContacts.some(
    (contact) => Boolean(emailFormatError(contact.email)),
  );
  const hasInvalidCurrentStepEmail =
    activeStep === 0
      ? hasInvalidBusinessEmail
      : activeStep === 1
        ? hasInvalidAdministrativeEmail
        : false;
  const canSubmit = Boolean(template?.ready) && !submitting;

  const updateField = <K extends keyof FormState>(
    field: K,
    value: FormState[K],
  ) => {
    setForm((current) => {
      if (field !== "name" || typeof value !== "string")
        return { ...current, [field]: value };
      const previousDefaults = buildSegmentationDefaults(current.name);
      const nextDefaults = buildSegmentationDefaults(value);
      return {
        ...current,
        [field]: value,
        segmentation: {
          tags:
            segmentationEdited.tags ||
            current.segmentation.tags.join(",") !==
              previousDefaults.tags.join(",")
              ? current.segmentation.tags
              : nextDefaults.tags,
          lists:
            segmentationEdited.lists ||
            current.segmentation.lists.join(",") !==
              previousDefaults.lists.join(",")
              ? current.segmentation.lists
              : nextDefaults.lists,
        },
      };
    });
  };

  const updateBusinessField = <K extends keyof FormState["business"]>(
    field: K,
    value: string,
  ) => {
    if (field === "contactEmail") {
      setEmailErrors((current) => ({
        ...current,
        businessContactEmail: undefined,
      }));
    }
    setForm((current) => ({
      ...current,
      business: {
        ...current.business,
        [field]: value,
      },
    }));
  };

  const updateCountryField = (countryId: string) => {
    const nextCountry =
      countries.find((country) => String(country.id) === countryId) ?? null;
    setForm((current) => ({
      ...current,
      business: {
        ...current.business,
        countryId,
        country: nextCountry?.name || "",
        stateId: "",
        state: "",
        cityId: "",
        city: "",
        manualCity: "",
      },
    }));
  };

  const updateStateField = (stateId: string) => {
    const nextRegion =
      states.find((state) => String(state.id) === stateId) ?? null;
    setForm((current) => ({
      ...current,
      business: {
        ...current.business,
        stateId,
        state: nextRegion?.name || "",
        cityId: "",
        city: "",
        manualCity: "",
      },
    }));
  };

  const updateCityField = (cityId: string) => {
    const nextCity = cities.find((city) => String(city.id) === cityId) ?? null;
    setForm((current) => ({
      ...current,
      business: {
        ...current.business,
        cityId,
        city: nextCity?.name || "",
        manualCity: cityId ? "" : current.business.manualCity,
      },
    }));
  };

  const updateContact = (
    id: string,
    field: keyof AdministrativeContact,
    value: string,
  ) => {
    if (field === "email") {
      setEmailErrors((current) => ({
        ...current,
        administrativeContacts: {
          ...current.administrativeContacts,
          [id]: undefined,
        },
      }));
    }
    setForm((current) => ({
      ...current,
      administrativeContacts: current.administrativeContacts.map((contact) => {
        if (contact.id !== id) return contact;
        if (field === "email") {
          const previousGeneratedUsername = buildLogtoUsernameFromEmail(
            contact.email,
          );
          const nextGeneratedUsername = buildLogtoUsernameFromEmail(value);
          const shouldAutofillUsername =
            !contact.username || contact.username === previousGeneratedUsername;
          return {
            ...contact,
            email: value,
            username: shouldAutofillUsername
              ? nextGeneratedUsername
              : contact.username,
          };
        }
        if (field === "username")
          return { ...contact, username: normalizeLogtoUsername(value) };
        return { ...contact, [field]: value };
      }),
    }));
  };

  useEffect(() => {
    if (activeStep !== 1 || !globalWizardState.companyPrefix) return;
    setForm((current) => ({
      ...current,
      administrativeContacts: current.administrativeContacts.map((contact) =>
        normalizePhoneValue(contact.phonePrefix)
          ? contact
          : { ...contact, phonePrefix: globalWizardState.companyPrefix },
      ),
    }));
  }, [activeStep, globalWizardState.companyPrefix]);

  const addContact = () => {
    const fallbackRole = adminRoleOptions[0]?.name || "";
    setForm((current) => ({
      ...current,
      administrativeContacts: [
        ...current.administrativeContacts,
        emptyContact(
          current.administrativeContacts.length + 1,
          fallbackRole,
          globalWizardState.companyPrefix,
        ),
      ],
    }));
  };

  const removeContact = (id: string) => {
    setEmailErrors((current) => {
      const administrativeContacts = { ...current.administrativeContacts };
      delete administrativeContacts[id];
      return { ...current, administrativeContacts };
    });
    setForm((current) => {
      const next = current.administrativeContacts.filter(
        (contact) => contact.id !== id,
      );
      return {
        ...current,
        administrativeContacts:
          next.length > 0
            ? next
            : [emptyContact(1, "", globalWizardState.companyPrefix)],
      };
    });
  };

  const validateBusinessContactEmail = () => {
    const error = emailFormatError(form.business.contactEmail);
    setEmailErrors((current) => ({
      ...current,
      businessContactEmail: error || undefined,
    }));
    return !error;
  };

  const validateContactEmail = (id: string) => {
    const contact = form.administrativeContacts.find(
      (entry) => entry.id === id,
    );
    const error = emailFormatError(contact?.email || "");
    setEmailErrors((current) => ({
      ...current,
      administrativeContacts: {
        ...current.administrativeContacts,
        [id]: error || undefined,
      },
    }));
    return !error;
  };

  const validate = () => {
    const errors: string[] = [];
    if (!toSentence(form.name)) errors.push("Organization name is required.");
    if (!toSentence(form.appSubdomain))
      errors.push("Application subdomain is required.");
    if (!toSentence(form.appBaseDomain))
      errors.push("Application base domain is required.");
    if (!toSentence(form.adminDomain))
      errors.push("Institutional provisioning domain is required.");
    if (emailFormatError(form.business.contactEmail))
      errors.push("Organization contact email has an invalid format.");
    if (hasDialableLocalNumber(form.business.phoneNumber)) {
      if (!toSentence(form.business.phonePrefix))
        errors.push(
          "Organization phone prefix is required when an organization phone number is provided.",
        );
      if (
        phoneDigits(form.business.phoneNumber).length < MIN_LOCAL_PHONE_DIGITS
      )
        errors.push(
          `Organization phone number must include at least ${MIN_LOCAL_PHONE_DIGITS} digits after the country code.`,
        );
    }

    const seenEmails = new Set<string>();
    form.administrativeContacts.forEach((contact, index) => {
      if (!toSentence(contact.firstName)) {
        errors.push(
          `Administrative contact ${index + 1}: first name is required.`,
        );
      }
      if (!toSentence(contact.firstSurname)) {
        errors.push(
          `Administrative contact ${index + 1}: first surname is required.`,
        );
      }
      if (!toSentence(contact.email)) {
        errors.push(`Administrative contact ${index + 1}: email is required.`);
      }
      if (!toSentence(contact.organizationRoleName)) {
        errors.push(
          `Administrative contact ${index + 1}: organization role is required.`,
        );
      }
      if (hasDialableLocalNumber(contact.phoneNumber)) {
        if (!toSentence(contact.phonePrefix))
          errors.push(
            `Administrative contact ${index + 1}: phone prefix is required when a phone number is provided.`,
          );
        if (phoneDigits(contact.phoneNumber).length < MIN_LOCAL_PHONE_DIGITS)
          errors.push(
            `Administrative contact ${index + 1}: phone number must include at least ${MIN_LOCAL_PHONE_DIGITS} digits after the country code.`,
          );
      }
      const email = contact.email.trim().toLowerCase();
      if (email) {
        if (emailFormatError(email)) {
          errors.push(
            `Administrative contact ${index + 1}: email format is invalid.`,
          );
        }
        if (seenEmails.has(email)) {
          errors.push(
            `Administrative contact ${index + 1}: email ${email} is duplicated.`,
          );
        }
        seenEmails.add(email);
      }
    });

    return errors;
  };

  const buildPayload = (): CreateOwnerOrganizationInput => {
    const primaryAdministrativeContact = form.administrativeContacts[0];
    const primaryOwnerName = [
      primaryAdministrativeContact?.firstName,
      primaryAdministrativeContact?.middleName,
      primaryAdministrativeContact?.firstSurname,
      primaryAdministrativeContact?.secondSurname,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      idempotencyKey: idempotencyKey || undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      appSubdomain: form.appSubdomain.trim().toLowerCase(),
      appBaseDomain: form.appBaseDomain.trim().toLowerCase(),
      adminDomain: form.adminDomain.trim().toLowerCase(),
      jitProvisioning: {
        defaultRoleNames: form.jitDefaultRoleName
          ? [form.jitDefaultRoleName]
          : [],
      },
      contact: {
        email: form.business.contactEmail.trim().toLowerCase() || undefined,
        phone: buildPhoneFromParts(
          form.business.phonePrefix,
          form.business.phoneNumber,
        ),
        owner: primaryOwnerName || undefined,
      },
      business: {
        website: form.business.website.trim() || undefined,
        addressLine1: form.business.addressLine1.trim() || undefined,
        addressLine2: form.business.addressLine2.trim() || undefined,
        city:
          selectedCity?.name ||
          form.business.manualCity.trim() ||
          form.business.city.trim() ||
          undefined,
        state: selectedRegion?.name || undefined,
        postalCode: form.business.postalCode.trim() || undefined,
        country: selectedCountry?.name || undefined,
        phonePrefix: includePhoneParts(
          form.business.phonePrefix,
          form.business.phoneNumber,
        )
          ? form.business.phonePrefix
          : undefined,
        phoneNumber: includePhoneParts(
          form.business.phonePrefix,
          form.business.phoneNumber,
        )
          ? form.business.phoneNumber.trim()
          : undefined,
        location: {
          countryId: selectedCountry?.id,
          stateId: selectedRegion?.id,
          cityId: selectedCity?.id,
          manualCity: form.business.manualCity.trim() || undefined,
          phonePrefix: form.business.phonePrefix || undefined,
          countryCode: selectedCountry?.iso2,
          stateCode: selectedRegion?.stateCode || undefined,
          source: selectedCountry ? LOCATION_CATALOG_SOURCE : undefined,
        },
        numberOfEmployees: form.business.numberOfEmployees.trim() || undefined,
        industry: form.business.industry.trim() || undefined,
        type: form.business.type.trim() || undefined,
        about: form.business.about.trim() || undefined,
        nit: form.business.nit.trim() || undefined,
        verificationDigit: form.business.verificationDigit.trim() || undefined,
      },
      segmentation: {
        tags: form.segmentation.tags,
        lists: form.segmentation.lists,
      },
      administrativeContacts: form.administrativeContacts.map((contact) => ({
        key: contact.id,
        firstName: contact.firstName.trim(),
        middleName: contact.middleName.trim() || undefined,
        firstSurname: contact.firstSurname.trim(),
        secondSurname: contact.secondSurname.trim() || undefined,
        email: contact.email.trim().toLowerCase(),
        phone: buildPhoneFromParts(contact.phonePrefix, contact.phoneNumber),
        phoneExtension: contact.phoneExtension.trim() || undefined,
        position: contact.position.trim() || undefined,
        organizationRoleName: contact.organizationRoleName,
        username: contact.username.trim() || undefined,
      })),
    };
  };

  const saveDraft = async (stageIndex = activeStep) => {
    setDraftSaving(true);
    setDraftError(null);
    try {
      const response = await ownerApi.saveOrganizationDraft({
        idempotencyKey: idempotencyKey || undefined,
        currentStage: wizardSteps[stageIndex]?.id || "organization",
        stagePayload: {
          ...form,
          companyPrefix: globalWizardState.companyPrefix,
        } as unknown as Record<string, unknown>,
        consolidatedPayload: {
          ...buildPayload(),
          companyPrefix: globalWizardState.companyPrefix,
        } as unknown as Record<string, unknown>,
        status: "draft",
        submitStatus: "not_submitted",
      });
      setIdempotencyKey(response.idempotencyKey);
      return response.idempotencyKey;
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setDraftSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    const errors = validate();
    if (errors.length > 0) {
      setSubmitError(errors.join(" "));
      return;
    }

    setSubmitting(true);
    try {
      const key = idempotencyKey || (await saveDraft(3));
      const response = await ownerApi.createOrganization({
        ...buildPayload(),
        idempotencyKey: key || undefined,
      });
      setIdempotencyKey(response.idempotencyKey);
      setCreated({
        organizationId: response.data.id,
        organizationName: response.data.name || form.name,
        organizationDescription:
          response.data.description || form.description || null,
        firstAdminUserId: response.bootstrap?.firstAdminUserId || null,
        assignedOrganizationRole:
          response.bootstrap?.assignedOrganizationRole || null,
        idempotencyKey: response.idempotencyKey,
        administrativeContactAssignments:
          response.bootstrap?.administrativeContactAssignments || [],
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const templateStatus = templateLoading
    ? "unknown"
    : template?.ready
      ? "success"
      : "warning";
  const isLastStep = activeStep === wizardSteps.length - 1;
  const goNext = () => {
    void saveDraft(activeStep);
    setActiveStep((current) => Math.min(current + 1, wizardSteps.length - 1));
  };
  const goBack = () => setActiveStep((current) => Math.max(current - 1, 0));

  return (
    <OwnerShell>
      <PageHeader
        eyebrow="Provisioning workspace"
        title="Create organization"
        description="Workspace enfocado en provisioning: template status, organización canónica, custom data, usuarios administrativos, segmentación y submit. La navegación primaria permanece en el shell owner."
      />

      <form
        onSubmit={handleSubmit}
        className="civitas-stack"
        data-civitas-create-organization-wizard="true"
      >
        {templateError || draftError || idempotencyKey || created ? (
          <StateRegion>
            {templateError ? (
              <AlertStrip
                variant="danger"
                title="Organization template unavailable"
              >
                Could not load the organization template from the API.{" "}
                {templateError}
              </AlertStrip>
            ) : null}
            {draftError ? (
              <AlertStrip variant="warning" title="Draft not saved">
                {draftError}
              </AlertStrip>
            ) : null}
            {idempotencyKey ? (
              <AlertStrip variant="info" title="Wizard request identifier">
                Idempotency key: <code>{idempotencyKey}</code>. Civitas stores
                this as operational draft/resume state; Logto remains canonical
                for the organization.
              </AlertStrip>
            ) : null}

            {created ? (
              <AlertStrip
                variant="success"
                title="Organization created in Logto"
              >
                <p>
                  <strong>{created.organizationName}</strong> exists in Logto.
                  Civitas keeps the idempotency key and operation history for
                  traceability only.
                </p>
                <p>
                  Request identifier: <code>{created.idempotencyKey}</code>
                </p>
                <div className="civitas-grid-2">
                  <div>
                    <strong>Bootstrap</strong>
                    <p>
                      First admin user id: {created.firstAdminUserId || "-"}
                    </p>
                    <p>
                      Assigned organization role:{" "}
                      {created.assignedOrganizationRole || "-"}
                    </p>
                  </div>
                  <div>
                    <strong>Administrative assignments</strong>
                    <ul>
                      {created.administrativeContactAssignments.map(
                        (assignment) => (
                          <li
                            key={`${assignment.email}-${assignment.logtoUserId}`}
                          >
                            {assignment.email} · {assignment.roleName} ·{" "}
                            {assignment.userCreated
                              ? "new user"
                              : assignment.userSource}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </div>
              </AlertStrip>
            ) : null}
          </StateRegion>
        ) : null}
        <SectionCard className="civitas-wizard-progress-card">
          <Stepper
            steps={wizardSteps.map((step) => ({
              id: step.id,
              label: step.label,
            }))}
            activeStep={activeStep}
          />
        </SectionCard>

        {activeStep === 0 ? (
          <StepOrganization
            form={form}
            adminRoleOptions={adminRoleOptions}
            templateLoading={templateLoading}
            updateField={updateField}
            countries={countries}
            regionOptions={regionOptions}
            cityOptions={cityOptions}
            updateBusinessField={updateBusinessField}
            updateCountryField={updateCountryField}
            updateStateField={updateStateField}
            updateCityField={updateCityField}
            locationsError={locationsError}
            emailError={emailErrors.businessContactEmail}
            onContactEmailBlur={validateBusinessContactEmail}
            inputClassName={inputClassName}
          />
        ) : null}

        {activeStep === 1 ? (
          <StepAdminUsers
            countries={countries}
            contacts={form.administrativeContacts}
            adminRoleOptions={adminRoleOptions}
            templateLoading={templateLoading}
            updateContact={updateContact}
            addContact={addContact}
            removeContact={removeContact}
            emailErrors={emailErrors.administrativeContacts}
            onEmailBlur={validateContactEmail}
            inputClassName={inputClassName}
          />
        ) : null}

        {activeStep === 2 ? (
          <StepSegmentation
            form={form}
            setForm={setForm}
            setSegmentationEdited={setSegmentationEdited}
            inputClassName={inputClassName}
          />
        ) : null}

        {activeStep === 3 ? (
          <StepReview
            form={form}
            template={template}
            templateLoading={templateLoading}
            submitError={submitError}
            selectedCountry={selectedCountry}
            selectedRegion={selectedRegion}
            selectedCity={selectedCity}
            onEditStep={setActiveStep}
          />
        ) : null}

        <ActionBar sticky>
          <StatusPill status={templateStatus} noDot>
            Template:{" "}
            {templateLoading
              ? "loading"
              : template?.ready
                ? "ready"
                : "not ready"}
          </StatusPill>
          <div className="civitas-action-bar">
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={goBack}
              disabled={activeStep === 0}
            >
              Back
            </button>
            {!isLastStep ? (
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={goNext}
                disabled={hasInvalidCurrentStepEmail}
              >
                {draftSaving ? "Saving draft..." : "Save draft & next"}
              </button>
            ) : null}
            {isLastStep ? (
              <button
                type="submit"
                disabled={
                  !canSubmit ||
                  hasInvalidBusinessEmail ||
                  hasInvalidAdministrativeEmail
                }
                className={primaryButtonClassName}
              >
                {submitting
                  ? "Creating organization..."
                  : "Create organization"}
              </button>
            ) : null}
          </div>
        </ActionBar>
      </form>
    </OwnerShell>
  );
};

type UpdateField = <K extends keyof FormState>(
  field: K,
  value: FormState[K],
) => void;
type UpdateBusinessField = <K extends keyof FormState["business"]>(
  field: K,
  value: string,
) => void;

const StepOrganization = (props: {
  form: FormState;
  adminRoleOptions: OrganizationTemplateRole[];
  templateLoading: boolean;
  updateField: UpdateField;
  countries: readonly CountryOption[];
  regionOptions: readonly StateOption[];
  cityOptions: readonly CityOption[];
  updateBusinessField: UpdateBusinessField;
  updateCountryField: (countryId: string) => void;
  updateStateField: (stateId: string) => void;
  updateCityField: (cityId: string) => void;
  locationsError: string | null;
  emailError?: string;
  onContactEmailBlur: () => void;
  inputClassName: string;
}) => (
  <div className="civitas-stack">
    <StepCanonicalOrganization
      form={props.form}
      adminRoleOptions={props.adminRoleOptions}
      templateLoading={props.templateLoading}
      updateField={props.updateField}
      inputClassName={props.inputClassName}
    />
    <StepBusinessProfile
      form={props.form}
      countries={props.countries}
      regionOptions={props.regionOptions}
      cityOptions={props.cityOptions}
      updateBusinessField={props.updateBusinessField}
      updateCountryField={props.updateCountryField}
      updateStateField={props.updateStateField}
      updateCityField={props.updateCityField}
      locationsError={props.locationsError}
      emailError={props.emailError}
      onContactEmailBlur={props.onContactEmailBlur}
      inputClassName={props.inputClassName}
    />
  </div>
);

const StepCanonicalOrganization = ({
  form,
  adminRoleOptions,
  templateLoading,
  updateField,
  inputClassName,
}: {
  form: FormState;
  adminRoleOptions: OrganizationTemplateRole[];
  templateLoading: boolean;
  updateField: UpdateField;
  inputClassName: string;
}) => (
  <SectionCard
    title="Identity & routing"
    description="Created canonically in Logto; configure display name, entry URL, legacy/simple JIT domain and default role. Organization Identity Federation uses explicit mapping policies instead."
  >
    <div className="civitas-form-grid">
      <FormField id="organization-name" label="Organization name" required>
        <input
          id="organization-name"
          className={inputClassName}
          value={form.name}
          onChange={(event) => updateField("name", event.target.value)}
        />
      </FormField>
      <FormField id="organization-description" label="Description">
        <input
          id="organization-description"
          className={inputClassName}
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
        />
      </FormField>
      <FormField id="app-subdomain" label="Application subdomain" required>
        <input
          id="app-subdomain"
          className={inputClassName}
          value={form.appSubdomain}
          onChange={(event) => updateField("appSubdomain", event.target.value)}
          placeholder="school-demo"
        />
      </FormField>
      <FormField id="app-base-domain" label="Application base domain" required>
        <select
          id="app-base-domain"
          className={inputClassName}
          value={form.appBaseDomain}
          onChange={(event) => updateField("appBaseDomain", event.target.value)}
        >
          {APP_BASE_DOMAINS.map((domain) => (
            <option value={domain} key={domain}>
              {domain}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        id="admin-domain"
        label="Institutional provisioning domain"
        required
      >
        <input
          id="admin-domain"
          className={inputClassName}
          value={form.adminDomain}
          onChange={(event) => updateField("adminDomain", event.target.value)}
          placeholder="school.edu.co"
        />
      </FormField>
      <FormField id="jit-default-role" label="Legacy JIT domain default role (not federation)">
        <select
          id="jit-default-role"
          className={inputClassName}
          value={form.jitDefaultRoleName}
          onChange={(event) =>
            updateField("jitDefaultRoleName", event.target.value)
          }
          disabled={templateLoading || adminRoleOptions.length === 0}
        >
          <option value="">No legacy JIT default role</option>
          {adminRoleOptions.map((role) => (
            <option key={role.id} value={role.name}>
              {role.name}
            </option>
          ))}
        </select>
      </FormField>
    </div>

    <AlertStrip variant="info" title="Legacy JIT is not federation">
      This simple onboarding default role only applies to Logto JIT joins by institutional domain. It does not map external IdP claims, SCIM groups or Organization Identity Federation assignments.
    </AlertStrip>
    <AlertStrip variant="neutral" title="Entry URL preview">
      {form.appSubdomain && form.appBaseDomain
        ? `https://${form.appSubdomain}.${form.appBaseDomain}`
        : "Pending subdomain and domain"}
    </AlertStrip>
  </SectionCard>
);

const PhonePrefixInput = ({
  id,
  className,
  countries,
  value,
  onChange,
  ariaLabel,
}: {
  id: string;
  className: string;
  countries: readonly CountryOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) => (
  <>
    <input
      id={id}
      className={`${className} civitas-phone-prefix-field`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      list={`${id}-country-prefixes`}
      inputMode="tel"
      autoComplete="tel-country-code"
      aria-label={ariaLabel}
    />
    <datalist id={`${id}-country-prefixes`}>
      {countries.map((country) => {
        const prefix = getCountryDialCode(country);
        return prefix ? (
          <option key={`${id}-${country.id}`} value={prefix}>
            {country.name}
          </option>
        ) : null;
      })}
    </datalist>
  </>
);

const StepBusinessProfile = ({
  form,
  countries,
  regionOptions,
  cityOptions,
  updateBusinessField,
  updateCountryField,
  updateStateField,
  updateCityField,
  locationsError,
  emailError,
  onContactEmailBlur,
  inputClassName,
}: {
  form: FormState;
  countries: readonly CountryOption[];
  regionOptions: readonly StateOption[];
  cityOptions: readonly CityOption[];
  updateBusinessField: UpdateBusinessField;
  updateCountryField: (countryId: string) => void;
  updateStateField: (stateId: string) => void;
  updateCityField: (cityId: string) => void;
  locationsError: string | null;
  emailError?: string;
  onContactEmailBlur: () => void;
  inputClassName: string;
}) => {
  const shouldShowManualCityFallback = Boolean(
    locationsError ||
    (form.business.stateId && cityOptions.length === 0) ||
    (!form.business.cityId && form.business.manualCity),
  );
  return (
    <SectionCard
      title="Profile fields"
      description="Populate custom data attached to the canonical organization record."
    >
      {locationsError ? (
        <AlertStrip variant="warning" title="Location catalog unavailable">
          The catalog could not be loaded. You can continue with manual
          city/address fields. {locationsError}
        </AlertStrip>
      ) : null}
      <div className="civitas-form-grid">
        <FormField
          id="business-contact-email"
          label="Contact email"
          error={emailError}
        >
          <input
            id="business-contact-email"
            className={inputClassName}
            type="email"
            value={form.business.contactEmail}
            onChange={(event) =>
              updateBusinessField("contactEmail", event.target.value)
            }
            onBlur={onContactEmailBlur}
          />
        </FormField>
        <FormField id="business-website" label="Website">
          <input
            id="business-website"
            className={inputClassName}
            value={form.business.website}
            onChange={(event) =>
              updateBusinessField("website", event.target.value)
            }
          />
        </FormField>
        <FormField id="business-country" label="Country">
          <select
            id="business-country"
            className={inputClassName}
            value={form.business.countryId}
            onChange={(event) => updateCountryField(event.target.value)}
          >
            <option value="">Select country</option>
            {countries.map((country) => (
              <option key={country.id} value={country.id}>
                {country.emoji ? `${country.emoji} ` : ""}
                {country.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="business-state" label="State / region">
          <select
            id="business-state"
            className={inputClassName}
            value={form.business.stateId}
            onChange={(event) => updateStateField(event.target.value)}
            disabled={!form.business.countryId || regionOptions.length === 0}
          >
            <option value="">Select state / region</option>
            {regionOptions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="business-city" label="City">
          <select
            id="business-city"
            className={inputClassName}
            value={form.business.cityId}
            onChange={(event) => updateCityField(event.target.value)}
            disabled={!form.business.stateId || cityOptions.length === 0}
          >
            <option value="">Select city</option>
            {cityOptions.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </FormField>
        {shouldShowManualCityFallback ? (
          <FormField
            id="business-manual-city"
            label="Manual city fallback (optional)"
          >
            <input
              id="business-manual-city"
              className={inputClassName}
              value={form.business.manualCity}
              onChange={(event) =>
                updateBusinessField("manualCity", event.target.value)
              }
              placeholder="Use only when the city is missing from the catalog"
            />
          </FormField>
        ) : null}
        <FormField id="business-phone-prefix" label="Organization phone">
          <div className="civitas-phone-row">
            <PhonePrefixInput
              id="business-phone-prefix"
              className={inputClassName}
              countries={countries}
              value={form.business.phonePrefix}
              onChange={(value) => updateBusinessField("phonePrefix", value)}
              ariaLabel="Organization phone prefix"
            />
            <input
              id="business-phone-number"
              className={`${inputClassName} civitas-phone-number-field`}
              value={form.business.phoneNumber}
              onChange={(event) =>
                updateBusinessField("phoneNumber", event.target.value)
              }
              aria-label="Organization phone number"
            />
          </div>
        </FormField>
        <FormField id="postal-code" label="Postal code">
          <input
            id="postal-code"
            className={inputClassName}
            value={form.business.postalCode}
            onChange={(event) =>
              updateBusinessField("postalCode", event.target.value)
            }
          />
        </FormField>
        <FormField id="employee-count" label="Number of employees">
          <input
            id="employee-count"
            className={inputClassName}
            value={form.business.numberOfEmployees}
            onChange={(event) =>
              updateBusinessField("numberOfEmployees", event.target.value)
            }
          />
        </FormField>
        <FormField id="industry" label="Industry">
          <input
            id="industry"
            className={inputClassName}
            value={form.business.industry}
            onChange={(event) =>
              updateBusinessField("industry", event.target.value)
            }
          />
        </FormField>
        <FormField id="organization-type" label="Organization type">
          <input
            id="organization-type"
            className={inputClassName}
            value={form.business.type}
            onChange={(event) =>
              updateBusinessField("type", event.target.value)
            }
          />
        </FormField>
        <FormField id="tax-id" label="Tax id / NIT">
          <input
            id="tax-id"
            className={inputClassName}
            value={form.business.nit}
            onChange={(event) => updateBusinessField("nit", event.target.value)}
          />
        </FormField>
        <FormField id="verification-digit" label="Verification digit">
          <input
            id="verification-digit"
            className={inputClassName}
            value={form.business.verificationDigit}
            onChange={(event) =>
              updateBusinessField("verificationDigit", event.target.value)
            }
          />
        </FormField>
        <FormField
          id="address-line-1"
          label="Address line 1"
          className="civitas-form-field-wide"
        >
          <input
            id="address-line-1"
            className={inputClassName}
            value={form.business.addressLine1}
            onChange={(event) =>
              updateBusinessField("addressLine1", event.target.value)
            }
          />
        </FormField>
        <FormField
          id="address-line-2"
          label="Address line 2"
          className="civitas-form-field-wide"
        >
          <input
            id="address-line-2"
            className={inputClassName}
            value={form.business.addressLine2}
            onChange={(event) =>
              updateBusinessField("addressLine2", event.target.value)
            }
          />
        </FormField>
        <FormField
          id="business-about"
          label="About"
          className="civitas-form-field-wide"
        >
          <textarea
            id="business-about"
            className={inputClassName}
            value={form.business.about}
            onChange={(event) =>
              updateBusinessField("about", event.target.value)
            }
          />
        </FormField>
      </div>
    </SectionCard>
  );
};

const StepAdminUsers = ({
  countries,
  contacts,
  adminRoleOptions,
  templateLoading,
  updateContact,
  addContact,
  removeContact,
  emailErrors,
  onEmailBlur,
  inputClassName,
}: {
  countries: readonly CountryOption[];
  contacts: AdministrativeContact[];
  adminRoleOptions: OrganizationTemplateRole[];
  templateLoading: boolean;
  updateContact: (
    id: string,
    field: keyof AdministrativeContact,
    value: string,
  ) => void;
  addContact: () => void;
  removeContact: (id: string) => void;
  emailErrors: Record<string, string | undefined>;
  onEmailBlur: (id: string) => void;
  inputClassName: string;
}) => (
  <SectionCard
    title="User bootstrap"
    description="Provision or resolve Logto users, add them to the organization and assign roles."
  >
    <div className="civitas-stack">
      {contacts.map((contact, index) => (
        <SectionCard
          key={contact.id}
          title={`Administrative contact ${index + 1}`}
          description="Users created here keep the custom data flow intact when sent to Logto."
          actions={
            contacts.length > 1 ? (
              <button
                type="button"
                onClick={() => removeContact(contact.id)}
                className="civitas-secondary-button"
              >
                Remove
              </button>
            ) : null
          }
        >
          <div className="civitas-form-grid">
            <FormField
              id={`${contact.id}-first-name`}
              label="First name"
              required
            >
              <input
                id={`${contact.id}-first-name`}
                className={inputClassName}
                value={contact.firstName}
                onChange={(event) =>
                  updateContact(contact.id, "firstName", event.target.value)
                }
              />
            </FormField>
            <FormField id={`${contact.id}-middle-name`} label="Middle name">
              <input
                id={`${contact.id}-middle-name`}
                className={inputClassName}
                value={contact.middleName}
                onChange={(event) =>
                  updateContact(contact.id, "middleName", event.target.value)
                }
              />
            </FormField>
            <FormField
              id={`${contact.id}-first-surname`}
              label="First surname"
              required
            >
              <input
                id={`${contact.id}-first-surname`}
                className={inputClassName}
                value={contact.firstSurname}
                onChange={(event) =>
                  updateContact(contact.id, "firstSurname", event.target.value)
                }
              />
            </FormField>
            <FormField
              id={`${contact.id}-second-surname`}
              label="Second surname"
            >
              <input
                id={`${contact.id}-second-surname`}
                className={inputClassName}
                value={contact.secondSurname}
                onChange={(event) =>
                  updateContact(contact.id, "secondSurname", event.target.value)
                }
              />
            </FormField>
            <FormField
              id={`${contact.id}-email`}
              label="Email"
              required
              error={emailErrors[contact.id]}
            >
              <input
                id={`${contact.id}-email`}
                className={inputClassName}
                type="email"
                value={contact.email}
                onChange={(event) =>
                  updateContact(contact.id, "email", event.target.value)
                }
                onBlur={() => onEmailBlur(contact.id)}
              />
            </FormField>
            <FormField id={`${contact.id}-phone-prefix`} label="User phone">
              <div className="civitas-phone-row">
                <PhonePrefixInput
                  id={`${contact.id}-phone-prefix`}
                  className={inputClassName}
                  countries={countries}
                  value={contact.phonePrefix}
                  onChange={(value) =>
                    updateContact(contact.id, "phonePrefix", value)
                  }
                  ariaLabel="User phone prefix"
                />
                <input
                  id={`${contact.id}-phone`}
                  className={`${inputClassName} civitas-phone-number-field`}
                  value={contact.phoneNumber}
                  onChange={(event) =>
                    updateContact(contact.id, "phoneNumber", event.target.value)
                  }
                  aria-label="User phone number"
                />
              </div>
            </FormField>
            <FormField id={`${contact.id}-extension`} label="Extension">
              <input
                id={`${contact.id}-extension`}
                className={inputClassName}
                value={contact.phoneExtension}
                onChange={(event) =>
                  updateContact(
                    contact.id,
                    "phoneExtension",
                    event.target.value,
                  )
                }
              />
            </FormField>
            <FormField id={`${contact.id}-position`} label="Position">
              <input
                id={`${contact.id}-position`}
                className={inputClassName}
                value={contact.position}
                onChange={(event) =>
                  updateContact(contact.id, "position", event.target.value)
                }
              />
            </FormField>
            <FormField
              id={`${contact.id}-role`}
              label="Organization role"
              required
            >
              <select
                id={`${contact.id}-role`}
                className={inputClassName}
                value={contact.organizationRoleName}
                onChange={(event) =>
                  updateContact(
                    contact.id,
                    "organizationRoleName",
                    event.target.value,
                  )
                }
                disabled={templateLoading || adminRoleOptions.length === 0}
              >
                <option value="">Select Logto organization role</option>
                {adminRoleOptions.map((role) => (
                  <option key={`${contact.id}-${role.id}`} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id={`${contact.id}-username`} label="Username">
              <input
                id={`${contact.id}-username`}
                className={inputClassName}
                value={contact.username}
                onChange={(event) =>
                  updateContact(contact.id, "username", event.target.value)
                }
              />
            </FormField>
          </div>
        </SectionCard>
      ))}
      <div>
        <button
          type="button"
          onClick={addContact}
          className="civitas-secondary-button"
        >
          Add another administrative user
        </button>
      </div>
    </div>
  </SectionCard>
);

const StepSegmentation = ({
  form,
  setForm,
  setSegmentationEdited,
  inputClassName,
}: {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  setSegmentationEdited: Dispatch<
    SetStateAction<{ tags: boolean; lists: boolean }>
  >;
  inputClassName: string;
}) => (
  <SectionCard
    title="Tags and lists"
    description="Store clean segmentation metadata for later connector orchestration. Civitas auto-builds onboarding defaults from the organization name; you can edit or remove them before submit."
  >
    <div className="civitas-form-grid">
      <FormField id="segmentation-tags" label="Tags">
        <input
          id="segmentation-tags"
          className={inputClassName}
          value={form.segmentation.tags.join(", ")}
          onChange={(event) => {
            setSegmentationEdited((current) => ({ ...current, tags: true }));
            setForm((current) => ({
              ...current,
              segmentation: {
                ...current.segmentation,
                tags: parseDelimitedValues(event.target.value),
              },
            }));
          }}
          placeholder="La W"
        />
      </FormField>
      <FormField id="segmentation-lists" label="Lists">
        <input
          id="segmentation-lists"
          className={inputClassName}
          value={form.segmentation.lists.join(", ")}
          onChange={(event) => {
            setSegmentationEdited((current) => ({ ...current, lists: true }));
            setForm((current) => ({
              ...current,
              segmentation: {
                ...current.segmentation,
                lists: parseDelimitedValues(event.target.value),
              },
            }));
          }}
          placeholder="La W"
        />
      </FormField>
    </div>
  </SectionCard>
);

const ReviewFields = ({ fields }: { fields: ReviewField[] }) => (
  <dl className="civitas-review-fields">
    {fields.map((field) => {
      const missing = isMissingRequiredReviewField(field);
      const value =
        toSentence(field.value) ||
        (field.required ? emptyValue : optionalValue);
      return (
        <div
          key={field.label}
          className="civitas-review-field"
          data-missing={missing}
        >
          <dt>{field.label}</dt>
          <dd>{value}</dd>
        </div>
      );
    })}
  </dl>
);

const fullName = (contact: AdministrativeContact) =>
  [
    contact.firstName,
    contact.middleName,
    contact.firstSurname,
    contact.secondSurname,
  ]
    .map(toSentence)
    .filter(Boolean)
    .join(" ");

const StepReview = ({
  form,
  template,
  templateLoading,
  submitError,
  selectedCountry,
  selectedRegion,
  selectedCity,
  onEditStep,
}: {
  form: FormState;
  template: OrganizationTemplateResponse | null;
  templateLoading: boolean;
  submitError: string | null;
  selectedCountry: CountryOption | null;
  selectedRegion: StateOption | null;
  selectedCity: CityOption | null;
  onEditStep: (step: number) => void;
}) => (
  <div className="civitas-stack">
    <SectionCard
      title="Final confirmation"
      description="Review the exact data that will be submitted. Empty required fields are highlighted."
      actions={
        <StatusPill
          status={
            templateLoading
              ? "unknown"
              : template?.ready
                ? "success"
                : "warning"
          }
          noDot
        >
          Template:{" "}
          {templateLoading
            ? "loading"
            : template?.ready
              ? "ready"
              : "not ready"}
        </StatusPill>
      }
    >
      {template && (template.missingRoleNames || []).length > 0 ? (
        <AlertStrip variant="warning" title="Template roles missing">
          Missing roles: {(template.missingRoleNames || []).join(", ")}
        </AlertStrip>
      ) : null}
      {submitError ? (
        <AlertStrip variant="danger" title="Cannot submit organization">
          {submitError}
        </AlertStrip>
      ) : null}
    </SectionCard>

    <SectionCard
      title="Organization"
      description="Canonical identity, routing and provisioning defaults."
      actions={
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={() => onEditStep(0)}
        >
          Editar
        </button>
      }
    >
      <ReviewFields
        fields={[
          { label: "Organization name", value: form.name, required: true },
          {
            label: "Application subdomain",
            value: form.appSubdomain,
            required: true,
          },
          {
            label: "Application base domain",
            value: form.appBaseDomain,
            required: true,
          },
          {
            label: "Institutional provisioning domain",
            value: form.adminDomain,
            required: true,
          },
          { label: "Legacy JIT default role (no external claim/group mapping)", value: form.jitDefaultRoleName },
          { label: "Description", value: form.description },
        ]}
      />
    </SectionCard>

    <SectionCard
      title="Business profile"
      description="Operational custom data attached to the organization."
      actions={
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={() => onEditStep(0)}
        >
          Editar
        </button>
      }
    >
      <ReviewFields
        fields={[
          { label: "Website", value: form.business.website },
          {
            label: "Country",
            value: selectedCountry?.name || form.business.country,
          },
          {
            label: "State / region",
            value: selectedRegion?.name || form.business.state,
          },
          {
            label: "City",
            value:
              selectedCity?.name ||
              form.business.manualCity ||
              form.business.city,
          },
          { label: "NIT", value: form.business.nit },
          {
            label: "Verification digit",
            value: form.business.verificationDigit,
          },
          {
            label: "Phone",
            value:
              buildPhoneFromParts(
                form.business.phonePrefix,
                form.business.phoneNumber,
              ) || "",
          },
          { label: "Contact email", value: form.business.contactEmail },
          { label: "Postal code", value: form.business.postalCode },
          { label: "Industry", value: form.business.industry },
          { label: "Organization type", value: form.business.type },
          {
            label: "Number of employees",
            value: form.business.numberOfEmployees,
          },
          { label: "Address line 1", value: form.business.addressLine1 },
          { label: "Address line 2", value: form.business.addressLine2 },
          { label: "About", value: form.business.about },
        ]}
      />
    </SectionCard>

    <SectionCard
      title="Administrative users"
      description="Every user that will be provisioned or resolved and attached to the organization."
      actions={
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={() => onEditStep(1)}
        >
          Editar
        </button>
      }
    >
      <div className="civitas-stack-sm">
        {form.administrativeContacts.map((contact, index) => (
          <SectionCard
            key={contact.id}
            title={`Administrative contact ${index + 1}`}
          >
            <ReviewFields
              fields={[
                {
                  label: "Full name",
                  value: fullName(contact),
                  required: true,
                },
                { label: "Email", value: contact.email, required: true },
                {
                  label: "Phone",
                  value:
                    buildPhoneFromParts(
                      contact.phonePrefix,
                      contact.phoneNumber,
                    ) || "",
                },
                { label: "Extension", value: contact.phoneExtension },
                { label: "Position", value: contact.position },
                {
                  label: "Role",
                  value: contact.organizationRoleName,
                  required: true,
                },
                { label: "Username", value: contact.username },
              ]}
            />
          </SectionCard>
        ))}
      </div>
    </SectionCard>

    <SectionCard
      title="Segmentation"
      description="Tags and lists that will seed connector and onboarding segmentation."
      actions={
        <button
          type="button"
          className={secondaryButtonClassName}
          onClick={() => onEditStep(2)}
        >
          Editar
        </button>
      }
    >
      <ReviewFields
        fields={[
          { label: "Tags", value: form.segmentation.tags.join(", ") },
          { label: "Lists", value: form.segmentation.lists.join(", ") },
        ]}
      />
    </SectionCard>
  </div>
);

export default OwnerOrganizationsPage;
