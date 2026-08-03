export type RoleSelectorOption = {
  canonicalRoleId: string;
  alias?: string;
  status?: string;
  disabled?: boolean;
};

export const RoleSelector = ({
  id,
  label,
  value,
  roles,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  roles: RoleSelectorOption[];
  onChange: (canonicalRoleId: string) => void;
  disabled?: boolean;
}) => (
  <label className="civitas-form-field" data-civitas-primitive="role-selector">
    <span className="civitas-form-field-label">{label}</span>
    <select id={id} className="civitas-field" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {roles.map((role) => {
        const label = role.alias || "Organization role";
        return <option key={role.canonicalRoleId} value={role.canonicalRoleId} disabled={role.disabled}>{label}</option>;
      })}
    </select>
  </label>
);
