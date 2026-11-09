// Registry of object types. Each type says which layer it lives on, what geometry
// it uses, its defaults and its properties-panel fields. New tools add entries here.

export const TYPES = {
  'site.property': {
    label: 'Property line', layer: 'site', kind: 'polygon',
    defaults: { showLengths: true },
    fields: [{ key: 'showLengths', label: 'Show edge lengths', type: 'checkbox' }],
  },
  'site.house': {
    label: 'House', layer: 'site', kind: 'polygon',
    defaults: { label: 'House', showArea: true },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'showArea', label: 'Show area', type: 'checkbox' },
      { key: 'showLengths', label: 'Show wall lengths', type: 'checkbox' },
    ],
  },
  'site.structure': {
    label: 'Other building', layer: 'site', kind: 'polygon',
    defaults: { label: 'Shed', showArea: false },
    fields: [
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'showArea', label: 'Show area', type: 'checkbox' },
      { key: 'showLengths', label: 'Show wall lengths', type: 'checkbox' },
    ],
  },
  'site.driveway': {
    label: 'Driveway', layer: 'site', kind: 'polygon',
    defaults: { material: 'concrete', label: '' },
    fields: [
      { key: 'material', label: 'Surface', type: 'material' },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'showArea', label: 'Show area', type: 'checkbox' },
    ],
  },
  'site.patio': {
    label: 'Patio / walk', layer: 'site', kind: 'polygon',
    defaults: { material: 'pavers:tan', label: '' },
    fields: [
      { key: 'material', label: 'Surface', type: 'material' },
      { key: 'label', label: 'Label', type: 'text' },
      { key: 'showArea', label: 'Show area', type: 'checkbox' },
    ],
  },
  'site.tree': {
    label: 'Existing tree', layer: 'site', kind: 'circle',
    defaults: { form: 'canopy', color: '#6f8f4e', label: '' },
    fields: [
      { key: 'diameter', label: 'Canopy diameter', type: 'length' },
      { key: 'form', label: 'Form', type: 'treeForm' },
      { key: 'color', label: 'Color', type: 'treeColor' },
      { key: 'label', label: 'Name / species', type: 'text' },
    ],
  },
  'notes.dimension': {
    label: 'Dimension', layer: 'notes', kind: 'dimension',
    defaults: {},
    fields: [],
  },
};

export const STATUSES = [
  { id: 'existing', label: 'Existing' },
  { id: 'proposed', label: 'Proposed' },
  { id: 'remove', label: 'Remove' },
];

// Points that define an object (used for snapping, moving, bounds)
export function objectPoints(o) {
  const g = o.geometry;
  if (g.kind === 'polygon' || g.kind === 'polyline') return g.points;
  if (g.kind === 'circle') return [g.center];
  if (g.kind === 'dimension') return [g.a, g.b];
  return [];
}

export function objectBoundsPts(o) {
  const g = o.geometry;
  if (g.kind === 'circle') {
    const [x, y] = g.center;
    return [[x - g.r, y - g.r], [x + g.r, y + g.r]];
  }
  return objectPoints(o);
}

export function translateObject(o, dx, dy) {
  const g = o.geometry;
  const mv = (p) => [p[0] + dx, p[1] + dy];
  if (g.points) g.points = g.points.map(mv);
  if (g.center) g.center = mv(g.center);
  if (g.a) g.a = mv(g.a);
  if (g.b) g.b = mv(g.b);
}
