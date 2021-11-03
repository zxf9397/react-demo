import { Point } from '../../../utils/func';
import { angleToRadian, getCorrespondingPoint, LinearFunction } from '../../../utils/func';
import { fabric } from 'fabric';
import { linearFunction, linearsIntersection, pedalPoint, perpendicularLinear, toLocalPoint } from './math';

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;
type Controls = 'bl' | 'br' | 'mb' | 'ml' | 'mr' | 'mt' | 'tl' | 'tr' | 'mtr';
type ControlsEvents = 'lockMovementX' | 'lockMovementY' | 'lockSkewingX' | 'lockSkewingY' | 'centeredScaling';
interface Cropped {
  originalImage: OriginalImage | null;
  bound?: boolean; // 是否绑定过裁切事件
  cropping?: boolean; // 是否在裁切状态
  _opts: {
    controlsVisibility?: { [key in Controls]?: boolean };
    controlsEvents: { [key in ControlsEvents]?: boolean };
    canvasCenteredScaling?: boolean;
    aCoords?: ACoords;
  };
}
interface Origin {
  isCroppingOrigin: boolean; // 标识符，表示为原对象
  relationship: number[];
  _opts: {
    movableRect: fabric.Rect; // 原对象移动的范围
    activeRect: fabric.Rect; // 鼠标移动的范围
    startPosition: Point; // 原对象移动前的位置坐标
    startPointer: Point; // 原对象移动前的鼠标坐标
    minScaleX: number; // 原对象 x 轴最小缩放
    minScaleY: number; // 原对象 y 轴最小缩放
    diagonal: [LinearFunction, LinearFunction]; // 原对象的对角线
    radio: number; // 原对象的宽高比
  };
}
type CroppedImage = fabric.Image & Cropped;
type OriginalImage = fabric.Image & Origin;

const ORIGINAL_IMAGE_OPACITY = 0.8;
// 折线长度
const CORNER_LINE_LENGTH = 10;
// 折线宽度
const CORNER_LINE_WIDTH = 4;
const MIN_WIDTH = 50;
const MIN_HEIGHT = 50;
const defaultControls = (({ tl, tr, br, bl }) => ({ tl, tr, br, bl }))(fabric.Image.prototype.controls);
const controlsHidden: { [key in Controls]?: boolean } = { mtr: false, ml: false, mt: false, mr: false, mb: false };
const eventLock: { [key in ControlsEvents]?: boolean } = {
  lockMovementX: true,
  lockMovementY: true,
  lockSkewingX: true,
  lockSkewingY: true,
  centeredScaling: false,
};

function drawLine(ctx: CanvasRenderingContext2D, x: number, y: number, fabricObject: fabric.Object) {
  let points: number[] = [];
  const lineWidth = Math.min(fabricObject.getScaledWidth(), CORNER_LINE_LENGTH);
  const lineHeight = Math.min(fabricObject.getScaledHeight(), CORNER_LINE_LENGTH);
  if (x < 0 && y < 0) {
    points = [lineWidth, 0, 0, 0, 0, lineHeight];
  } else if (x > 0 && y < 0) {
    points = [-lineWidth, 0, 0, 0, 0, lineHeight];
  } else if (x > 0 && y > 0) {
    points = [0, -lineHeight, 0, 0, -lineWidth, 0];
  } else {
    points = [0, -lineHeight, 0, 0, lineWidth, 0];
  }

  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  ctx.lineTo(points[2], points[3]);
  ctx.lineTo(points[4], points[5]);
  ctx.lineWidth = CORNER_LINE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.closePath();
}

function renderIcon(this: any, ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: object, fabricObject: fabric.Object) {
  ctx.save();
  ctx.translate(left, top);
  ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle || 0));
  drawLine(ctx, this.x, this.y, fabricObject);
  ctx.restore();
}

function wrapWithModified(handler: (target: fabric.Image, e: { target?: fabric.Object }) => void) {
  return function (e: fabric.IEvent) {
    let targets: fabric.Image[] = [];
    if (e.target?.type === 'image' && (e.target as CroppedImage).originalImage) {
      targets = [e.target as fabric.Image];
    } else if (e.target?.type === 'activeSelection') {
      targets = (e.target as fabric.ActiveSelection)._objects.filter((obj) => (obj as CroppedImage).originalImage) as fabric.Image[];
    }
    targets.forEach((target) => {
      handler(target, e);
    });
  };
}

