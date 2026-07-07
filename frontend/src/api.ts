// frontend/src/api.ts — the one thin, typed layer over the backend. Every
// component fetches through here so URL/error handling lives in ONE place.

export interface Me {
  email: string
  display_name: string
  environment: string
  warm_start_scan_mode: string
  onboarded: boolean
}

export interface Task {
  id: string
  title: string
  note: string | null
  due_at: string | null
  state: string | null
  overdue: boolean
}

export interface ProposedMemory {
  id: string
  type: string
  title: string
  note: string | null
  confidence: number
  source: string
  created_at: string
}

export interface HistoryMessage {
  role: 'user' | 'assistant' | 'briefing'
  content: string
  created_at: string
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function getMe(): Promise<Me> {
  return asJson<Me>(await fetch('/me'))
}

export async function getHistory(): Promise<HistoryMessage[]> {
  const data = await asJson<{ messages: HistoryMessage[] }>(await fetch('/chat/history'))
  return data.messages
}

// Every action goes through the registry's single dispatcher: POST /actions/{name}.
export async function invokeAction<T>(name: string, payload: object = {}): Promise<T> {
  return asJson<T>(await fetch(`/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))
}

export const listTasks = () => invokeAction<Task[]>('list_tasks')

export const completeTask = (taskId: string) =>
  invokeAction<{ id: string; state: string; changed: boolean }>('complete_task', { task_id: taskId })

export const listProposedMemories = () => invokeAction<ProposedMemory[]>('list_proposed_memories')

export const confirmMemory = (memoryId: string) =>
  invokeAction<{ id: string; status: string; changed: boolean }>('confirm_memory', { memory_id: memoryId })

export const rejectMemory = (memoryId: string) =>
  invokeAction<{ id: string; status: string; changed: boolean }>('reject_memory', { memory_id: memoryId })
