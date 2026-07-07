import { afterEach, expect, test, vi } from 'vitest'
import {
  completeOnboarding, fetchMe, fetchReflections, postAnswer, resolveReflection,
} from './api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

test('fetchMe returns the /me payload', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
    email: 'a@bumg.de', display_name: 'Anna Muster', onboarded: false,
  }))
  vi.stubGlobal('fetch', fetchMock)
  const me = await fetchMe()
  expect(fetchMock).toHaveBeenCalledWith('/me')
  expect(me.display_name).toBe('Anna Muster')
  expect(me.onboarded).toBe(false)
})

test('fetchReflections unwraps the reflections array', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
    reflections: [{ id: 'r1', text: 'Du hast montags viele Meetings.' }],
  })))
  expect(await fetchReflections()).toEqual([{ id: 'r1', text: 'Du hast montags viele Meetings.' }])
})

test('postAnswer POSTs key/value as JSON', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
  vi.stubGlobal('fetch', fetchMock)
  await postAnswer('coaching_style', 'Ausgewogen')
  expect(fetchMock).toHaveBeenCalledWith('/onboarding/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'coaching_style', value: 'Ausgewogen' }),
  })
})

test('resolveReflection includes text only when provided', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
  vi.stubGlobal('fetch', fetchMock)
  await resolveReflection('r1', 'confirm')
  expect(fetchMock).toHaveBeenLastCalledWith('/onboarding/reflections/r1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm' }),
  })
  await resolveReflection('r1', 'confirm', 'Korrigierter Text.')
  expect(fetchMock).toHaveBeenLastCalledWith('/onboarding/reflections/r1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm', text: 'Korrigierter Text.' }),
  })
})

test('completeOnboarding POSTs with no body', async () => {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
  vi.stubGlobal('fetch', fetchMock)
  await completeOnboarding()
  expect(fetchMock).toHaveBeenCalledWith('/onboarding/complete', { method: 'POST' })
})

test('non-2xx surfaces the backend detail message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Kaputt' }, 500)))
  await expect(postAnswer('goals', 'x')).rejects.toThrow('Kaputt')
})

test('non-2xx without JSON body falls back to HTTP status', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })))
  await expect(completeOnboarding()).rejects.toThrow('HTTP 502')
})
