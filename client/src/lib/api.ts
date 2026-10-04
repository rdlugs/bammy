export type FieldErrors = Record<string, string[] | undefined>

export class ApiError extends Error {
  status: number
  fieldErrors?: FieldErrors

  constructor(status: number, message: string, fieldErrors?: FieldErrors) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  })

  if (res.status === 204) {
    return undefined as T
  }

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, body.message ?? "Something went wrong", body.errors)
  }
  return body as T
}
