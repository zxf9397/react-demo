import { fabric } from 'fabric';
import {
  linearFunction,
  LinearFunction,
  linearFunctionMove,
  linearsIntersection,
  pedalPoint,
  perpendicularLinear,
  Point,
  pointToLinearDistance,
} from './func';

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;

export interface CoordsLinears {
  left: LinearFunction;
  top: LinearFunction;
  right: LinearFunction;
  bottom: LinearFunction;
}

interface TargetOptions {
  scaleWidth: number;
  scaleHeight: number;
  coords: ACoords;
}
interface OriginOptions {
  // starting postion of cropping origin
  position: { x: number; y: number };
  // starting mouse pointer
  pointer: fabric.Point;
  // valid range of mouse movement
  moveRegion: fabric.Rect;
  // the pedal pointer to top/left linear
  pedals: { top: Point; left: Point };
  // valid range of cropping origin movement
  linears: CoordsLinears;
  minScaleX: number;
  minScaleY: number;
  diagonal: [LinearFunction, LinearFunction];
  radio: number;
}

const MIN_WIDTH = 50;
const MIN_HEIGHT = 50;

function commonEventInfo(eventData: MouseEvent, transform: fabric.Transform, x: number, y: number) {
  return {
    e: eventData,
    transform: transform,
    pointer: {
      x: x,
      y: y,
    },
  };
}

function wrapWithFireEvent(
  eventName: string,
  actionHandler: (eventData: MouseEvent, transformData: fabric.Transform, x: number, y: number) => boolean
) {
  return function (eventData: MouseEvent, transform: fabric.Transform, x: number, y: number) {
    const actionPerformed = actionHandler(eventData, transform, x, y);
    if (actionPerformed) {
      (fabric as any).controlsUtils.fireEvent(eventName, commonEventInfo(eventData, transform, x, y));
    }
    return actionPerformed;
  };
}

function toLocalPoint(target: fabric.Object, point: fabric.Point, originX: 'left' | 'right' = 'left', originY: 'top' | 'bottom' = 'top') {
  return target.toLocalPoint(point, originX, originY);
}

export function setControlsActionHandler(obj: fabric.Object) {
  // 解决缩放时的抖动
  obj.controls.tl.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.mt.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingYOrSkewingX);
  obj.controls.tr.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.bl.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.ml.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingXOrSkewingY);
}

export function wrapWithModified(handler: (target: fabric.Image, e: { target?: fabric.Object }) => void) {
  return function (e: fabric.IEvent) {
    let targets: fabric.Image[] = [];
    if (e.target?.type === 'image' && (e.target as any).croppingOrigin) {
      targets = [e.target as fabric.Image];
    } else if (e.target?.type === 'activeSelection') {
      targets = (e.target as fabric.ActiveSelection)._objects.filter((obj) => (obj as any).croppingOrigin) as fabric.Image[];
    }
    targets.forEach((target) => {
      handler(target, e);
    });
  };
}

