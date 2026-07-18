// Fontsource packages ship CSS only (no JS/type entry), so bare side-effect
// imports need an ambient declaration for `tsc -b` to resolve them.
declare module '@fontsource/*';
declare module '@fontsource-variable/*';
