import { describe, expect, it } from 'vitest';
import type { PlanTask } from '@evolve/core';
import { CircularDependencyError, InvalidDependencyError } from './errors.js';
import { DirectedAcyclicGraph } from './graph.js';

function makeTask(id: string, dependencies: string[] = []): PlanTask {
  return {
    id,
    title: `Task ${id}`,
    description: `Description of ${id}`,
    objective: `Objective of ${id}`,
    status: 'pending',
    estimatedComplexity: 'medium',
    estimatedRisk: 'low',
    relevantFiles: [],
    expectedChanges: [],
    dependencies,
    verificationSteps: [],
    potentialRisks: [],
    affectedComponents: [],
    breakingChange: false,
  };
}

describe('DirectedAcyclicGraph', () => {
  it('constructs graph and calculates topological order for a linear chain', () => {
    const tasks = [
      makeTask('task_3', ['task_2']),
      makeTask('task_1'),
      makeTask('task_2', ['task_1']),
    ];

    const dag = new DirectedAcyclicGraph(tasks);
    expect(dag.hasCycle()).toBe(false);

    const order = dag.getTopologicalOrder();
    expect(order).toEqual(['task_1', 'task_2', 'task_3']);
  });

  it('calculates topological order and parallel stages for branched dependencies', () => {
    // 1 -> 2 -> 4
    // 1 -> 3 -> 4
    const tasks = [
      makeTask('task_1'),
      makeTask('task_2', ['task_1']),
      makeTask('task_3', ['task_1']),
      makeTask('task_4', ['task_2', 'task_3']),
    ];

    const dag = new DirectedAcyclicGraph(tasks);
    const order = dag.getTopologicalOrder();

    expect(order[0]).toBe('task_1');
    expect(order[3]).toBe('task_4');
    expect(order.indexOf('task_2')).toBeLessThan(order.indexOf('task_4'));
    expect(order.indexOf('task_3')).toBeLessThan(order.indexOf('task_4'));

    const stages = dag.getParallelStages();
    expect(stages.length).toBe(3);
    expect(stages[0]).toEqual(['task_1']);
    expect(stages[1]?.sort()).toEqual(['task_2', 'task_3']);
    expect(stages[2]).toEqual(['task_4']);
  });

  it('detects a direct cycle (A -> B -> A)', () => {
    const tasks = [makeTask('task_A', ['task_B']), makeTask('task_B', ['task_A'])];

    const dag = new DirectedAcyclicGraph(tasks);
    expect(dag.hasCycle()).toBe(true);

    const cycle = dag.findCycle();
    expect(cycle).toBeDefined();
    expect(cycle?.length).toBeGreaterThanOrEqual(3);
    expect(cycle?.[0]).toBe(cycle?.[cycle.length - 1]);

    expect(() => dag.getTopologicalOrder()).toThrow(CircularDependencyError);
  });

  it('detects an indirect cycle (A -> B -> C -> A)', () => {
    const tasks = [
      makeTask('task_A', ['task_C']),
      makeTask('task_B', ['task_A']),
      makeTask('task_C', ['task_B']),
    ];

    const dag = new DirectedAcyclicGraph(tasks);
    expect(dag.hasCycle()).toBe(true);

    const validation = dag.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('Circular dependency detected');

    expect(() => dag.getTopologicalOrder()).toThrow(CircularDependencyError);
  });

  it('rejects self-dependencies', () => {
    const dag = new DirectedAcyclicGraph();
    expect(() => dag.addDependency('task_1', 'task_1')).toThrow(InvalidDependencyError);
  });

  it('flags missing prerequisite tasks during validation', () => {
    const tasks = [makeTask('task_1', ['task_ghost'])];

    const dag = new DirectedAcyclicGraph(tasks);
    const validation = dag.validate();
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain(
      'Task "task_1" depends on missing prerequisite task "task_ghost"',
    );
  });
});

