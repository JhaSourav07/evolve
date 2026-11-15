import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const modelVersions = sqliteTable('model_versions', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(), // 'ollama', 'custom'
  name: text('name').notNull(), // 'qwen2.5-coder:7b'
  parameterSize: text('parameter_size'),
  isActive: integer('is_active').notNull().default(1),
  installedAt: integer('installed_at').notNull(),
});

export type ModelVersionRecord = typeof modelVersions.$inferSelect;
export type NewModelVersionRecord = typeof modelVersions.$inferInsert;