class OriginalEventsEnv {
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

class CroppedEventsEnv {
  constructor(private env: CropEnvironment, private canvas: fabric.Canvas) {
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
    const cTarget = target as CroppedImage;
    cTarget._opts = { ...cTarget._opts, aCoords: cTarget.aCoords as ACoords };
  }

  getTargetScalingProperties(target: fabric.Image, origin: fabric.Image, e: fabric.IEvent) {
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
        const x = br.x - MIN_HEIGHT * cos + MIN_WIDTH * sin;
        const y = br.y - MIN_HEIGHT * sin - MIN_WIDTH * cos;
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
        const x = bl.x + MIN_HEIGHT * cos + MIN_WIDTH * sin;
        const y = bl.y + MIN_HEIGHT * sin - MIN_WIDTH * cos;
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
        const x = tr.x - MIN_WIDTH * cos - MIN_HEIGHT * sin;
        const y = tr.y - MIN_WIDTH * sin + MIN_HEIGHT * cos;
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

    return { left, top, width: Math.max(width, MIN_WIDTH), height: Math.max(height, MIN_HEIGHT), scaleX: 1, scaleY: 1, flipX, flipY };
  }
}

export default class CropEnvironment {
  cropped: CroppedImage | null = null;
  croppedBackup: CroppedImage | null = null;
  original: OriginalImage | null = null;
  originalBackup: OriginalImage | null = null;
  private index: number = -1;
  private croppedEventsEnv: CroppedEventsEnv;
  private originalEventEnv: OriginalEventsEnv;
  private preserveObjectStacking: boolean | undefined;

  constructor(private canvas: fabric.Canvas) {
    this.croppedEventsEnv = new CroppedEventsEnv(this, canvas);
    this.originalEventEnv = new OriginalEventsEnv(this, canvas);
    this.preserveObjectStacking = canvas.preserveObjectStacking;
    this.bind();
  }

  private mouseDown = (e: fabric.IEvent) => {
    if (!this.cropped || !this.original) return;
    console.log(e.target, this.original);
    if (e.target !== this.cropped && e.target !== this.original) {
      this.confirmCropping();
    }
  };

  private dblclick = (e: fabric.IEvent) => {
    if (!e.target) return;
    if (e.target === this.cropped || e.target === this.original) {
      this.confirmCropping();
    } else {
      this.enterCropping();
    }
  };

  private afterRender = (e: any) => {
    if (!this.cropped && !this.original) return;
    (this.cropped as any)._renderControls(e.ctx, { hasControls: false, hasBorders: true });
    (this.original as any)._renderControls(e.ctx, { hasControls: false, hasBorders: true });
  };

  private _updateMinions = wrapWithModified(CropEnvironment.updateMinions);

  private bind() {
    this.canvas.on('mouse:down', this.mouseDown);
    this.canvas.on('mouse:dblclick', this.dblclick);
    this.canvas.on('after:render', this.afterRender);
    ['object:modified', 'object:rotating', 'object:scaling', 'object:fliped', 'selection:cleared'].forEach((event) => {
      this.canvas.on(event, (e) => {
        wrapWithModified(CropEnvironment.updateMinions)(e);
      });
    });
  }

  destroy() {
    this.canvas.off('mouse:down', this.mouseDown);
    this.canvas.off('mouse:dblclick', this.dblclick);
    this.canvas.off('after:render', this.afterRender);
    ['object:modified', 'object:rotating', 'object:scaling', 'object:fliped', 'selection:cleared'].forEach((event) => {
      this.canvas.off(event, this._updateMinions);
    });
    this.croppedEventsEnv.destroy();
    this.originalEventEnv.destroy();
  }

