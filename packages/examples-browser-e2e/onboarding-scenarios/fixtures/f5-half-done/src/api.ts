// Same-origin reads the onboarding skill will list when runtime caching is requested.
export async function loadCatalog(): Promise<unknown> {
  return (await fetch("/api/catalog")).json();
}

export async function loadProfile(): Promise<unknown> {
  return (await fetch("/api/me")).json();
}
