import { Popover } from "./Popover";
import { Switch } from "./Switch";
export const UnavailableSwitch = ({ label, message }: { label: string; message: string }) => <Popover label={`${label} availability`} trigger={<Switch checked={false} label={`${label}. Not available`} visualState="locked" />}><p>{message}</p></Popover>;
