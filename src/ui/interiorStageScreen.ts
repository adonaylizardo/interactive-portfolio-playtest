import { figmaAsset } from './figmaAssets';

export type InteriorStageLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  clipPath: string;
};

const STAGE_IMG = figmaAsset('talks-desktop-player', '0f6fa.png');

/** Video placeholder composited onto Teresa interior stage (forge pantalla quad). */
export class InteriorStageScreen {
  private el: HTMLDivElement;
  private img: HTMLImageElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'interior-stage-screen';
    this.el.hidden = true;
    this.img = document.createElement('img');
    this.img.src = STAGE_IMG;
    this.img.alt = '';
    this.img.decoding = 'async';
    this.el.appendChild(this.img);
    parent.appendChild(this.el);
  }

  hide(): void {
    this.el.hidden = true;
  }

  apply(layout: InteriorStageLayout | null): void {
    if (!layout || layout.width < 4 || layout.height < 4) {
      this.hide();
      return;
    }
    this.el.hidden = false;
    this.el.style.left = `${layout.left}px`;
    this.el.style.top = `${layout.top}px`;
    this.el.style.width = `${layout.width}px`;
    this.el.style.height = `${layout.height}px`;
    this.el.style.clipPath = layout.clipPath;
  }
}
