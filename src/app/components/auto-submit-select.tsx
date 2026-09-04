"use client";

export interface SelectOption {
  value: string;
  label: string;
}

export function AutoSubmitSelect({
  action,
  fields,
  name,
  value,
  options,
  ariaLabel,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  name: string;
  value: string;
  options: SelectOption[];
  ariaLabel: string;
  className?: string;
}) {
  return <form action={action} className={className ?? "autosave-form"}>
    {Object.entries(fields).map(([field, fieldValue]) => <input key={field} type="hidden" name={field} value={fieldValue} />)}
    <select name={name} defaultValue={value} aria-label={ariaLabel} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </form>;
}
