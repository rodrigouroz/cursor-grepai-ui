export type OpenMode = "preview" | "active" | "beside";

export interface OpenOptions {
  preview: boolean;
  beside: boolean;
}

export function resolveOpenOptions(mode: string | undefined): OpenOptions {
  if (mode === "active") return { preview: false, beside: false };
  if (mode === "beside") return { preview: false, beside: true };
  return { preview: true, beside: false };
}
