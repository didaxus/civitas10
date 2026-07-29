"use strict";

const MIN_ALIAS_LENGTH = 1;
const MAX_ALIAS_LENGTH = 80;
const CONTROL_OR_BIDI = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const UNSAFE_MARKUP = /[<>]|&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/iu;

class RoleLabelValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RoleLabelValidationError";
    this.code = code;
    this.status = 422;
  }
}

function validateRoleAlias(value) {
  if (typeof value !== "string") throw new RoleLabelValidationError("role_alias_type_invalid", "Role alias must be a string.");
  const alias = value.normalize("NFC").trim();
  const length = [...alias].length;
  if (length < MIN_ALIAS_LENGTH || length > MAX_ALIAS_LENGTH) throw new RoleLabelValidationError("role_alias_length_invalid", `Role alias must contain between ${MIN_ALIAS_LENGTH} and ${MAX_ALIAS_LENGTH} characters.`);
  // Format characters include every bidi override/isolate. Surrogates reject malformed Unicode.
  if (CONTROL_OR_BIDI.test(alias)) throw new RoleLabelValidationError("role_alias_control_or_bidi", "Role alias cannot contain control, formatting, bidi, or malformed Unicode characters.");
  // Aliases are plain text. Reject markup/entity-shaped input at ingress as defense in depth.
  if (UNSAFE_MARKUP.test(alias)) throw new RoleLabelValidationError("role_alias_unsafe_content", "Role alias must be plain text and cannot contain markup or encoded entities.");
  return alias;
}

function aliasUniquenessKey(alias) {
  return validateRoleAlias(alias).normalize("NFKC").toLocaleLowerCase("und");
}

module.exports = { MIN_ALIAS_LENGTH, MAX_ALIAS_LENGTH, RoleLabelValidationError, validateRoleAlias, aliasUniquenessKey };