  private initializeCroppingEvents(target: fabric.Image, origin: fabric.Image) {
    const cropped = target as CroppedImage;
    const original = origin as OriginalImage;
    const { lockMovementX, lockMovementY, lockSkewingX, lockSkewingY, centeredScaling } = cropped;
    cropped._opts = {
      ...cropped._opts,
      controlsVisibility: Object.keys(cropped.controls).reduce((opt: Record<string, boolean>, name) => {
        opt[name] = cropped.isControlVisible(name);
        return opt;
      }, {}),
      controlsEvents: {
        lockMovementX,
        lockMovementY,
        lockSkewingX,
        lockSkewingY,
        centeredScaling,
      },
      canvasCenteredScaling: cropped.canvas?.centeredScaling,
    };
    // 取消中心缩放
    cropped.canvas && (cropped.canvas.centeredScaling = false);
    // 设置裁切中控制器的样式
    Object.entries(defaultControls).map(([name, ctl]) => {
      cropped.controls[name] = new fabric.Control({ ...ctl, render: renderIcon, sizeX: CORNER_LINE_LENGTH * 1.5, sizeY: CORNER_LINE_LENGTH * 1.5 });
    });
    // 设置原对象的属性
    original.setControlsVisibility(controlsHidden).set({
      ...eventLock,
      lockScalingFlip: true,
      centeredScaling: false,
      opacity: ORIGINAL_IMAGE_OPACITY,
    });
    // 设置裁切对象的属性
    cropped.setControlsVisibility(controlsHidden).set(eventLock);
    // 清空裁切对象的最小缩放
    cropped.set('minScaleLimit', undefined);
    // 进入裁切状态
    cropped.cropping = true;
    //
    this.canvas.preserveObjectStacking = true;
  }

  private initializeUnCroppingEvents(target: fabric.Image) {
    const cTarget = target as CroppedImage;
    // 还原裁切对象的属性
    cTarget.setControlsVisibility({ ...cTarget._opts.controlsVisibility }).set({ ...cTarget._opts.controlsEvents });
    //
    cTarget.canvas && (cTarget.canvas.centeredScaling = cTarget._opts.canvasCenteredScaling);
    // 还原控制器的样式
    Object.entries(defaultControls).map(([name, control]) => {
      cTarget.controls[name] = control;
    });
    // 设置裁切对象的最小缩放
    const scaledWidth = cTarget.getScaledWidth();
    const scaledHeight = cTarget.getScaledHeight();
    const minScaleX = MIN_WIDTH / scaledWidth;
    const minScaleY = MIN_HEIGHT / scaledHeight;
    cTarget.set('minScaleLimit', Math.max(minScaleX * (cTarget.scaleX || 1), minScaleY * (cTarget.scaleY || 1)));
    // 退出裁切状态
    cTarget.cropping = false;
    //
    this.canvas.preserveObjectStacking = this.preserveObjectStacking;
  }

  enterCropping = () => {
    if (this.cropped) return;
    const active = this.canvas.getActiveObject();
    if (active.type !== 'image') return;

    this.index = this.canvas.getObjects().findIndex((klass) => klass === active);
    this.original = fabric.util.object.clone((active as CroppedImage).originalImage || active) as OriginalImage;
    this.croppedBackup = fabric.util.object.clone(active);
    this.cropped = active as CroppedImage;
    this.originalBackup = (active as CroppedImage).originalImage;

    this.initializeCroppingEvents(this.cropped, this.original);

    if (!this.cropped.bound) {
      this.cropped.bound = true;
      // bind cropping target
      this.cropped.on('mousedown', (e: fabric.IEvent) => {
        if (!this.cropped || !this.original) {
          return;
        }
        if (e.transform?.corner) {
          this.croppedEventsEnv.initializeBeforeTargetScaling(this.cropped);
        }
      });
      this.cropped.on('scaling', (e) => {
        if (!this.cropped || !this.original) {
          return;
        }
        const opts = this.croppedEventsEnv.getTargetScalingProperties(this.cropped, this.original, e);
        this.cropped.set(opts).setCoords();
        calculateCrop();
      });
      const calculateCrop = () => {
        if (!this.cropped || !this.original) {
          return;
        }
        const opts = this.croppedEventsEnv.getTargetCroppedProperties(this.cropped, this.original);
        this.cropped.set(opts).setCoords();
      };
      this.cropped.on('scaled', calculateCrop);

      // bind cropping origin
      this.original.on('mousedown', (e: fabric.IEvent) => {
        if (!this.cropped || !this.original) {
          return;
        }
        // scaling
        if (e.transform?.corner) {
          this.originalEventEnv.initializeBeforeOriginScaling(this.cropped, this.original, e.transform.corner);
          return;
        }
      });
      this.original.on('scaling', (e) => {
        if (!this.cropped || !this.original) {
          return;
        }
        if (e.transform?.corner) {
          const opts = this.originalEventEnv.getOriginScalingProperties(this.cropped, this.original, e.transform?.corner);
          this.original.set(opts).setCoords();
          calculateCrop();
        }
      });
      this.original.on('modified', calculateCrop);
    }

    this.canvas.add(this.original);
    this.cropped.bringToFront();
  };

