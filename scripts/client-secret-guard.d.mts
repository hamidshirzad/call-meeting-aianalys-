export const serverCredentialNames: string[];
export const forbiddenBrowserAliases: string[];

export interface ClientSecretFinding {
  file: string;
  finding: string;
}

export function findForbiddenClientSecretReferences(source: string): string[];
export function scanClientSources(): ClientSecretFinding[];
