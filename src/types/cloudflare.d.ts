interface D1Result<T = unknown> {
  results?: T[]
  success: boolean
  meta: {
    last_row_id?: number
  }
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
}

type PagesFunction<Env = unknown> = (context: {
  request: Request
  env: Env
  params: Record<string, string | string[]>
  waitUntil: (promise: Promise<unknown>) => void
  next: () => Promise<Response>
  data: Record<string, unknown>
}) => Response | Promise<Response>