export function updateMinions(target: fabric.Object) {
  const origin = (target as any).croppingOrigin as fabric.Object;
  // 直接返回
  if ((target as any).cropping || !(origin as any).relationship) {
    return;
  }

  const relationship: number[] = (origin as any).relationship;

  // 将两个矩阵变换叠加，得到新的变换规则
  const newTransform = fabric.util.multiplyTransformMatrices(
    // 返回当前 “主人” 经过 move/rotate/... 操作后的变换矩阵
    target.calcTransformMatrix(),
    // 和 “主随关系” 矩阵相叠加
    relationship
  );

  // 将包含6个数字元素的数组转换为属性的集合
  const opt = fabric.util.qrDecompose(newTransform);

  const originalFlipX = target.flipX;
  const originalFlipY = target.flipY;
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

export function bindFollow(target: fabric.Object) {
  if ((target as any).cropping) {
    return false;
  }
  const origin = (target as any).croppingOrigin as fabric.Object;

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

const defaultControls = (({ tl, tr, br, bl }) => ({ tl, tr, br, bl }))(fabric.Image.prototype.controls);

function drawLine(ctx: CanvasRenderingContext2D, x: number, y: number, fabricObject: fabric.Object) {
  let points: number[] = [];
  const lineWidth = Math.min(fabricObject.getScaledWidth(), 10);
  const lineHeight = Math.min(fabricObject.getScaledHeight(), 10);
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
  ctx.lineWidth = 4;
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

export function setCroppingControls(target: fabric.Image, origin: fabric.Image) {
  origin
    .setControlsVisibility({
      mtr: false,
      ml: false,
      mt: false,
      mr: false,
      mb: false,
    })
    .set({
      lockMovementX: true,
      lockMovementY: true,
      lockSkewingX: true,
      lockSkewingY: true,
      lockScalingFlip: true,
      opacity: 0.6,
    });

  target
    .setControlsVisibility({
      mtr: false,
      ml: false,
      mt: false,
      mr: false,
      mb: false,
    })
    .set({
      lockMovementX: true,
      lockMovementY: true,
      lockSkewingX: true,
      lockSkewingY: true,
      // lockScalingFlip: true,
    });
  (target as any).cropping = true;

  Object.entries(defaultControls).map(([name, ctl]) => {
    target.controls[name] = new fabric.Control({ ...ctl, render: renderIcon, sizeX: 15, sizeY: 15 });
  });
}

export function setUnCroppingControls(target: fabric.Image) {
  target
    .setControlsVisibility({
      mtr: true,
      ml: true,
      mt: true,
      mr: true,
      mb: true,
    })
    .set({
      lockMovementX: false,
      lockMovementY: false,
      lockSkewingX: false,
      lockSkewingY: false,
      // lockScalingFlip: false,
    });
  (target as any).cropping = false;
  Object.entries(defaultControls).map(([name, ctl]) => {
    target.controls[name] = ctl;
  });
}

/**
 * 记录 target 缩放前的 aCoords
 * @param target
 */
export function setTargetScaleCroods(target: fabric.Image) {
  const coords = target.get('aCoords') as ACoords;
  const opts: TargetOptions = { ...((target as any)._opts as TargetOptions), coords };
  (target as any)._opts = opts;
}

/**
 * calculates the current coords of the cropping target
 * @param target
 * @param origin
 * @param e
 * @returns
 */
export function getTargetScaleProperties(target: fabric.Image, origin: fabric.Image, e: fabric.IEvent) {
  let { width = 0, height = 0, left = 0, top = 0 } = target;
  const { angle = 0, flipX, flipY, scaleX = 1, scaleY = 1 } = origin;
  const WIDTH = origin.getScaledWidth();
  const HEIGHT = origin.getScaledHeight();
  const { tl, tr, br, bl } = target.get('aCoords') as ACoords;
  const { tl: TL, tr: TR, br: BR, bl: BL } = origin.aCoords as ACoords;
  const opts = (target as any)._opts as TargetOptions;
  const pointer = e.pointer as fabric.Point;

  const sin = Math.sin((angle * Math.PI) / 180);
  const cos = Math.cos((angle * Math.PI) / 180);

  switch (e.transform?.corner) {
    case 'tl': {
      let local: fabric.Point;
      let p: fabric.Point | Point;
      const localPointer = toLocalPoint(origin, pointer);
      const startLocalBl = toLocalPoint(origin, opts.coords.bl);
      const startLocalTr = toLocalPoint(origin, opts.coords.tr);

      const realWidth = startLocalTr.x - localPointer.x;

      console.log(realWidth);

      const x = br.x - MIN_HEIGHT * cos + MIN_WIDTH * sin;
      const y = br.y - MIN_HEIGHT * sin - MIN_WIDTH * cos;
      console.log({ x, y });
      if (localPointer.x >= startLocalTr.x - MIN_WIDTH && localPointer.y >= startLocalBl.y - MIN_HEIGHT) {
        // right-bottom
        p = { x, y };
        local = toLocalPoint(origin, new fabric.Point(x, y));
        console.log('rb');
      } else if (localPointer.y > startLocalBl.y - MIN_HEIGHT && localPointer.x < 0) {
        // left-bottom
        p = pedalPoint({ x, y }, linearFunction(BL, TL));
        local = toLocalPoint(origin, new fabric.Point(x, y));
        console.log('lb');
      } else if (localPointer.y > startLocalBl.y - MIN_HEIGHT) {
        // bottom
        p = pedalPoint(pointer, perpendicularLinear({ x, y }, linearFunction(bl, tl)));

        local = toLocalPoint(origin, pointer);
        console.log('b');
      } else if (startLocalTr.x - localPointer.x < MIN_WIDTH && localPointer.y < 0) {
        // right-top
        p = pedalPoint(tl, linearFunction(TL, TR));
        local = toLocalPoint(origin, new fabric.Point(p.x, p.y));
        console.log('rt');
      } else if (startLocalTr.x - localPointer.x < MIN_WIDTH) {
        // right
        p = pedalPoint(pointer, perpendicularLinear({ x, y }, linearFunction(tl, tr)));
        local = toLocalPoint(origin, pointer);
        console.log('r');
      } else if (localPointer.x < 0 && localPointer.y < 0) {
        // left-top
        p = TL;
        local = toLocalPoint(origin, TL);
        console.log('lt');
      } else if (localPointer.x < 0) {
        // left
        p = pedalPoint(pointer, linearFunction(BL, TL));
        local = toLocalPoint(origin, new fabric.Point(p.x, p.y));
        console.log('l');
      } else if (localPointer.y < 0) {
        // top
        p = pedalPoint(pointer, linearFunction(TL, TR));
        local = toLocalPoint(origin, new fabric.Point(p.x, p.y));
        console.log('t');
      } else {
        // inner
        p = pointer;
        local = toLocalPoint(origin, pointer);
        console.log('i');
      }

      left = p.x;
      top = p.y;
      width = Math.min(Math.max(startLocalTr.x - local.x, MIN_WIDTH), startLocalTr.x);
      height = Math.min(Math.max(startLocalBl.y - local.y, MIN_HEIGHT));
      break;
    }
    case 'tr': {
      let p: fabric.Point | Point;
      const localPointer = toLocalPoint(origin, pointer, 'right', 'top');
      const startLocalTl = toLocalPoint(origin, opts.coords.tl);
      const startLocalBr = toLocalPoint(origin, opts.coords.br);
      const startLocalPointer = toLocalPoint(origin, pointer);

      const realWidth = startLocalPointer.x - startLocalTl.x;
      const realHeight = startLocalBr.y - startLocalPointer.y;

      const x = bl.x + MIN_HEIGHT * cos + MIN_WIDTH * sin;
      const y = bl.y - MIN_WIDTH * cos + MIN_HEIGHT * sin;

      if (realWidth < MIN_WIDTH && realHeight < MIN_HEIGHT) {
        // left-bottom
        p = pedalPoint({ x, y }, linearFunction(bl, tl));
        width = MIN_WIDTH;
        height = MIN_HEIGHT;
      } else if (realHeight < MIN_HEIGHT) {
        // bottom | right-bottom
        p = pedalPoint({ x, y }, linearFunction(bl, tl));
        const local = toLocalPoint(origin, pointer);
        width = Math.min(local.x - startLocalTl.x, WIDTH - startLocalTl.x);
        height = MIN_HEIGHT;
      } else if (realWidth < MIN_WIDTH) {
        // left | left-top
        p = localPointer.y < 0 ? pedalPoint(tl, linearFunction(TL, TR)) : pedalPoint(pointer, linearFunction(bl, tl));
        const local = toLocalPoint(origin, pointer);
        width = MIN_WIDTH;
        height = Math.min(startLocalBr.y - local.y, startLocalBr.y);
      } else if (localPointer.x > 0 && localPointer.y < 0) {
        // right-top
        p = pedalPoint(tl, linearFunction(TL, TR));
        const local = toLocalPoint(origin, TR);
        width = local.x - startLocalTl.x;
        height = startLocalBr.y - local.y;
      } else if (localPointer.x > 0) {
        // right
        p = pedalPoint(pointer, linearFunction(bl, tl));
        const local = toLocalPoint(origin, pointer);
        width = toLocalPoint(origin, TR).x - startLocalTl.x;
        height = startLocalBr.y - local.y;
      } else if (localPointer.y < 0) {
        // top
        p = linearsIntersection(linearFunction(bl, tl), linearFunction(TL, TR));
        const local = toLocalPoint(origin, pointer);
        width = local.x - startLocalTl.x;
        height = startLocalBr.y;
      } else {
        // inner
        p = pedalPoint(pointer, linearFunction(bl, tl));
        const local = toLocalPoint(origin, pointer);
        width = local.x - startLocalTl.x;
        height = startLocalBr.y - local.y;
      }

      left = p.x;
      top = p.y;
      break;
    }
    case 'br': {
      const localPointer = toLocalPoint(origin, pointer, 'right', 'bottom');
      const startLocalBl = toLocalPoint(origin, opts.coords.bl);
      const startLocalTr = toLocalPoint(origin, opts.coords.tr);

      if (localPointer.x > 0 && localPointer.y > 0) {
        // right-bottom
        width = toLocalPoint(origin, BR).x - startLocalBl.x;
        height = toLocalPoint(origin, BR).y - startLocalTr.y;
      } else if (localPointer.x > 0) {
        const local = toLocalPoint(origin, pointer);
        width = toLocalPoint(origin, BR).x - startLocalBl.x;
        height = local.y - startLocalTr.y;
        // right
      } else if (localPointer.y > 0) {
        const local = toLocalPoint(origin, pointer);
        width = local.x - startLocalBl.x;
        height = toLocalPoint(origin, BR).y - startLocalTr.y;
        // bottom
      } else {
        // inner
        const local = toLocalPoint(origin, pointer);
        width = local.x - startLocalBl.x;
        height = local.y - startLocalTr.y;
      }
      break;
    }
    case 'bl': {
      let p: fabric.Point | Point;
      const localPointer = toLocalPoint(origin, pointer, 'left', 'bottom');

      if (localPointer.x < 0 && localPointer.y > 0) {
        // left bottom
        p = linearsIntersection(linearFunction(BL, TL), linearFunction(tl, tr));
        const startLocalTl = toLocalPoint(origin, opts.coords.tl);
        const startLocalTr = toLocalPoint(origin, opts.coords.tr);
        width = startLocalTr.x;
        height = toLocalPoint(origin, BL).y - startLocalTl.y;
      } else if (localPointer.x < 0) {
        // left
        p = linearsIntersection(linearFunction(BL, TL), linearFunction(tl, tr));
        const local = toLocalPoint(origin, pointer);
        const startLocalTl = toLocalPoint(origin, opts.coords.tl);
        const startLocalTr = toLocalPoint(origin, opts.coords.tr);
        width = startLocalTr.x;
        height = local.y - startLocalTl.y;
      } else if (localPointer.y > 0) {
        // bottom
        p = pedalPoint(pointer, linearFunction(tl, tr));
        const local = toLocalPoint(origin, pointer);
        const startLocalTl = toLocalPoint(origin, opts.coords.tl);
        const startLocalBr = toLocalPoint(origin, opts.coords.br);
        width = startLocalBr.x - local.x;
        height = toLocalPoint(origin, BL).y - startLocalTl.y;
      } else {
        // inner
        p = pedalPoint(pointer, linearFunction(tl, tr));
        const local = toLocalPoint(origin, pointer);
        const startLocalTl = toLocalPoint(origin, opts.coords.tl);
        const startLocalBr = toLocalPoint(origin, opts.coords.br);
        width = startLocalBr.x - local.x;
        height = local.y - startLocalTl.y;
      }

      left = p.x;
      top = p.y;
      break;
    }
  }

  return { left, top, width: Math.max(width), height: Math.max(height), scaleX: 1, scaleY: 1, flipX, flipY };
}

function wrapScaleEvent(origin: fabric.Object, e: fabric.IEvent, point: { in: Point; outX: Point; outY: Point; outXY: Point }) {
  const pointer = e.pointer as fabric.Point;
  const local = getLocalPoint(pointer, origin, e.transform?.corner as string);
  if (local.x < 0 && local.y < 0) {
    // out corner
    return {
      point: point.outXY,
      localPoint: toLocalPoint(origin, new fabric.Point(point.outXY.x, point.outXY.y)),
    };
  } else if (local.x < 0) {
    // out left/right border
    return {
      point: point.outX,
      localPoint: toLocalPoint(origin, new fabric.Point(point.outX.x, point.outX.y)),
    };
  } else if (local.y < 0) {
    // out top/bottom border
    return {
      point: point.outY,
      localPoint: toLocalPoint(origin, new fabric.Point(point.outY.x, point.outY.y)),
    };
  } else {
    // inner
    return {
      point: point.in,
      localPoint: toLocalPoint(origin, new fabric.Point(point.in.x, point.in.y)),
    };
  }
}

function getLocalPoint(point: fabric.Point, object: fabric.Object, corner: string) {
  let p = point;
  switch (corner) {
    case 'tl':
      p = object.toLocalPoint(point, 'left', 'top');
      break;
    case 'tr':
      p = object.toLocalPoint(point, 'right', 'top');
      p.x *= -1;
      break;
    case 'br':
      p = object.toLocalPoint(point, 'right', 'bottom');
      p.x *= -1;
      p.y *= -1;
      break;
    case 'bl':
      p = object.toLocalPoint(point, 'left', 'bottom');
      p.y *= -1;
      break;
  }
  return p;
}

/**
 * calculates the cropping target
 * @param target
 * @param origin
 * @returns
 */
export function getTargetCroppedProperties(target: fabric.Image, origin: fabric.Image) {
  const { width = 0, height = 0, scaleX = 1, scaleY = 1, flipX, flipY } = target;
  const { scaleX: oScaleX = 1, scaleY: oScaleY = 1 } = origin;
  const { tl: TL, tr: TR, br: BR, bl: BL } = origin.aCoords as ACoords;

  let point: fabric.Point;
  if (flipX && flipY) {
    point = target.toLocalPoint(BR, 'right', 'bottom');
  } else if (flipX) {
    point = target.toLocalPoint(TR, 'right', 'top');
  } else if (flipY) {
    point = target.toLocalPoint(BL, 'left', 'bottom');
  } else {
    point = target.toLocalPoint(TL, 'left', 'top');
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

/**
 * calculates the minimum scaleX/scaleY of the cropping origin
 * @param target
 * @param origin
 * @param linears
 * @param corner
 */
export function setOriginMinScale(target: fabric.Image, origin: fabric.Image, corner: string) {
  const { tl: TL, tr: TR, br: BR, bl: BL } = origin.aCoords as ACoords;
  const { width = 0, height = 0 } = origin;
  const min = getMinScaleWidthHeight(target, origin, corner);
  const opts: OriginOptions = {
    ...((origin as any)._opts as OriginOptions),
    minScaleX: Math.abs(min.x) / width,
    minScaleY: Math.abs(min.y) / height,
    diagonal: [linearFunction(TL, BR), linearFunction(TR, BL)],
    radio: width / height,
  };
  (origin as any)._opts = opts;
}

function getMinScaleWidthHeight(target: fabric.Object, origin: fabric.Object, corner: string) {
  const coords = target.aCoords as ACoords;
  let min = { x: origin.width || 0, y: origin.height || 0 };
  switch (corner) {
    case 'tl':
      min = origin.toLocalPoint(coords[corner], 'right', 'bottom');
      break;
    case 'tr':
      min = origin.toLocalPoint(coords[corner], 'left', 'bottom');
      break;
    case 'br':
      min = origin.toLocalPoint(coords[corner], 'left', 'top');
      break;
    case 'bl':
      min = origin.toLocalPoint(coords[corner], 'right', 'top');
      break;
  }
  return min;
}

/**
 * calculates the current scaleX/scaleY of the cropping origin
 * @param target
 * @param origin
 * @param e
 * @returns
 */
export function getOriginScaleProperties(target: fabric.Image, origin: fabric.Image, corner: string) {
  let scaleX = origin.scaleX || 1;
  let scaleY = origin.scaleY || 1;

  (origin as any)._opts = { lastScaleX: 1, lastScaleY: 1, ...(origin as any)?._opts };
  const opts = (origin as any)._opts as OriginOptions;
  const { tl, tr, br, bl } = target.aCoords as ACoords;
  const { tl: TL, tr: TR, bl: BL } = origin.aCoords as ACoords;

  if (scaleX <= opts.minScaleX) {
    switch (corner) {
      case 'tl': {
        const p = linearsIntersection(opts.diagonal[0], linearFunction(bl, tl));
        setOriginScalePosition(origin, corner, p);
        break;
      }
      case 'tr': {
        const p1 = linearsIntersection(opts.diagonal[1], linearFunction(tr, br));
        const p = pedalPoint(p1, linearFunction(BL, TL));
        setOriginScalePosition(origin, corner, p);
        break;
      }
      case 'br': {
        const p1 = linearsIntersection(opts.diagonal[0], linearFunction(tr, br));
        const p = pedalPoint(p1, linearFunction(BL, TL));
        setOriginScalePosition(origin, corner, p);
        break;
      }
      case 'bl': {
        const p1 = linearsIntersection(opts.diagonal[1], linearFunction(bl, tl));
        const p = pedalPoint(p1, linearFunction(TL, TR));
        setOriginScalePosition(origin, corner, p);
        break;
      }
    }
    scaleX = opts.minScaleX;
    scaleY = opts.minScaleX * opts.radio;
  }

  if (scaleY <= opts.minScaleY) {
    switch (corner) {
      case 'tl': {
        const p = linearsIntersection(opts.diagonal[0], linearFunction(tl, tr));
        setOriginScalePosition(origin, corner, p);
        break;
      }
      case 'tr': {
        const p1 = linearsIntersection(opts.diagonal[1], linearFunction(tl, tr));
        const p = pedalPoint(p1, linearFunction(BL, TL));
        setOriginScalePosition(origin, corner, p);
        break;
      }
      case 'br': {
        const p1 = linearsIntersection(opts.diagonal[0], linearFunction(tl, tr));
        const p = pedalPoint(p1, linearFunction(BL, TL));
        setOriginScalePosition(origin, corner, p);
        break;
      }
      case 'bl': {
        const p1 = linearsIntersection(opts.diagonal[1], linearFunction(bl, br));
        const p = pedalPoint(p1, linearFunction(TL, TR));
        setOriginScalePosition(origin, corner, p);
        break;
      }
    }
    scaleY = opts.minScaleY;
    scaleX = opts.minScaleY / opts.radio;
  }

  return { scaleX, scaleY };
}

/**
 * 在缩放过程中，当限制限制住 scaleX/scaleY 时，除 mr、br、mb 外的所有控制点，事件都会移动图像，
 * 因为在此过程中只限制了缩放，但实际这些控制点在缩放时都会造成对象 left/top 的变化，
 * 所以必须进行强制操作，将它们的 left/top 回正。
 * @param target
 * @param origin
 * @param e
 * @param by
 * @returns
 */
function getOriginScalePosition(target: fabric.Image, origin: fabric.Image, e: fabric.IEvent, by: 'x' | 'y') {
  const { tl, tr, bl } = target.aCoords as ACoords;
  const { tl: TL, tr: TR, bl: BL } = origin.aCoords as ACoords;

  switch (e.transform?.corner) {
    case 'tl':
      return by === 'x'
        ? linearsIntersection(linearFunction(bl, tl), linearFunction(TL, TR))
        : linearsIntersection(linearFunction(tl, tr), linearFunction(BL, TL));
    case 'tr':
      return by === 'x'
        ? linearsIntersection(linearFunction(BL, TL), linearFunction(TL, TR))
        : linearsIntersection(linearFunction(BL, TL), linearFunction(tl, tr));
    case 'bl':
      return by === 'x'
        ? linearsIntersection(linearFunction(bl, tl), linearFunction(TL, TR))
        : linearsIntersection(linearFunction(BL, TL), linearFunction(TL, TR));
  }
}

function setOriginScalePosition(origin: fabric.Image, corner: string, point: Point) {
  ['tl', 'tr', 'bl'].includes(corner) && origin.setPositionByOrigin(new fabric.Point(point.x, point.y), 'left', 'top');
}

export function setOriginMoveRectRange(target: fabric.Image, origin: fabric.Image, e: fabric.IEvent) {
  const pointer = e.pointer as fabric.Point;
  const { left = 0, top = 0, angle } = origin;
  const { tl, tr, br, bl } = target.aCoords as ACoords;
  const { tl: TL, tr: TR, br: BR, bl: BL } = origin.aCoords as ACoords;
  const moveRegionTl = { x: pointer.x - (BR.x - br.x), y: pointer.y - (BR.y - br.y) };

  const topPedal = pedalPoint(pointer, linearFunction(TL, TR));
  const leftPedal = pedalPoint(pointer, linearFunction(BL, TL));

  const linears = {
    left: linearFunction(BL, TL),
    top: linearFunction(TL, TR),
    right: linearFunction(TR, BR),
    bottom: linearFunction(BR, BL),
  };

  let opts: OriginOptions = {
    ...((origin as any)._opts as OriginOptions),
    position: { x: left, y: top },
    pointer,
    moveRegion: new fabric.Rect({
      left: moveRegionTl.x,
      top: moveRegionTl.y,
      width: origin.getScaledWidth() - target.getScaledWidth(),
      height: origin.getScaledHeight() - target.getScaledHeight(),
      angle,
    }),
    pedals: {
      top: { x: topPedal.x - pointer.x, y: topPedal.y - pointer.y },
      left: { x: leftPedal.x - pointer.x, y: leftPedal.y - pointer.y },
    },
    linears: {
      left: linearFunctionMove(linears.left, Number.isFinite(linears.left.k) ? linearFunction(tr, br).b - linears.right.b : br.x - BR.x) as any,
      top: linearFunctionMove(linears.top, Number.isFinite(linears.top.k) ? linearFunction(br, bl).b - linears.bottom.b : br.x - BR.x) as any,
      right: linearFunction(bl, tl),
      bottom: linearFunction(tl, tr),
    },
  };
  (origin as any)._opts = opts;
}

export function getOriginMoveProperty(target: fabric.Image, origin: fabric.Image, e: fabric.IEvent) {
  const { tl, tr, bl } = target.aCoords as ACoords;
  const pointer = e.pointer as fabric.Point;
  const opts = (origin as any)._opts as OriginOptions;
  const local = opts.moveRegion.toLocalPoint(pointer, 'left', 'top');
  const { width = 0, height = 0 } = opts.moveRegion;
  let point: { x: number; y: number };
  if (local.x <= 0 && local.y <= 0) {
    // mouse cross the right bottom border
    point = linearsIntersection(opts.linears.left, opts.linears.top);
  } else if (local.x <= 0 && local.y >= height) {
    // mouse cross the right top border
    point = linearsIntersection(opts.linears.left, opts.linears.bottom);
  } else if (local.x >= width && local.y <= 0) {
    // mouse cross the left bottom border
    point = linearsIntersection(opts.linears.right, opts.linears.top);
  } else if (local.x >= width && local.y >= height) {
    // mouse cross the left top border
    point = linearsIntersection(opts.linears.right, opts.linears.bottom);
  } else if (local.x <= 0) {
    // mouse cross the right border
    const linear = opts.linears.left;
    point = linearsIntersection(linear, perpendicularLinear({ x: pointer.x + opts.pedals.top.x, y: pointer.y + opts.pedals.top.y }, linear));
  } else if (local.x >= width) {
    // mouse cross the left border
    const linear = linearFunction(bl, tl);
    point = linearsIntersection(linear, perpendicularLinear({ x: pointer.x + opts.pedals.top.x, y: pointer.y + opts.pedals.top.y }, linear));
  } else if (local.y <= 0) {
    // mouse cross the bottom border
    const linear = opts.linears.top;
    point = linearsIntersection(linear, perpendicularLinear({ x: pointer.x + opts.pedals.left.x, y: pointer.y + opts.pedals.left.y }, linear));
  } else if (local.y >= height) {
    // mouse cross the top border
    const linear = linearFunction(tl, tr);
    point = linearsIntersection(linear, perpendicularLinear({ x: pointer.x + opts.pedals.left.x, y: pointer.y + opts.pedals.left.y }, linear));
  } else {
    // inner
    point = { x: opts.position.x + (pointer.x - opts.pointer.x), y: opts.position.y + (pointer.y - opts.pointer.y) };
  }
  return { left: point.x, top: point.y };
}
