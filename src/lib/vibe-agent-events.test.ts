import { describe, it, expect } from 'vitest';
import { topologicalSort } from './vibe-agent-events';

describe('vibe-agent-events', () => {
  it('topologicalSort orders tasks by dependencies', () => {
    const tasks = [
      { id: 'a', label: 'A', dependsOn: ['c'] },
      { id: 'b', label: 'B', dependsOn: [] },
      { id: 'c', label: 'C', dependsOn: [] },
    ];

    const sorted = topologicalSort(tasks);

    expect(sorted.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('topologicalSort handles independent tasks', () => {
    const tasks = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];

    const sorted = topologicalSort(tasks);

    expect(sorted.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});