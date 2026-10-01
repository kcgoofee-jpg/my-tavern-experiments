// Shared fixtures of the pack-picture tests (K-R100 .. K-R102): a tiny made-up pack and a one-pixel PNG as a data URL.
export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
export const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
export const dataUrl = bytes => 'data:image/png;base64,' + Buffer.alloc(bytes, 1).toString('base64');
export const base = () => ({
  id: 'tide', schema: 2, title: 'Tide', lang: 'en',
  nodes: [{ id: 'root', name: 'Tide' }, { id: 'alpha', name: 'Alpha', parent: 'root', at: { x: 0.2, y: 0.2, view: 'v' } }, { id: 'beta', name: 'Beta', parent: 'alpha' }, { id: 'gamma', name: 'Gamma', parent: 'root', at: { x: 0.7, y: 0.6, view: 'v' } }],
  views: { v: { kind: 'image', src: 'v.png' }, root: { kind: 'schematic' } }, ui: { start: 'root' },
});
