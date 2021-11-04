import { fabric } from 'fabric';
import CropEnvironment from './crop.class';

export type Design = Required<fabric.Object> & {};
type TypeUpdateLayerDesigns = (designs: Design[]) => void;

interface DesignToolOptions {
  update: TypeUpdateLayerDesigns;
}

export default class DesignTool {
  canvas: fabric.Canvas;
  cropEnv: CropEnvironment;
  layerIndex = 0;
  designs: Design[][] = [[]];
  layerDesigns: Design[] = this.designs[this.layerIndex];
  updateLayerDesigns: TypeUpdateLayerDesigns;

  constructor(el: string | HTMLCanvasElement, { update }: DesignToolOptions) {
    this.canvas = new fabric.Canvas(el);
    this.cropEnv = new CropEnvironment(this.canvas);
    this.updateLayerDesigns = (designs) => {
      this.layerDesigns = designs;
      update(designs);
    };
    this.bind();
  }

  addImage: (url: string, options?: Partial<fabric.Image>) => Promise<Design> = (url, options = {}) => {
    return new Promise((resolve) => {
      fabric.Image.fromURL(
        url,
        (image) => {
          image.set(options);
          this.canvas.discardActiveObject();
          this.canvas.setActiveObject(image);
          this.canvas.add(image).renderAll();
          this.updateLayerDesigns([...this.layerDesigns, image as Design]);
          resolve(image as Design);
        },
        {
          crossOrigin: 'anonymous',
        }
      );
    });
  };

  swicthLayer = (laryer: number) => {
    this.layerIndex = laryer % this.layerDesigns.length;
    this.layerDesigns = this.designs[laryer % this.layerDesigns.length];
  };

  removeDesign = (design: Design) => {
    const index = this.canvas.getObjects().findIndex((obj) => obj === design);
    this.canvas.remove(design);
    this.layerDesigns.splice(index, 1);
    this.updateLayerDesigns([...this.layerDesigns]);
  };

  flip = (type: 'flipX' | 'flipY') => {
    const activeObj = this.canvas.getActiveObject();
    if (!activeObj || this.cropEnv.cropping) {
      return;
    }
    const flipX = !activeObj.get(type);
    activeObj.set(type, flipX).setCoords();
    // setCoords for activeSelection._objects
    (activeObj as any)?.addWithUpdate?.();
    this.canvas.renderAll();
    this.canvas.fire('object:modified', { target: activeObj });
  };

  private scaleObject = (e: fabric.IEvent) => {
    const target = (e.transform as any).target;
    if (target._objects) {
      //
    } else {
      const index = this.canvas.getObjects().findIndex((obj) => obj === target);
      this.layerDesigns[index] = fabric.util.object.clone(target);
      this.updateLayerDesigns([...this.layerDesigns]);
    }
  };

  private bind() {
    this.canvas.on('object:scaling', this.scaleObject);
  }

  unbind() {
    this.canvas.off('object:scaling', this.scaleObject);
  }
}
