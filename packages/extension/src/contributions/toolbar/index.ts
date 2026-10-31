import { createApp, type App } from 'vue';
import Toolbar from './super-preview-toolbar.vue';
import toolbarStyle from './toolbar.css?inline';

interface ToolbarContext {
  $: { root: HTMLElement };
  app?: App;
}

export const style = toolbarStyle;
export const template = '<div id="super-preview-root"></div>';
export const $ = { root: '#super-preview-root' };

export function ready(this: ToolbarContext) {
  this.app = createApp(Toolbar);
  this.app.mount(this.$.root);
}

export function close(this: ToolbarContext) {
  this.app?.unmount();
  this.app = undefined;
}
