import { fabric } from 'fabric';

interface FilterEnvironmentOptions {
  left: number;
  top: number;
  width: number;
  height: number;
  filters: any[];
}

export default class FilterEnvironment {
  private filterImage: fabric.Image | null = null;

  constructor(private canvas: fabric.Canvas, private options: FilterEnvironmentOptions) {
    this.applyFilters();
  }

  setFilters = () => {
    if (!this.filterImage) return;
    this.filterImage.filters = this.options.filters;
    this.filterImage.applyFilters();
  };

  applyFilters = () => {
    this.filterImage?.set('visible', false);
    // console.time('toDataURL');
    const { left, top, width, height } = this.options;
    const url = this.canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1, left: left + 1, top: top + 1, width, height });
    this.filterImage?.set('visible', true);
    // console.timeEnd('toDataURL');
    // console.time('fromURL');
    if (!this.filterImage) {
      fabric.Image.fromURL(url, (image) => {
        (image as any).ignored = true;
        image.set({ left, top, width, height, evented: false, selectable: false, stroke: '#0006', strokeWidth: 2 });
        this.canvas.add(image);
        this.setFilters();
        this.filterImage = image;
        this.filterImage?.bringToFront();
        // console.timeEnd('fromURL');
      });
    } else {
      this.filterImage.setSrc(url, () => {
        this.setFilters();
        this.filterImage?.bringToFront();
        // console.timeEnd('fromURL');
      });
    }
  };
}
