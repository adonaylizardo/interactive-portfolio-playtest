import { figmaAsset } from './figmaAssets';

export type InteriorStageLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  clipPath: string;
};

const STAGE_PLAY = figmaAsset('talks-desktop-player', '6a8ac.svg');

/** Video placeholder composited onto Teresa interior stage (forge pantalla quad). */
export class InteriorStageScreen {
  private el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'interior-stage-screen';
    this.el.hidden = true;
    const poster = document.createElement('div');
    poster.className = 'interior-stage-screen__poster';
    const play = document.createElement('img');
    play.className = 'interior-stage-screen__play';
    play.src = STAGE_PLAY;
    play.alt = '';
    play.decoding = 'async';
    poster.appendChild(play);
    this.el.appendChild(poster);
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
