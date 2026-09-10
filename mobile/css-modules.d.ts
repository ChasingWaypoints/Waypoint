// Side-effect CSS imports (global.css, mapbox-gl.css) carry no types of their
// own. Without this the typecheck fails on files that are otherwise fine.
declare module "*.css";
