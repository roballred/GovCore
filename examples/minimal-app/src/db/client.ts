import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { __client?: ReturnType<typeof postgres> }

const client = globalForDb.__client ?? postgres(process.env.DATABASE_URL!, { max: 5 })
globalForDb.__client = client

export const db = drizzle(client, { schema })
