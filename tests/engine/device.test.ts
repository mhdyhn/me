import { describe, expect, it } from 'vitest';
import { deviceProblem, hasWebGL } from '../../src/engine';

describe('device capability', () => {
  it('finds a WebGL context type on the scope', () => {
    expect(hasWebGL({ WebGLRenderingContext: function () {} })).toBe(true);
    expect(hasWebGL({ WebGL2RenderingContext: function () {} })).toBe(true);
  });
  it('reports a device with no WebGL as unsupported, with both languages', () => {
    expect(hasWebGL({})).toBe(false);
    const problem = deviceProblem({});
    expect(problem?.code).toBe('unsupported-device');
    expect(problem?.message.fa.length).toBeGreaterThan(0);
  });
  it('returns no problem when WebGL is present', () => {
    expect(deviceProblem({ WebGLRenderingContext: function () {} })).toBeNull();
  });
});
