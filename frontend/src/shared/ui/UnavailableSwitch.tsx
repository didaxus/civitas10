import { Popover } from "./Popover";
import { Switch } from "./Switch";
export const UnavailableSwitch = ({ label }: { label: string }) => <Popover label={`${label} availability`} trigger={<Switch checked={false} label={`${label}. Not available`} visualState="locked" />}><p>Contact support to make this capability available for your organization.</p></Popover>;
