// Where a map's base image sits in the viewer's world (N10-P0). Pure.
//   baseFrame(extent)        -> { x: 0, y: 0, width: 1, aspect }   the frame every base (and every period variant of it) is placed in
//   aspectDrift(extent, px)  -> relative difference between the view's extent ratio and the image's pixel ratio (0 = same shape)
// The frame comes from the view (view.extent_m = [width, height] in metres): the image is always one world unit wide, so markers,
// routes and zoom limits that are fractions of the view never depend on how many pixels a period's DZI happens to have.
// No usable extent (an image-only map): the frame is still one unit wide and the image's own shape decides the height.
const ok = n => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function baseFrame(extent) {
  const aspect = Array.isArray(extent) && ok(extent[0]) && ok(extent[1]) ? extent[1] / extent[0] : 0;
  return { x: 0, y: 0, width: 1, aspect };
}

export function aspectDrift(extent, px) {
  if (!Array.isArray(extent) || !Array.isArray(px) || !ok(extent[0]) || !ok(extent[1]) || !ok(px[0]) || !ok(px[1])) return 0;
  const a = extent[1] / extent[0], b = px[1] / px[0];
  return Math.abs(a - b) / a;
}
