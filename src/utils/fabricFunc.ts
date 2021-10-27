import { fabric } from 'fabric';
import { linearFunction, LinearFunction, linearFunctionMove, linearsIntersection, pedalPoint, perpendicularLinear, Point } from './func';

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;

export interface CoordsLinears {
  left: LinearFunction;
  top: LinearFunction;
  right: LinearFunction;
  bottom: LinearFunction;
}

type Controls = 'bl' | 'br' | 'mb' | 'ml' | 'mr' | 'mt' | 'tl' | 'tr' | 'mtr';
type ControlsEvents = 'lockMovementX' | 'lockMovementY' | 'lockSkewingX' | 'lockSkewingY' | 'centeredScaling';

interface TargetOptions {
  bound?: boolean;
  cropping?: boolean;
  _opts: {
    controlsVisibility?: { [key in Controls]?: boolean };
    controlsEvents?: { [key in ControlsEvents]?: boolean };
    canvasCenteredScaling?: boolean;
    // origin: fabric.Image & OriginOptions;
    aCoords?: ACoords;
  };
}
interface OriginOptions {
  _opts: {
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
  };
}

const ORIGINAL_IMAGE_OPACITY = 0.8;
// 折线长度
const CORNER_LINE_LENGTH = 10;
// 折线宽度
const CORNER_LINE_WIDTH = 4;
const MIN_WIDTH = 50;
const MIN_HEIGHT = 50;

const controlsHidden: { [key in Controls]?: boolean } = { mtr: false, ml: false, mt: false, mr: false, mb: false };
const eventLock: { [key in ControlsEvents]?: boolean } = {
  lockMovementX: true,
  lockMovementY: true,
  lockSkewingX: true,
  lockSkewingY: true,
  centeredScaling: false,
};

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

/**
 * 初始化裁切事件
 * @param target 裁切对象
 * @param origin 原对象
 */
export function initializeCroppingEvents(target: fabric.Image, origin: fabric.Image) {
  const { lockMovementX, lockMovementY, lockSkewingX, lockSkewingY, centeredScaling } = target;
  const cTarget = target as fabric.Image & TargetOptions;
  const cOrigin = origin as fabric.Image & OriginOptions;
  // 设置原对象的属性
  cOrigin.setControlsVisibility(controlsHidden).set({
    ...eventLock,
    lockScalingFlip: true,
    centeredScaling: false,
    opacity: ORIGINAL_IMAGE_OPACITY,
  });
  // 设置裁切对象的属性
  cTarget.setControlsVisibility(controlsHidden).set(eventLock);
  //

  console.log(lockMovementX, lockMovementY);
  cTarget._opts = {
    ...cTarget._opts,
    controlsVisibility: Object.keys(cTarget.controls).reduce((opt: Record<string, boolean>, name) => {
      opt[name] = cTarget.isControlVisible(name);
      return opt;
    }, {}),
    controlsEvents: {
      lockMovementX,
      lockMovementY,
      lockSkewingX,
      lockSkewingY,
      centeredScaling,
    },
    canvasCenteredScaling: cTarget.canvas?.centeredScaling,
  };
  //
  cTarget.canvas && (cTarget.canvas.centeredScaling = false);
  // 设置裁切中控制器的样式
  Object.entries(defaultControls).map(([name, ctl]) => {
    cTarget.controls[name] = new fabric.Control({ ...ctl, render: renderIcon, sizeX: CORNER_LINE_LENGTH * 1.5, sizeY: CORNER_LINE_LENGTH * 1.5 });
  });
  // 清空裁切对象的最小缩放
  cTarget.set('minScaleLimit', undefined);
  // 进入裁切状态
  cTarget.cropping = true;
}

/**
 * 还原到裁切前的事件
 * @param target 裁切对象
 */
export function initializeUnCroppingEvents(target: fabric.Image) {
  const cTarget = target as fabric.Image & TargetOptions;
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
}

/**
 * 记录 target 缩放前的 aCoords
 * @param target
 */
export function setTargetScaleCroods(target: fabric.Image) {
  const cTarget = target as fabric.Image & TargetOptions;
  cTarget._opts = { ...cTarget._opts, aCoords: cTarget.aCoords as ACoords };
}

/**
 * calculates the current coords of the cropping target
 * @param cTarget
 * @param cOrigin
 * @param e
 * @returns
 */
