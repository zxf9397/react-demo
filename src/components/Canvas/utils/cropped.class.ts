import { fabric } from 'fabric';
import type CropEnvironment from './crop.class';
import type { ACoords, CroppedImage } from './crop.class';
import { angleToRadian, linearFunction, linearsIntersection, pedalPoint, perpendicularLinear, Point, toLocalPoint } from './math';

interface CroppedEventsEnvOptions {
  minWidth?: number;
  minHeight?: number;
}

export default class CroppedEventsEnv {
  private minWidth = 0;
  private minHeight = 0;

  constructor(private env: CropEnvironment, private canvas: fabric.Canvas, options?: CroppedEventsEnvOptions) {
    this.minWidth = options?.minWidth || 0;
    this.minHeight = options?.minHeight || 0;
    this.bind();
  }

  private cropping = () => {
    if (!this.env.cropped || !this.env.original) return;
    this.env.cropped.set(this.getTargetCroppedProperties(this.env.cropped, this.env.original)).setCoords();
    this.canvas.renderAll();
  };

  private bind() {
    this.canvas.on('mouse:move', this.cropping);
  }

  destroy = () => {
    this.canvas.off('mouse:move', this.cropping);
  };

  getTargetCroppedProperties(target: fabric.Image, origin: fabric.Image) {
    const { width = 0, height = 0, scaleX = 1, scaleY = 1, flipX, flipY } = target;
    const { scaleX: oScaleX = 1, scaleY: oScaleY = 1 } = origin;
    const { tl: TL, tr: TR, br: BR, bl: BL } = origin.aCoords as ACoords;

    let point: fabric.Point;
    if (flipX && flipY) {
      point = toLocalPoint(target, BR, 'right', 'bottom');
    } else if (flipX) {
      point = toLocalPoint(target, TR, 'right', 'top');
    } else if (flipY) {
      point = toLocalPoint(target, BL, 'left', 'bottom');
    } else {
      point = toLocalPoint(target, TL, 'left', 'top');
    }

    return {
      width: (width * scaleX) / oScaleX,
      height: (height * scaleY) / oScaleY,
      cropX: Math.abs(point.x) / oScaleX,
      cropY: Math.abs(point.y) / oScaleY,
      scaleX: oScaleX,
      scaleY: oScaleY,
    };
  }

  initializeBeforeTargetScaling(target: fabric.Image) {
    const cropped = target as CroppedImage;
    cropped._opts = { ...cropped._opts, aCoords: cropped.aCoords as ACoords };
  }

