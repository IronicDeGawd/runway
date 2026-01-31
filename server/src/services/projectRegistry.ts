import { ProjectConfig } from '@runway/shared';
import { projectRepository } from '../repositories';

export class ProjectRegistry {
  async getAll(): Promise<ProjectConfig[]> {
    return projectRepository.getAll();
  }

  async getById(id: string): Promise<ProjectConfig | undefined> {
    return projectRepository.getById(id);
  }

  async getByName(name: string): Promise<ProjectConfig | undefined> {
    return projectRepository.getByName(name);
  }

  async create(project: ProjectConfig): Promise<void> {
    projectRepository.create(project);
  }

  async update(id: string, updates: Partial<ProjectConfig>): Promise<void> {
    projectRepository.update(id, updates);
  }

  async delete(id: string): Promise<void> {
    projectRepository.delete(id);
  }
}

export const projectRegistry = new ProjectRegistry();
