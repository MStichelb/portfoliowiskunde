"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "primary-button", pendingLabel = "Bezig...", name, value, disabled = false, title }: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending || disabled} title={title} name={name} value={value}>{pending ? pendingLabel : children}</button>;
}
