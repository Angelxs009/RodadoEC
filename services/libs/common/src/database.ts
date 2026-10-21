import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from 'pg';

function sslOption() {
  const on = /^(1|true)$/i.test(process.env.DATABASE_SSL ?? '') || process.env.NODE_ENV === 'production';
  return on ? { rejectUnauthorized: false } : false;
}

/**
 * Cada microservicio es dueño de su propio schema de Postgres (aislamiento de datos: ningún servicio
 * lee las tablas de otro; se hablan por gRPC). Una sola base permite usar el plan gratis de Render.
 */
export async function ensureSchema(schema: string): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL no está definida');
  const client = new Client({ connectionString: url, ssl: sslOption() });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await client.end();
  }
}

export function databaseModule(schema: string, entities: Function[]) {
  return TypeOrmModule.forRoot({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    schema,
    entities,
    synchronize: true, // prototipo académico: sin migraciones
    ssl: sslOption(),
    retryAttempts: 10,
    retryDelay: 3000,
  });
}
