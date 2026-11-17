import type { PlanTask } from '@evolve/core';
import { CircularDependencyError, InvalidDependencyError } from './errors.js';

export interface DAGValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Directed Acyclic Graph (DAG) for managing task execution dependencies.
 *
 * Edge definition: A directed edge from `fromTaskId` to `toTaskId` means:
 * `toTaskId` DEPENDS ON `fromTaskId` (fromTaskId must complete before toTaskId).
 */
export class DirectedAcyclicGraph {
  private readonly nodes = new Map<string, PlanTask>();
  private readonly incoming = new Map<string, Set<string>>(); // taskId -> prerequisites it depends on
  private readonly outgoing = new Map<string, Set<string>>(); // taskId -> dependents that require it

  constructor(tasks: readonly PlanTask[] = []) {
    for (const task of tasks) {
      this.addTask(task);
    }
  }

  public addTask(task: PlanTask): void {
    this.nodes.set(task.id, task);

    if (!this.incoming.has(task.id)) {
      this.incoming.set(task.id, new Set());
    }
    if (!this.outgoing.has(task.id)) {
      this.outgoing.set(task.id, new Set());
    }

    // Register dependencies defined in task
    if (task.dependencies && Array.isArray(task.dependencies)) {
      for (const depId of task.dependencies) {
        this.addDependency(depId, task.id);
      }
    }
  }

  public addDependency(fromTaskId: string, toTaskId: string): void {
    if (!fromTaskId || !toTaskId) {
      throw new InvalidDependencyError('Dependency task IDs must be non-empty strings');
    }

    if (fromTaskId === toTaskId) {
      throw new InvalidDependencyError(
        `Task "${toTaskId}" cannot depend on itself (self-dependency detected)`,
      );
    }

    if (!this.incoming.has(toTaskId)) {
      this.incoming.set(toTaskId, new Set());
    }
    if (!this.outgoing.has(fromTaskId)) {
      this.outgoing.set(fromTaskId, new Set());
    }

    this.incoming.get(toTaskId)!.add(fromTaskId);
    this.outgoing.get(fromTaskId)!.add(toTaskId);
  }

  public getTask(id: string): PlanTask | undefined {
    return this.nodes.get(id);
  }

  public getTasks(): PlanTask[] {
    return Array.from(this.nodes.values());
  }

  public getPrerequisites(taskId: string): string[] {
    return Array.from(this.incoming.get(taskId) ?? []);
  }

  public getDependents(taskId: string): string[] {
    return Array.from(this.outgoing.get(taskId) ?? []);
  }

  /**
   * Validates the graph for unknown references, self-loops, and cycles.
   */
  public validate(): DAGValidationResult {
    const errors: string[] = [];

    // Check for referenced dependencies that do not exist as tasks
    for (const [taskId, prereqs] of this.incoming.entries()) {
      if (!this.nodes.has(taskId)) {
        errors.push(`Target task "${taskId}" is not defined in the plan`);
      }
      for (const prereqId of prereqs) {
        if (!this.nodes.has(prereqId)) {
          errors.push(
            `Task "${taskId}" depends on missing prerequisite task "${prereqId}"`,
          );
        }
      }
    }

    // Check for cycles
    const cycle = this.findCycle();
    if (cycle) {
      errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Checks whether the graph has any circular dependencies.
   */
  public hasCycle(): boolean {
    return this.findCycle() !== null;
  }

  /**
   * Detects and returns the exact cycle path if a circular dependency exists.
   * Uses depth-first search with recursion stack tracking.
   */
  public findCycle(): string[] | null {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const parent = new Map<string, string>();

    for (const startNode of this.nodes.keys()) {
      if (!visited.has(startNode)) {
        const cycle = this.dfsFindCycle(startNode, visited, recStack, parent);
        if (cycle) {
          return cycle;
        }
      }
    }

    return null;
  }

  private dfsFindCycle(
    node: string,
    visited: Set<string>,
    recStack: Set<string>,
    parent: Map<string, string>,
  ): string[] | null {
    visited.add(node);
    recStack.add(node);

    const neighbors = this.outgoing.get(node) ?? new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        parent.set(neighbor, node);
        const cycle = this.dfsFindCycle(neighbor, visited, recStack, parent);
        if (cycle) return cycle;
      } else if (recStack.has(neighbor)) {
        // Cycle detected: reconstruct path from neighbor to node and back
        const path = [neighbor];
        let curr = node;
        while (curr !== neighbor && curr) {
          path.unshift(curr);
          curr = parent.get(curr) || '';
        }
        path.unshift(neighbor);
        return path;
      }
    }

    recStack.delete(node);
    return null;
  }

  /**
   * Computes a valid linear topological execution order using Kahn's algorithm.
   * Throws CircularDependencyError if the graph has a cycle.
   */
  public getTopologicalOrder(): string[] {
    const validation = this.validate();
    if (!validation.valid) {
      const cycle = this.findCycle();
      if (cycle) {
        throw new CircularDependencyError(
          `Cannot determine execution order: cycle detected (${cycle.join(' -> ')})`,
          cycle,
        );
      }
      throw new InvalidDependencyError(
        `Invalid dependency references: ${validation.errors.join('; ')}`,
      );
    }

    // In-degree map: count of prerequisites each node is waiting on
    const inDegree = new Map<string, number>();
    for (const taskId of this.nodes.keys()) {
      const prereqs = this.incoming.get(taskId) ?? new Set();
      inDegree.set(taskId, prereqs.size);
    }

    // Queue of nodes with zero unsatisfied prerequisites
    const queue: string[] = [];
    for (const [taskId, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(taskId);
      }
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      const dependents = this.outgoing.get(current) ?? new Set();
      for (const depId of dependents) {
        const newDeg = (inDegree.get(depId) ?? 1) - 1;
        inDegree.set(depId, newDeg);
        if (newDeg === 0) {
          queue.push(depId);
        }
      }
    }

    if (order.length !== this.nodes.size) {
      const cycle = this.findCycle() ?? [];
      throw new CircularDependencyError('Graph contains circular dependencies', cycle);
    }

    return order;
  }

  /**
   * Groups independent tasks into parallel execution stages / waves.
   * Stage 0: Tasks with no prerequisites.
   * Stage 1: Tasks whose prerequisites are all satisfied by Stage 0.
   * Stage N: Tasks whose prerequisites are all satisfied by Stages < N.
   */
  public getParallelStages(): string[][] {
    const topoOrder = this.getTopologicalOrder();
    if (topoOrder.length === 0) return [];

    const taskStage = new Map<string, number>();
    const stages: string[][] = [];

    for (const taskId of topoOrder) {
      const prereqs = this.incoming.get(taskId) ?? new Set();
      let maxPrereqStage = -1;
      for (const p of prereqs) {
        const stage = taskStage.get(p) ?? 0;
        if (stage > maxPrereqStage) {
          maxPrereqStage = stage;
        }
      }

      const assignedStage = maxPrereqStage + 1;
      taskStage.set(taskId, assignedStage);

      if (!stages[assignedStage]) {
        stages[assignedStage] = [];
      }
      stages[assignedStage]!.push(taskId);
    }

    return stages;
  }
}
