import type { NormalizedExternalIdentity, NormalizedGroupMembership } from "@/lib/identity";

export interface ExternalAuthenticationResult {
  identity: NormalizedExternalIdentity;
  groups: NormalizedGroupMembership[];
}

export interface ExternalAuthProvider<TCallbackInput = unknown> {
  readonly id: string;
  authenticate(callbackInput: TCallbackInput): Promise<ExternalAuthenticationResult>;
}
