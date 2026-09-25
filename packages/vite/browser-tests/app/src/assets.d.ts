// Style imports in the fixture application. Vite turns them into a CSS asset and the import itself has no value;
// declaring the module here keeps the app's own tsconfig free of Vite's global client types, which would pull in
// far more ambient declarations than a fixture needs.
declare module "*.css" {
  const stylesheet: string;
  export default stylesheet;
}
