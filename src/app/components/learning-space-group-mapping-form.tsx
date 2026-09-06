"use client";

import { useState } from "react";

import type { KnownExternalGroup } from "@/lib/user-management";

interface LearningSpaceGroupMappingFormProps {
  learningSpaceId: string;
  label: string;
  groups: KnownExternalGroup[];
  action: (formData: FormData) => void | Promise<void>;
}

export function LearningSpaceGroupMappingForm({
  learningSpaceId,
  label,
  groups,
  action,
}: LearningSpaceGroupMappingFormProps) {
  const [selectedGroupId, setSelectedGroupId] = useState("");

  return <form action={action} className="management-add-form learning-space-group-form">
    <input type="hidden" name="learningSpaceId" value={learningSpaceId} />
    <label>{label}<select
      name="externalGroupId"
      required
      value={selectedGroupId}
      disabled={groups.length === 0}
      onChange={(event) => setSelectedGroupId(event.target.value)}
    ><option value="" disabled>{groups.length ? `Kies ${label.toLowerCase()}` : `Geen beschikbare ${label.toLowerCase()}en`}</option>{groups.map((group) => <option key={group.externalGroupId} value={group.externalGroupId}>{group.externalGroupName ?? group.externalGroupId}</option>)}</select></label>
    <button className="secondary-button" type="submit" disabled={!selectedGroupId}>Koppelen</button>
  </form>;
}
