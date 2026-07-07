// Onboarding API client. This file DEFINES the backend contract — the backend
// endpoints (except /me) are implemented in the "Make it actually run" branch.
//
//   GET  /me                          → { email, display_name, onboarded?: boolean, ... }
//   GET  /onboarding/reflections      → { reflections: [{ id, text }] }
//   POST /onboarding/answers          ← { key, value }
//   POST /onboarding/reflections/{id} ← { action: 'confirm' | 'dismiss', text? }  (edit = confirm + text)
//   POST /onboarding/complete         ← (empty)

export interface Me {
  email: string
  display_name: string
  onboarded?: boolean
}

export interface Reflection {
  id: string
  text: string
}

async function ensureOk(res: Response): Promise<Response> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export async function fetchMe(): Promise<Me> {
  const res = await ensureOk(await fetch('/me'))
  return await res.json() as Me
}

export async function fetchReflections(): Promise<Reflection[]> {
  const res = await ensureOk(await fetch('/onboarding/reflections'))
  const data = await res.json() as { reflections: Reflection[] }
  return data.reflections
}

export async function postAnswer(key: string, value: string): Promise<void> {
  await ensureOk(await fetch('/onboarding/answers', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ key, value }),
  }))
}

export async function resolveReflection(
  id: string, action: 'confirm' | 'dismiss', text?: string,
): Promise<void> {
  await ensureOk(await fetch(`/onboarding/reflections/${id}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(text === undefined ? { action } : { action, text }),
  }))
}

export async function completeOnboarding(): Promise<void> {
  await ensureOk(await fetch('/onboarding/complete', { method: 'POST' }))
}
