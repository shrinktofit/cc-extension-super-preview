interface ToolbarElements {
  open: HTMLElement;
  root: HTMLElement;
}

interface ToolbarContext {
  $: ToolbarElements;
  onDoubleClick?: EventListener;
  onOpen?: EventListener;
}

export const style = `
:host {
  display: flex;
  overflow: visible;
}

.super-preview-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  width: 24px;
  height: 22px;
  margin-left: 8px;
  overflow: visible;
}

.super-preview-open {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  min-width: 24px;
  height: 22px;
  padding: 0;
}

.super-preview-footnote {
  position: absolute;
  top: calc(100% + 1px);
  left: 50%;
  transform: translateX(-50%);
  color: var(--color-info-fill);
  font-size: 5px;
  font-weight: 700;
  line-height: 5px;
  letter-spacing: 0.25px;
  white-space: nowrap;
  pointer-events: none;
}
`;

export const template = `
<div class="super-preview-toolbar">
  <ui-button
    class="super-preview-open transparent"
    tooltip="Super Preview"
    aria-label="Super Preview"
  >
    <ui-icon value="play"></ui-icon>
  </ui-button>
  <span class="super-preview-footnote">SUPER</span>
</div>
`;

export const $ = {
  open: '.super-preview-open',
  root: '.super-preview-toolbar',
};

export function ready(this: ToolbarContext) {
  const openButton = this.$.open;
  let opening = false;

  this.onDoubleClick = (event) => {
    event.stopPropagation();
  };
  this.onOpen = () => {
    if (opening) {
      return;
    }

    opening = true;
    openButton.setAttribute('disabled', '');
    void Editor.Message.request('super-preview', 'open')
      .catch((error: unknown) => {
        console.error('[Super Preview] Failed to open preview', error);
      })
      .finally(() => {
        opening = false;
        openButton.removeAttribute('disabled');
      });
  };

  this.$.root.addEventListener('dblclick', this.onDoubleClick);
  openButton.addEventListener('click', this.onOpen);
}

export function close(this: ToolbarContext) {
  if (this.onDoubleClick) {
    this.$.root.removeEventListener('dblclick', this.onDoubleClick);
    this.onDoubleClick = undefined;
  }
  if (this.onOpen) {
    this.$.open.removeEventListener('click', this.onOpen);
    this.onOpen = undefined;
  }
}