  cancelCropping = () => {
    if (!this.original || !this.croppedBackup || !this.cropped) return;
    this.cropped.originalImage = this.originalBackup;
    this.initializeUnCroppingEvents(this.cropped);
    this.canvas.remove(this.original, this.cropped).add(this.croppedBackup);
    this.croppedBackup.moveTo(this.index);
    this.canvas.setActiveObject(this.croppedBackup);
    // clear
    this.cropped = null;
    this.croppedBackup = null;
    this.original = null;
  };

  confirmCropping = () => {
    if (!this.original || !this.croppedBackup || !this.cropped) return;
    this.cropped.originalImage = this.original;
    this.canvas.setActiveObject(this.cropped);
    this.cropped.moveTo(this.index);
    this.canvas.remove(this.original);
    this.initializeUnCroppingEvents(this.cropped);
    CropEnvironment.bindFollow(this.cropped);
    // clear
    this.cropped = null;
    this.croppedBackup = null;
    this.original = null;
  };

  static bindFollow(target: fabric.Object) {
    const cropped = target as CroppedImage;
    const origin = cropped.originalImage;
    if (cropped.cropping || !origin) return;

    // 计算裁切对象当前的变换矩阵，并得到逆转变换
    const bossTransform = target.calcTransformMatrix();
    const invertedBossTransform = fabric.util.invertTransform(bossTransform);
    // 关键：拿到能描述 裁切对象和原图对象 关系的变换矩阵
    // 该方法接收三个参数，前两个参数不分先后
    const desiredTransform = fabric.util.multiplyTransformMatrices(
      invertedBossTransform,
      // 返回原图对象的变换矩阵
      origin.calcTransformMatrix()
    );

    // 将“主随关系”的变换矩阵保存在“随从”上
    (origin as any).relationship = desiredTransform;
  }

  static updateMinions(croppingTarget: fabric.Object) {
    const target = croppingTarget as CroppedImage;
    const origin = target.originalImage;
    // 直接返回
    if (target.cropping || !origin) {
      return;
    }

    // 将两个矩阵变换叠加，得到新的变换规则
    const newTransform = fabric.util.multiplyTransformMatrices(
      // 返回当前 “主人” 经过 move/rotate/... 操作后的变换矩阵
      croppingTarget.calcTransformMatrix(),
      // 和 “主随关系” 矩阵相叠加
      origin.relationship
    );

    // 将包含6个数字元素的数组转换为属性的集合
    const opt = fabric.util.qrDecompose(newTransform);

    const originalFlipX = croppingTarget.flipX;
    const originalFlipY = croppingTarget.flipY;
    // 设置“随从” X/Y 轴平方向都不翻转
    origin.set({
      flipX: false,
      flipY: false,
      scaleX: opt.scaleX,
      scaleY: opt.scaleY,
      skewX: opt.skewX,
      skewY: opt.skewY,
    });

    if (originalFlipX !== origin.flipX || originalFlipY !== origin.flipY) {
      origin.flipX = originalFlipX;
      origin.flipY = originalFlipY;
      opt.angle -= 180;
    }
    origin.angle = opt.angle;

    // 设置“随从”原点的位置，这里将矩形的中心作为原点
    origin.setPositionByOrigin(new fabric.Point(opt.translateX, opt.translateY), 'center', 'center');

    // 将上面从矩阵数组转换而得到的属性集合对象作为“随从”的新配置
    // set 方法并不能让和坐标相关的矩阵变换生效，所以还需要再执行下面的方法
    origin.setCoords();
  }
}