export function getTargetScaleProperties(target: fabric.Image, origin: fabric.Image, e: fabric.IEvent) {
  let { width = 0, height = 0, left, top } = target;
  const { angle = 0, flipX, flipY } = origin;
  const { tl: TL, tr: TR, bl: BL } = origin.aCoords as ACoords;
  const { tl, tr, br, bl } = (target as fabric.Image & TargetOptions)._opts.aCoords as ACoords;
  const pointer = e.pointer as fabric.Point;
  const sin = Math.sin((angle * Math.PI) / 180);
  const cos = Math.cos((angle * Math.PI) / 180);
  const startLocalTl = toLocalPoint(origin, tl);
  const startLocalBr = toLocalPoint(origin, br);

  switch (e.transform?.corner) {
    case 'tl': {
      let local: fabric.Point;
      let p: fabric.Point | Point;
      const localPointer = toLocalPoint(origin, pointer);
      const x = br.x - MIN_HEIGHT * cos + MIN_WIDTH * sin;
      const y = br.y - MIN_HEIGHT * sin - MIN_WIDTH * cos;
      const endPointer = toLocalPoint(origin, new fabric.Point(x, y));

      if (localPointer.x >= endPointer.x && localPointer.y >= endPointer.y) {
        // right-bottom
        p = { x, y };
        local = toLocalPoint(origin, new fabric.Point(x, y));
      } else if (localPointer.x > endPointer.x && localPointer.y > 0 && localPointer.y < endPointer.y) {
        // right
        p = pedalPoint(pointer, perpendicularLinear({ x, y }, linearFunction(TL, TR)));
        local = toLocalPoint(origin, pointer);
      } else if (localPointer.x > 0 && localPointer.x < endPointer.x && localPointer.y > endPointer.y) {
        // bottom
        p = pedalPoint(pointer, perpendicularLinear({ x, y }, linearFunction(BL, TL)));
        local = toLocalPoint(origin, pointer);
      } else if (localPointer.x >= endPointer.x && localPointer.y <= 0) {
        // right-top
        p = pedalPoint({ x, y }, linearFunction(TL, TR));
        local = toLocalPoint(origin, new fabric.Point(p.x, p.y));
      } else if (localPointer.x <= 0 && localPointer.y >= endPointer.y) {
        // left-bottom
        p = pedalPoint({ x, y }, linearFunction(BL, TL));
        local = toLocalPoint(origin, new fabric.Point(p.x, p.y));
      } else if (localPointer.x < 0 && localPointer.y > 0 && localPointer.y < endPointer.y) {
        // left
        p = pedalPoint(pointer, linearFunction(BL, TL));
        local = toLocalPoint(origin, new fabric.Point(p.x, p.y));
      } else if (localPointer.x > 0 && localPointer.x < endPointer.x && localPointer.y < 0) {
        // top
        p = pedalPoint(pointer, linearFunction(TL, TR));
        local = toLocalPoint(origin, new fabric.Point(p.x, p.y));
      } else if (localPointer.x <= 0 && localPointer.y <= 0) {
        // left-top
        p = TL;
        local = toLocalPoint(origin, TL);
      } else {
        // console.log('inner');
        p = pointer;
        local = toLocalPoint(origin, pointer);
      }

      left = p.x;
      top = p.y;
      width = startLocalBr.x - local.x;
      height = startLocalBr.y - local.y;
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
      const local = toLocalPoint(origin, pointer);
      width = Math.min(local.x, origin.getScaledWidth()) - startLocalTl.x;
      height = startLocalBr.y - Math.max(local.y, 0);
      break;
    }
    case 'br': {
      left = tl.x;
      top = tl.y;
      const local = toLocalPoint(origin, pointer);
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
      const local = toLocalPoint(origin, pointer);
      width = startLocalBr.x - Math.max(local.x, 0);
      height = Math.min(local.y, origin.getScaledHeight()) - startLocalTl.y;
      break;
    }
  }

  return { left, top, width: Math.max(width, MIN_WIDTH), height: Math.max(height, MIN_HEIGHT), scaleX: 1, scaleY: 1, flipX, flipY };
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

  const cOrigin = origin as fabric.Image & OriginOptions;
  cOrigin._opts = {
    ...cOrigin._opts,
    minScaleX: Math.abs(min.x) / width,
    minScaleY: Math.abs(min.y) / height,
    diagonal: [linearFunction(TL, BR), linearFunction(TR, BL)],
    radio: width / height,
  };
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

  const opts = (origin as fabric.Image & OriginOptions)._opts;
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

function setOriginScalePosition(origin: fabric.Image, corner: string, point: Point) {
  ['tl', 'tr', 'bl'].includes(corner) && origin.setPositionByOrigin(new fabric.Point(point.x, point.y), 'left', 'top');
}

/**
 *
 * @param target cropped image 裁切图像
 * @param origin original image 原图像
 * @param e e event 事件对象
 */
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

  const cOrigin = origin as fabric.Image & OriginOptions;
  cOrigin._opts = {
    ...cOrigin._opts,
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
}

/**
 * Limit the movement range of the cut image and obtain its left and top.
 * 限制裁切图像的移动范围并获取它的的 left 和 top
 * @param target cropped image 裁切图像
 * @param origin original image 原图像
 * @param e event 事件对象
 * @returns left and top of the cropped image 裁切图像的 left 和 top
 */
export function getOriginMovingProperties(target: fabric.Image, origin: fabric.Image, e: fabric.IEvent) {
  const { tl, tr, bl } = target.aCoords as ACoords;
  const pointer = e.pointer as fabric.Point;
  const opts = (origin as fabric.Image & OriginOptions)._opts;
  const local = toLocalPoint(opts.moveRegion, pointer);
  const { width = 0, height = 0 } = opts.moveRegion;
  let point: { x: number; y: number };
  if (local.x <= 0 && local.y <= 0) {
    // mouse cross the right-bottom border
    point = linearsIntersection(opts.linears.left, opts.linears.top);
  } else if (local.x <= 0 && local.y >= height) {
    // mouse cross the right-top border
    point = linearsIntersection(opts.linears.left, opts.linears.bottom);
  } else if (local.x >= width && local.y <= 0) {
    // mouse cross the left-bottom border
    point = linearsIntersection(opts.linears.right, opts.linears.top);
  } else if (local.x >= width && local.y >= height) {
    // mouse cross the left-top border
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
