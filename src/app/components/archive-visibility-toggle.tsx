import Link from "next/link";

export function ArchiveVisibilityToggle({ href, checked }: { href: string; checked: boolean }) {
  return <Link className={`editor-permissions-toggle admin-overview-switch source-profile-archive-toggle${checked ? " is-enabled" : ""}`} href={href} role="switch" aria-checked={checked}>
    <span className="editor-permissions-track" aria-hidden><span /></span>
    <span>Toon archief</span>
  </Link>;
}
