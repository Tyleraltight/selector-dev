export interface SelectorVitePluginOptions {
  root?: string;
  prefix?: string;
  toggleShortcut?: string;
  startDormant?: boolean;
  assetsDir?: string;
}

export function selectorDevPlugin(options?: SelectorVitePluginOptions): any;
export default selectorDevPlugin;
