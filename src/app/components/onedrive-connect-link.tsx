import { Key } from "lucide-react";

export function OneDriveConnectLink({ authorized }: { authorized: boolean }) {
  // OAuth initiation is a browser navigation because Microsoft is an external redirect target.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  return <a className="secondary-button link-button connection-action" href="/api/onedrive/connect"><Key size={17} aria-hidden />{authorized ? "OneDrive opnieuw verbinden" : "OneDrive verbinden"}</a>;
}
