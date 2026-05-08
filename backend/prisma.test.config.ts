import { defineConfig } from 'prisma/config';

const dbPath = process.env.DATABASE_URL ?? 'file:db.sqlite';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: dbPath,
  },
});
