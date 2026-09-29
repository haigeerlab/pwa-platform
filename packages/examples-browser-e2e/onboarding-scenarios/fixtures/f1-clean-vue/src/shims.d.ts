// Lets tsc resolve `./App.vue`; a real project gets this from its Vue tooling.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
