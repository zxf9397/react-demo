import { fabric } from 'fabric';
import CropEnvironment, { ACoords, OriginalImage } from './crop.class';
import { angleToRadian, getCorrespondingPoint, linearFunction, linearsIntersection, pedalPoint, Point, toLocalPoint } from './math';

export default class OriginalEventsEnv {
  private mouseDown = false;
  constructor(private env: CropEnvironment, private canvas: fabric.Canvas) {
    this.bind();
  }

  private beforeMove = (e: fabric.IEvent) => {
    if (!this.env.cropped || !this.env.original) return;
    if (!e.transform?.corner) {
      this.initializeBeforeOriginMoving(this.env.cropped, this.env.original, e);
      this.mouseDown = true;
    }
  };

  private moving = (e: fabric.IEvent) => {
    if (!this.mouseDown || !this.env.cropped || !this.env.original) return;
    this.env.original.set(this.getOriginMovingProperties(this.env.cropped, this.env.original, e)).setCoords();
  };

  private afterMoving = () => {
    if (this.mouseDown) {
      this.mouseDown = false;
    }
  };

  private bind() {
    this.canvas.on('mouse:down', this.beforeMove);
    this.canvas.on('mouse:move', this.moving);
    this.canvas.on('mouse:up', this.afterMoving);
  }

  destroy = () => {
    this.canvas.off('mouse:down', this.beforeMove);
    this.canvas.off('mouse:move', this.moving);
    this.canvas.off('mouse:up', this.afterMoving);
  };

  initializeBeforeOriginMoving(croppedImage: fabric.Image, originalImage: fabric.Image, e: fabric.IEvent) {
    const { left = 0, top = 0, angle = 0 } = originalImage;
    const { tl, br } = croppedImage.aCoords as ACoords;
    const { br: BR } = originalImage.aCoords as ACoords;
    const pointer = e.pointer as fabric.Point;

    const radian = angleToRadian(angle);
    const sin = Math.sin(radian);
    const cos = Math.cos(radian);

    const offsetX = originalImage.getScaledWidth() - croppedImage.getScaledWidth();
    const offsetY = originalImage.getScaledHeight() - croppedImage.getScaledHeight();

    const origin = originalImage as OriginalImage;
    const mouseMovablePosition = getCorrespondingPoint(pointer, BR, br);
    origin._opts = {
      ...origin._opts,
      movableRect: new fabric.Rect({
        left: tl.x - offsetX * cos + offsetY * sin,
        top: tl.y - offsetY * cos - offsetX * sin,
        width: offsetX,
        height: offsetY,
        angle,
      }).setCoords(),
      activeRect: new fabric.Rect({
        left: mouseMovablePosition.x,
        top: mouseMovablePosition.y,
        width: offsetX,
        height: offsetY,
        angle,
      }).setCoords(),
      startPosition: { x: left, y: top },
      startPointer: pointer,
    };
  }

  getOriginMovingProperties(target: fabric.Image, origin: fabric.Image, e: fabric.IEvent) {
    const cOrigin = origin as OriginalImage;
    const { tl, tr, bl } = target.aCoords as ACoords;
    const { movableRect, activeRect, startPointer, startPosition } = cOrigin._opts;
    const { tl: TL, tr: TR, bl: BL } = movableRect.aCoords as ACoords;
    const mouseRectCoords = activeRect.aCoords as ACoords;

    const pointer = e.pointer as fabric.Point;
    const localPoint = toLocalPoint(activeRect, pointer);
    const endPoint = toLocalPoint(activeRect, mouseRectCoords.br);
    let point: { x: number; y: number };

    const realPosition = getCorrespondingPoint(pointer, startPointer, startPosition);

    if (localPoint.x <= 0 && localPoint.y <= 0) {
      // left-top
      point = TL;
    } else if (localPoint.x < 0 && localPoint.y > 0 && localPoint.y < endPoint.y) {
      // left
      point = pedalPoint(realPosition, linearFunction(BL, TL));
    } else if (localPoint.x > 0 && localPoint.x < endPoint.x && localPoint.y < 0) {
      // top
      point = pedalPoint(realPosition, linearFunction(TL, TR));
    } else if (localPoint.x >= endPoint.x && localPoint.y <= 0) {
      // right-top
      point = linearsIntersection(linearFunction(bl, tl), linearFunction(TL, TR));
    } else if (localPoint.x <= 0 && localPoint.y >= endPoint.y) {
      // left-bottom
      point = linearsIntersection(linearFunction(tl, tr), linearFunction(BL, TL));
    } else if (localPoint.x > 0 && localPoint.x < endPoint.x && localPoint.y > endPoint.y) {
      // bottom
      point = pedalPoint(realPosition, linearFunction(tl, tr));
    } else if (localPoint.x > endPoint.x && localPoint.y > 0 && localPoint.y < endPoint.y) {
      // right
      point = pedalPoint(realPosition, linearFunction(bl, tl));
    } else if (localPoint.x >= endPoint.x && localPoint.y >= endPoint.y) {
      // right-bottom
      point = tl;
    } else {
      // inner
      point = { x: startPosition.x + pointer.x - startPointer.x, y: startPosition.y + pointer.y - startPointer.y };
    }

    return { left: point.x, top: point.y };
  }

