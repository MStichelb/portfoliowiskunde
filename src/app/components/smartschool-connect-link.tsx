import { Link2 } from "lucide-react";

export function SmartschoolConnectLink() {
  // OAuth initiation must remain a full browser navigation to the external provider.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a className="secondary-button link-button connection-action" href="/api/auth/smartschool/link"><Link2 size={17} aria-hidden />Smartschool koppelen</a>;
}
