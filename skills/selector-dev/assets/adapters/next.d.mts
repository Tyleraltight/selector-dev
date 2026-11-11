export interface SelectorNextOptions {
  root?: string;
  prefix?: string;
  basePath?: string;
  toggleShortcut?: string;
  startDormant?: boolean;
  assetsDir?: string;
  allowNonDev?: boolean;
}

export function createNextAppHandler(
  options?: SelectorNextOptions
): (request: Request) => Promise<Response>;

export function createNextPagesHandler(
  options?: SelectorNextOptions
): (req: any, res: any) => Promise<void> | void;

export function getBootstrapSrc(options?: Pick<SelectorNextOptions, "basePath" | "prefix">): string;

declare const nextAdapter: {
  createNextAppHandler: typeof createNextAppHandler;
  createNextPagesHandler: typeof createNextPagesHandler;
  getBootstrapSrc: typeof getBootstrapSrc;
};
export default nextAdapter;