  initializeBeforeOriginScaling(target: fabric.Image, origin: fabric.Image, corner: string) {
    const { tl: TL, tr: TR, br: BR, bl: BL } = origin.aCoords as ACoords;
    const { scaleX = 1, scaleY = 1 } = origin;
    const { minScaleX, minScaleY } = this.getMinimumScale(target, origin, corner);

    const cOrigin = origin as OriginalImage;
    cOrigin._opts = {
      ...cOrigin._opts,
      minScaleX,
      minScaleY,
      // 对角线
      diagonal: [linearFunction(TL, BR), linearFunction(TR, BL)],
      // 原图像的宽高比
      radio: scaleX / scaleY,
    };
  }

  private getMinimumScale(target: fabric.Object, origin: fabric.Object, corner: string) {
    const coords = target.aCoords as ACoords;
    const { width = 0, height = 0 } = origin;
    let min = { x: origin.width || 0, y: origin.height || 0 };
    switch (corner) {
      case 'tl':
        min = toLocalPoint(origin, coords[corner], 'right', 'bottom');
        break;
      case 'tr':
        min = toLocalPoint(origin, coords[corner], 'left', 'bottom');
        break;
      case 'br':
        min = toLocalPoint(origin, coords[corner], 'left', 'top');
        break;
      case 'bl':
        min = toLocalPoint(origin, coords[corner], 'right', 'top');
        break;
    }
    return {
      minScaleX: Math.abs(min.x) / width,
      minScaleY: Math.abs(min.y) / height,
    };
  }

  getOriginScalingProperties(target: fabric.Image, origin: fabric.Image, corner: string) {
    let { scaleX = 1, scaleY = 1 } = origin;
    const opts = (origin as OriginalImage)._opts;
    const { tl, tr, br, bl } = target.aCoords as ACoords;
    const { tl: TL, tr: TR, bl: BL } = origin.aCoords as ACoords;

    if (scaleX <= opts.minScaleX) {
      let p: Point | null = null;
      switch (corner) {
        case 'tl': {
          p = linearsIntersection(opts.diagonal[0], linearFunction(bl, tl));
          break;
        }
        case 'tr': {
          const p1 = linearsIntersection(opts.diagonal[1], linearFunction(tr, br));
          p = pedalPoint(p1, linearFunction(BL, TL));
          break;
        }
        case 'br': {
          const p1 = linearsIntersection(opts.diagonal[0], linearFunction(tr, br));
          p = pedalPoint(p1, linearFunction(BL, TL));
          break;
        }
        case 'bl': {
          const p1 = linearsIntersection(opts.diagonal[1], linearFunction(bl, tl));
          p = pedalPoint(p1, linearFunction(TL, TR));
          break;
        }
      }
      p && this.setOriginScalingPosition(origin, corner, p);
      scaleX = opts.minScaleX;
      scaleY = opts.minScaleX * opts.radio;
    }

    if (scaleY <= opts.minScaleY) {
      let p: Point | null = null;
      switch (corner) {
        case 'tl': {
          p = linearsIntersection(opts.diagonal[0], linearFunction(tl, tr));
          break;
        }
        case 'tr': {
          const p1 = linearsIntersection(opts.diagonal[1], linearFunction(tl, tr));
          p = pedalPoint(p1, linearFunction(BL, TL));
          break;
        }
        case 'br': {
          const p1 = linearsIntersection(opts.diagonal[0], linearFunction(tl, tr));
          p = pedalPoint(p1, linearFunction(BL, TL));
          break;
        }
        case 'bl': {
          const p1 = linearsIntersection(opts.diagonal[1], linearFunction(bl, br));
          p = pedalPoint(p1, linearFunction(TL, TR));
          break;
        }
      }
      p && this.setOriginScalingPosition(origin, corner, p);
      scaleX = opts.minScaleY / opts.radio;
      scaleY = opts.minScaleY;
    }

    return { scaleX, scaleY };
  }

  private setOriginScalingPosition(origin: fabric.Image, corner: string, point: Point) {
    ['tl', 'tr', 'bl'].includes(corner) && origin.setPositionByOrigin(new fabric.Point(point.x, point.y), 'left', 'top');
  }
}
