declare module 'pal/screen-adapter/web' {
  export const screenAdapter: {
    bindHost(host: { container: HTMLDivElement; frame: HTMLDivElement }): void;
  };
}
