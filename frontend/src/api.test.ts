import { afterEach, expect, test, vi } from 'vitest'
import { completeTask, getMe, invokeAction } from './api'

afterEach(() => vi.unstubAllGlobals())

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('invokeAction POSTs JSON to /actions/{name}', async () => {
  const fetchMock = vi.fn().mockResolvedValue(okResponse([{ id: '1' }]))
  vi.stubGlobal('fetch', fetchMock)
  const result = await invokeAction<{ id: string }[]>('list_tasks')
  expect(fetchMock).toHaveBeenCalledWith('/actions/list_tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  expect(result).toEqual([{ id: '1' }])
})

test('completeTask sends the task_id payload', async () => {
  const fetchMock = vi.fn().mockResolvedValue(okResponse({ id: 'x', state: 'done', changed: true }))
  vi.stubGlobal('fetch', fetchMock)
  await completeTask('abc-123')
  expect(fetchMock).toHaveBeenCalledWith('/actions/complete_task', expect.objectContaining({
    body: JSON.stringify({ task_id: 'abc-123' }),
  }))
})

test('errors surface the backend detail message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ detail: 'unknown action: nope' }), { status: 404 }),
  ))
  await expect(getMe()).rejects.toThrow('unknown action: nope')
})
