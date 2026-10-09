import { MutationFeedbackForm } from "@/app/components/mutation-feedback-form";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";

export function OrderControls({ action, fields, canMoveUp, canMoveDown, itemLabel }: {
  action: (formData: FormData) => unknown | Promise<unknown>;
  fields: Record<string, string>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  itemLabel: string;
}) {
  return <div className="order-controls">
    <OrderButton action={action} fields={fields} direction="up" disabled={!canMoveUp} label={`${itemLabel} omhoog verplaatsen`} icon={<ArrowUp size={16} aria-hidden />} />
    <OrderButton action={action} fields={fields} direction="down" disabled={!canMoveDown} label={`${itemLabel} omlaag verplaatsen`} icon={<ArrowDown size={16} aria-hidden />} />
  </div>;
}

function OrderButton({ action, fields, direction, disabled, label, icon }: {
  action: (formData: FormData) => unknown | Promise<unknown>;
  fields: Record<string, string>;
  direction: "up" | "down";
  disabled: boolean;
  label: string;
  icon: ReactNode;
}) {
  return <MutationFeedbackForm action={action} errorMessage="De wijziging kon niet worden opgeslagen. Probeer opnieuw.">
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <input type="hidden" name="direction" value={direction} />
    <button className="icon-button" type="submit" disabled={disabled} aria-label={label} title={label}>{icon}</button>
  </MutationFeedbackForm>;
}
