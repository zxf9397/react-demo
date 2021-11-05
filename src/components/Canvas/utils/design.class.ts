import { fabric } from 'fabric';
import CropEnvironment from './crop.class';

export interface InterfacePayload {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
}
interface CustomParameters {
  on(eventName: 'datachange', handler: (e: InterfacePayload) => void): void;
  off(eventName: 'datachange', handler: (e: InterfacePayload) => void): void;
}

export type Design = Required<fabric.Object> & CustomParameters;
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
          this.updateLayerDesigns([...this.layerDesigns, image as unknown as Design]);
          resolve(image as unknown as Design);
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

  scaleToWidth = (design: Design, width: number) => {
    design.scaleToWidth(width);
    this.canvas.renderAll();
  };

  addPath = () => {
    const pathArray =
      'M78.2,0.1c0,0,9.4,79.1,2.3,117  c-4.5,24.1-31.8,106.2-56.3,108.7c-12.7,1.3-24.2-11.9-16.5-15.5C15,207,40.2,231.1,19,261.7c-9.8,14.1-24.7,31.9-12.5,44.9  c11.3,12,53-36.8,59.2-23.8c8.6,18-40.8,23-28,49.2c14.7,30.4,21.6,39.9,48,58.5c31.3,22,147,66.2,147.2,149.5';
    const path = new fabric.Path(pathArray, {
      fill: '',
      stroke: 'black',
      strokeDashArray: [5, 5],
      strokeDashOffset: 0,
    });
    this.canvas.add(path);

    const animatePath = (path: fabric.Path) => {
      path.animate('strokeDashOffset', '-=3', {
        duration: 100,
        onChange: this.canvas.renderAll.bind(this.canvas),
        onComplete: function () {
          animatePath(path);
        },
      });
    };
    console.log(path);
    animatePath(path);
  };

  set = <K extends keyof InterfacePayload>(design: Design, key: K, value: Design[K]) => {
    switch (key) {
      case 'angle':
        design.rotate(value);
        break;
      case 'width':
        design.set('scaleX', value / design.width);
        break;
      case 'height':
        design.set('scaleY', value / design.height);
        break;
      default:
        design.set(key, value);
    }
    this.canvas.renderAll();
  };

  flip = (type: 'flipX' | 'flipY') => {
    const active = this.canvas.getActiveObject();
    if (!active || this.cropEnv.cropping) {
      return;
    }
    const flipX = !active.get(type);
    active.set(type, flipX).setCoords();
    (active as any)?.addWithUpdate?.();
    this.canvas.renderAll();
    this.canvas.fire('object:modified', { target: active });
  };

  private datachange = (e: fabric.IEvent) => {
    const target = ((e.transform as any) || e).target;
    if (target._objects) {
      target._objects.forEach((design: Design) => {
        const { width, height } = design;
        const { scaleX, scaleY, angle } = fabric.util.qrDecompose(design.calcTransformMatrix());
        design.fire('datachange', { width, height, scaleX: Math.abs(scaleX), scaleY: Math.abs(scaleY), angle: (360 + angle) % 360 });
      });
    } else {
      const { width, height, scaleX, scaleY, angle } = target;
      target.fire('datachange', { width, height, scaleX, scaleY, angle });
    }
  };

  private bind() {
    this.canvas.on('object:scaling', this.datachange);
    this.canvas.on('object:rotating', this.datachange);
  }

  unbind() {
    this.canvas.off('object:scaling', this.datachange);
    this.canvas.off('object:rotating', this.datachange);
  }
}
