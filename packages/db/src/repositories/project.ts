import { eq } from 'drizzle-orm';
import type { EvolveDatabase } from '../connection.js';
import { projects, type NewProject, type Project } from '../schema/index.js';

export class ProjectRepository {
  constructor(private readonly db: EvolveDatabase) {}

  public create(data: NewProject): Project {
    const created = this.db.insert(projects).values(data).returning().get();
    if (!created) {
      throw new Error('Failed to insert project');
    }
    return created;
  }

  public findById(id: string): Project | undefined {
    return this.db.select().from(projects).where(eq(projects.id, id)).get();
  }

  public findByPath(path: string): Project | undefined {
    return this.db.select().from(projects).where(eq(projects.path, path)).get();
  }

  public list(): Project[] {
    return this.db.select().from(projects).all();
  }
}