  getTargetScalingProperties = (target: fabric.Image, origin: fabric.Image, e: fabric.IEvent) => {
    let { width = 0, height = 0, left, top } = target;
    const { angle = 0, flipX, flipY } = origin;
    const { tl: TL, tr: TR, bl: BL } = origin.aCoords as ACoords;
    const { tl, tr, br, bl } = (target as CroppedImage)._opts.aCoords as ACoords;
    const pointer = e.pointer as fabric.Point;
    const radian = angleToRadian(angle);
    const sin = Math.sin(radian);
    const cos = Math.cos(radian);
    const startLocalTl = toLocalPoint(origin, tl);
    const startLocalBr = toLocalPoint(origin, br);
    const local = toLocalPoint(origin, pointer);

    switch (e.transform?.corner) {
      case 'tl': {
        let p: fabric.Point | Point;
        const localPointer = toLocalPoint(origin, pointer);
        const x = br.x - this.minHeight * cos + this.minWidth * sin;
        const y = br.y - this.minHeight * sin - this.minWidth * cos;
        const endPointer = toLocalPoint(origin, new fabric.Point(x, y));

        if (localPointer.x >= endPointer.x && localPointer.y >= endPointer.y) {
          // right-bottom
          p = { x, y };
        } else if (localPointer.x > endPointer.x && localPointer.y > 0 && localPointer.y < endPointer.y) {
          // right
          p = pedalPoint(pointer, perpendicularLinear({ x, y }, linearFunction(TL, TR)));
        } else if (localPointer.x > 0 && localPointer.x < endPointer.x && localPointer.y > endPointer.y) {
          // bottom
          p = pedalPoint(pointer, perpendicularLinear({ x, y }, linearFunction(BL, TL)));
        } else if (localPointer.x >= endPointer.x && localPointer.y <= 0) {
          // right-top
          p = pedalPoint({ x, y }, linearFunction(TL, TR));
        } else if (localPointer.x <= 0 && localPointer.y >= endPointer.y) {
          // left-bottom
          p = pedalPoint({ x, y }, linearFunction(BL, TL));
        } else if (localPointer.x < 0 && localPointer.y > 0 && localPointer.y < endPointer.y) {
          // left
          p = pedalPoint(pointer, linearFunction(BL, TL));
        } else if (localPointer.x > 0 && localPointer.x < endPointer.x && localPointer.y < 0) {
          // top
          p = pedalPoint(pointer, linearFunction(TL, TR));
        } else if (localPointer.x <= 0 && localPointer.y <= 0) {
          // left-top
          p = TL;
        } else {
          // inner
          p = pointer;
        }

        left = p.x;
        top = p.y;
        width = startLocalBr.x - Math.max(local.x, 0);
        height = startLocalBr.y - Math.max(local.y, 0);
        break;
      }
      case 'tr': {
        let p: fabric.Point | Point;
        const localPointer = toLocalPoint(origin, pointer, 'right', 'top');
        const x = bl.x + this.minHeight * cos + this.minWidth * sin;
        const y = bl.y + this.minHeight * sin - this.minWidth * cos;
        const endPointer = toLocalPoint(origin, new fabric.Point(x, y), 'right', 'top');

        if (localPointer.y >= endPointer.y) {
          // left-bottom | bottom | right-bottom
          p = pedalPoint({ x, y }, linearFunction(bl, tl));
        } else if (localPointer.y <= 0) {
          // left-top | top | right-top
          p = pedalPoint(tl, linearFunction(TL, TR));
        } else {
          // inner | left | right
          p = pedalPoint(pointer, linearFunction(bl, tl));
        }

        left = p.x;
        top = p.y;
        width = Math.min(local.x, origin.getScaledWidth()) - startLocalTl.x;
        height = startLocalBr.y - Math.max(local.y, 0);
        break;
      }
      case 'br': {
        left = tl.x;
        top = tl.y;
        width = Math.min(local.x, origin.getScaledWidth()) - startLocalTl.x;
        height = Math.min(local.y, origin.getScaledHeight()) - startLocalTl.y;
        break;
      }
      case 'bl': {
        let p: fabric.Point | Point;
        const localPointer = toLocalPoint(origin, pointer, 'left', 'bottom');
        const x = tr.x - this.minWidth * cos - this.minHeight * sin;
        const y = tr.y - this.minWidth * sin + this.minHeight * cos;
        const endPointer = toLocalPoint(origin, new fabric.Point(x, y), 'left', 'bottom');

        if (localPointer.x >= endPointer.x) {
          // right-top | right | right-bottom
          p = pedalPoint({ x, y }, linearFunction(tl, tr));
        } else if (localPointer.x <= 0) {
          // left-bottom | left | left-top
          p = linearsIntersection(linearFunction(BL, TL), linearFunction(tl, tr));
        } else {
          // inner | top | bottom
          p = pedalPoint(pointer, linearFunction(tl, tr));
        }

        left = p.x;
        top = p.y;
        width = startLocalBr.x - Math.max(local.x, 0);
        height = Math.min(local.y, origin.getScaledHeight()) - startLocalTl.y;
        break;
      }
    }

    return { left, top, width: Math.max(width, this.minWidth), height: Math.max(height, this.minHeight), scaleX: 1, scaleY: 1, flipX, flipY };
  };
}
