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

export function updateMinions(croppingTarget: fabric.Object) {
  const croppingOrigin = (croppingTarget as any).croppingOrigin as fabric.Object;
  // 直接返回
  if ((croppingTarget as any).cropping || !(croppingOrigin as any).relationship) {
    return;
  }

  const relationship: number[] = (croppingOrigin as any).relationship;

  // 将两个矩阵变换叠加，得到新的变换规则
  const newTransform = fabric.util.multiplyTransformMatrices(
    // 返回当前 “主人” 经过 move/rotate/... 操作后的变换矩阵
    croppingTarget.calcTransformMatrix(),
    // 和 “主随关系” 矩阵相叠加
    relationship
  );

  // 将包含6个数字元素的数组转换为属性的集合
  const opt = fabric.util.qrDecompose(newTransform);

  const originalFlipX = croppingTarget.flipX;
  const originalFlipY = croppingTarget.flipY;
  // 设置“随从” X/Y 轴平方向都不翻转
  croppingOrigin.set({
    flipX: false,
    flipY: false,
    scaleX: opt.scaleX,
    scaleY: opt.scaleY,
    skewX: opt.skewX,
    skewY: opt.skewY,
  });

  if (originalFlipX !== croppingOrigin.flipX || originalFlipY !== croppingOrigin.flipY) {
    croppingOrigin.flipX = originalFlipX;
    croppingOrigin.flipY = originalFlipY;
    opt.angle -= 180;
  }
  croppingOrigin.angle = opt.angle;

  // 设置“随从”原点的位置，这里将矩形的中心作为原点
  croppingOrigin.setPositionByOrigin(new fabric.Point(opt.translateX, opt.translateY), 'center', 'center');

  // 将上面从矩阵数组转换而得到的属性集合对象作为“随从”的新配置
  // set 方法并不能让和坐标相关的矩阵变换生效，所以还需要再执行下面的方法
  croppingOrigin.setCoords();
}

export function bindFollow(croppingTarget: fabric.Object) {
  if ((croppingTarget as any).cropping) {
    return false;
  }
  const croppingOrigin = (croppingTarget as any).croppingOrigin as fabric.Object;

  // 计算裁切对象当前的变换矩阵，并得到逆转变换
  const bossTransform = croppingTarget.calcTransformMatrix();
  const invertedBossTransform = fabric.util.invertTransform(bossTransform);
  // 关键：拿到能描述 裁切对象和原图对象 关系的变换矩阵
  // 该方法接收三个参数，前两个参数不分先后
  const desiredTransform = fabric.util.multiplyTransformMatrices(
    invertedBossTransform,
    // 返回原图对象的变换矩阵
    croppingOrigin.calcTransformMatrix()
  );

  // 将“主随关系”的变换矩阵保存在“随从”上
  (croppingOrigin as any).relationship = desiredTransform;
}

export function setCroppingControls(croppingTarget: fabric.Image, croppingOrigin: fabric.Image) {
  croppingOrigin
    .setControlsVisibility({
      mtr: false,
      ml: false,
      mt: false,
      mr: false,
      mb: false,
    })
    .set({
      lockSkewingX: true,
      lockSkewingY: true,
      lockScalingFlip: true,
      opacity: 0.6,
    });

  croppingTarget
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
    });
  (croppingTarget as any).cropping = true;
}

export function setUnCroppingControls(croppingTarget: fabric.Image) {
  croppingTarget
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
      lockScalingFlip: false,
    });
  (croppingTarget as any).cropping = false;
}

/**
 * calculates the maximum width/height of the cropping target
 * @param croppingTarget
 * @param croppingOrigin
 * @param corner
 */
export function setTargetScaleWidthAndHeight(croppingTarget: fabric.Image, croppingOrigin: fabric.Image, corner?: string) {
  const { width = 0, height = 0 } = croppingTarget;
  const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1 } = croppingOrigin;
  const { tl, tr, br, bl } = croppingTarget.get('aCoords') as ACoords;
  const { tl: TL, tr: TR, br: BR } = croppingOrigin.get('aCoords') as ACoords;

  const leftLinear = linearFunction(tl, bl);
  const topLinear = linearFunction(tl, tr);
  const rightLinear = linearFunction(tr, br);
  const bottomLinear = linearFunction(br, bl);

  const leftDistance = Math.abs(pointToLinearDistance(TL, leftLinear));
  const topDistance = Math.abs(pointToLinearDistance(TL, topLinear));
  const rightDistance = Math.abs(pointToLinearDistance(TR, rightLinear));
  const bottomDistance = Math.abs(pointToLinearDistance(BR, bottomLinear));

  (croppingTarget as any)._opts = { scaleWidth: Infinity, scaleHeight: Infinity, ...(croppingTarget as any)._opts };
  const opts = (croppingTarget as any)._opts as { scaleWidth: number; scaleHeight: number };

  switch (corner) {
    case 'ml':
      opts.scaleWidth = width * imageScaleX + leftDistance;
      break;
    case 'mr':
      opts.scaleWidth = width * imageScaleX + rightDistance;
      break;
    case 'mt':
      opts.scaleHeight = height * imageScaleY + topDistance;
      break;
    case 'mb':
      opts.scaleHeight = height * imageScaleY + bottomDistance;
      break;
    case 'tl':
      opts.scaleWidth = width * imageScaleX + leftDistance;
      opts.scaleHeight = height * imageScaleY + topDistance;
      break;
    case 'tr':
      opts.scaleWidth = width * imageScaleX + rightDistance;
      opts.scaleHeight = height * imageScaleY + topDistance;
      break;
    case 'br':
      opts.scaleWidth = width * imageScaleX + rightDistance;
      opts.scaleHeight = height * imageScaleY + bottomDistance;
      break;
    case 'bl':
      opts.scaleWidth = width * imageScaleX + leftDistance;
      opts.scaleHeight = height * imageScaleY + bottomDistance;
      break;
  }
}

export function setTargetScaleCroods(croppingTarget: fabric.Image, corner?: string) {
  if (!corner) {
    return;
  }
  const { tl, tr, br, bl } = croppingTarget.get('aCoords') as ACoords;
  (croppingTarget as any)._opts = { ...(croppingTarget as any)._opts };
  const opts = (croppingTarget as any)._opts as { croods: ACoords };
  opts.croods = { tl, tr, br, bl };
}

/**
 * calculates the current croods of the cropping target
 * @param croppingTarget
 * @param croppingOrigin
 * @param e
 * @returns
 */
/*  export function getTargetScaleProperties(croppingTarget: fabric.Image) {
  // lower fabric version 4.3.1
  const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = croppingTarget;
  const opts = (croppingTarget as any)._opts as { scaleWidth: number; scaleHeight: number };
  return { scaleX: Math.min(scaleX, opts.scaleWidth / width), scaleY: Math.min(scaleY, opts.scaleHeight / height) };
} */
export function getTargetScaleProperties(croppingTarget: fabric.Image, croppingOrigin: fabric.Image, e: fabric.IEvent) {
  let { width = 0, height = 0, left = 0, top = 0 } = croppingTarget;
  const { tl, tr, bl } = croppingTarget.get('aCoords') as ACoords;
  const { tl: TL, tr: TR, br: BR, bl: BL } = croppingOrigin.aCoords as ACoords;
  const opts = (croppingTarget as any)._opts as { scaleWidth: number; scaleHeight: number; croods: ACoords };

  const pointer = e.pointer as fabric.Point;

  switch (e.transform?.corner) {
    case 'ml':
      break;
    case 'mr':
      break;
    case 'mt':
      break;
    case 'mb':
      break;
    case 'tl': {
      let local: fabric.Point;
      let p: fabric.Point | Point;
      const localPointer = toLocalPoint(croppingOrigin, pointer);

      if (localPointer.x < 0 && localPointer.y < 0) {
        // left top
        p = TL;
        local = toLocalPoint(croppingOrigin, TL);
      } else if (localPointer.x < 0) {
        // left
        p = pedalPoint(pointer, linearFunction(BL, TL));
        local = toLocalPoint(croppingOrigin, new fabric.Point(p.x, p.y));
      } else if (localPointer.y < 0) {
        // top
        p = pedalPoint(pointer, linearFunction(TL, TR));
        local = toLocalPoint(croppingOrigin, new fabric.Point(p.x, p.y));
      } else {
        // inner
        p = pointer;
        local = toLocalPoint(croppingOrigin, pointer);
      }

      left = p.x;
      top = p.y;
      const startLocalBl = toLocalPoint(croppingOrigin, opts.croods.bl);
      const startLocalTr = toLocalPoint(croppingOrigin, opts.croods.tr);
      width = startLocalTr.x - local.x;
      height = startLocalBl.y - local.y;
      break;
    }
    case 'tr': {
      let p: fabric.Point | Point;
      const localPointer = toLocalPoint(croppingOrigin, pointer, 'right', 'top');
      const startLocalTl = toLocalPoint(croppingOrigin, opts.croods.tl);
      const startLocalBr = toLocalPoint(croppingOrigin, opts.croods.br);

      if (localPointer.x > 0 && localPointer.y < 0) {
        // right top
        p = linearsIntersection(linearFunction(bl, tl), linearFunction(TL, TR));
        const local = toLocalPoint(croppingOrigin, TR);
        width = local.x - startLocalTl.x;
        height = startLocalBr.y - local.y;
      } else if (localPointer.x > 0) {
        // right
        p = pedalPoint(pointer, linearFunction(bl, tl));
        const local = toLocalPoint(croppingOrigin, new fabric.Point(p.x, p.y));
        width = toLocalPoint(croppingOrigin, TR).x - startLocalTl.x;
        height = startLocalBr.y - local.y;
      } else if (localPointer.y < 0) {
        // top
        p = linearsIntersection(linearFunction(bl, tl), linearFunction(TL, TR));
        const local = toLocalPoint(croppingOrigin, pointer);
        width = local.x - startLocalTl.x;
        height = startLocalBr.y;
      } else {
        // inner
        p = pedalPoint(pointer, linearFunction(bl, tl));
        const local = toLocalPoint(croppingOrigin, pointer);
        width = local.x - startLocalTl.x;
        height = startLocalBr.y - local.y;
      }

      left = p.x;
      top = p.y;
      break;
    }
    case 'br': {
      const localPointer = toLocalPoint(croppingOrigin, pointer, 'right', 'bottom');
      const startLocalBl = toLocalPoint(croppingOrigin, opts.croods.bl);
      const startLocalTr = toLocalPoint(croppingOrigin, opts.croods.tr);

      if (localPointer.x > 0 && localPointer.y > 0) {
        width = toLocalPoint(croppingOrigin, BR).x - startLocalBl.x;
        height = toLocalPoint(croppingOrigin, BR).y - startLocalTr.y;
        // right bottom
      } else if (localPointer.x > 0) {
        const local = toLocalPoint(croppingOrigin, pointer);
        width = toLocalPoint(croppingOrigin, BR).x - startLocalBl.x;
        height = local.y - startLocalTr.y;
        // right
      } else if (localPointer.y > 0) {
        const local = toLocalPoint(croppingOrigin, pointer);
        width = local.x - startLocalBl.x;
        height = toLocalPoint(croppingOrigin, BR).y - startLocalTr.y;
        // bottom
      } else {
        // inner
        const local = toLocalPoint(croppingOrigin, pointer);
        width = local.x - startLocalBl.x;
        height = local.y - startLocalTr.y;
      }
      break;
    }
    case 'bl': {
      let p: fabric.Point | Point;
      const localPointer = toLocalPoint(croppingOrigin, pointer, 'left', 'bottom');

      if (localPointer.x < 0 && localPointer.y > 0) {
        // left bottom
        p = linearsIntersection(linearFunction(BL, TL), linearFunction(tl, tr));
        const startLocalTl = toLocalPoint(croppingOrigin, opts.croods.tl);
        const startLocalTr = toLocalPoint(croppingOrigin, opts.croods.tr);
        width = startLocalTr.x;
        height = toLocalPoint(croppingOrigin, BL).y - startLocalTl.y;
      } else if (localPointer.x < 0) {
        // left
        p = linearsIntersection(linearFunction(BL, TL), linearFunction(tl, tr));
        const local = toLocalPoint(croppingOrigin, pointer);
        const startLocalTl = toLocalPoint(croppingOrigin, opts.croods.tl);
        const startLocalTr = toLocalPoint(croppingOrigin, opts.croods.tr);
        width = startLocalTr.x;
        height = local.y - startLocalTl.y;
      } else if (localPointer.y > 0) {
        // bottom
        p = pedalPoint(pointer, linearFunction(tl, tr));
        const local = toLocalPoint(croppingOrigin, pointer);
        const startLocalTl = toLocalPoint(croppingOrigin, opts.croods.tl);
        const startLocalBr = toLocalPoint(croppingOrigin, opts.croods.br);
        width = startLocalBr.x - local.x;
        height = toLocalPoint(croppingOrigin, BL).y - startLocalTl.y;
      } else {
        // inner
        p = pedalPoint(pointer, linearFunction(tl, tr));
        const local = toLocalPoint(croppingOrigin, pointer);
        const startLocalTl = toLocalPoint(croppingOrigin, opts.croods.tl);
        const startLocalBr = toLocalPoint(croppingOrigin, opts.croods.br);
        width = startLocalBr.x - local.x;
        height = local.y - startLocalTl.y;
      }

      left = p.x;
      top = p.y;
      break;
    }
  }

  return { left, top, width, height, scaleX: 1, scaleY: 1 };
}

/**
 * calculates the cropping target
 * @param croppingTarget
 * @param croppingOrigin
 * @returns
 */
export function getTargetCroppedProperties(croppingTarget: fabric.Image, croppingOrigin: fabric.Image) {
  const { width = 0, height = 0, scaleX = 1, scaleY = 1, flipX = false, flipY = false } = croppingTarget;
  const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1 } = croppingOrigin;
  const { tl: TL, tr: TR, br: BR, bl: BL } = croppingOrigin.aCoords as ACoords;

  let point: fabric.Point;

  if (flipX && flipY) {
    point = croppingTarget.toLocalPoint(new fabric.Point(BR.x, BR.y), 'right', 'bottom');
  } else if (flipX) {
    point = croppingTarget.toLocalPoint(new fabric.Point(TR.x, TR.y), 'right', 'top');
  } else if (flipY) {
    point = croppingTarget.toLocalPoint(new fabric.Point(BL.x, BL.y), 'left', 'bottom');
  } else {
    point = croppingTarget.toLocalPoint(new fabric.Point(TL.x, TL.y), 'left', 'top');
  }

  return {
    width: (width * scaleX) / imageScaleX,
    height: (height * scaleY) / imageScaleY,
    cropX: Math.abs(point.x) / imageScaleX,
    cropY: Math.abs(point.y) / imageScaleY,
    scaleX: imageScaleX,
    scaleY: imageScaleY,
  };
}

/**
 * calculates the minimum scaleX/scaleY of the cropping origin
 * @param croppingTarget
 * @param croppingOrigin
 * @param linears
 * @param corner
 */
export function setOriginMinScale(croppingTarget: fabric.Image, croppingOrigin: fabric.Image, linears: CoordsLinears, corner: string | undefined) {
  const { tl, tr, bl } = croppingTarget.get('aCoords') as ACoords;
  const { width = 0, height = 0 } = croppingOrigin;

  (croppingOrigin as any)._opts = { minScaleX: 1, minScaleY: 1, ...(croppingOrigin as any)._opts };
  const opts = (croppingOrigin as any)._opts as { minScaleX: number; minScaleY: number };

  let scaleX: number = opts.minScaleX;
  let scaleY: number = opts.minScaleY;

  switch (corner) {
    case 'ml':
      scaleX = Math.abs(pointToLinearDistance(tl, linears.right)) / width;
      break;
    case 'mr':
      scaleX = Math.abs(pointToLinearDistance(tr, linears.left)) / width;
      break;
    case 'mt':
      scaleY = Math.abs(pointToLinearDistance(tl, linears.bottom)) / height;
      break;
    case 'mb':
      scaleY = Math.abs(pointToLinearDistance(bl, linears.top)) / height;
      break;
    case 'tl':
      scaleX = Math.abs(pointToLinearDistance(tl, linears.right)) / width;
      scaleY = Math.abs(pointToLinearDistance(tl, linears.bottom)) / height;
      break;
    case 'tr':
      scaleX = Math.abs(pointToLinearDistance(tr, linears.left)) / width;
      scaleY = Math.abs(pointToLinearDistance(tl, linears.bottom)) / height;
      break;
    case 'br':
      scaleX = Math.abs(pointToLinearDistance(tr, linears.left)) / width;
      scaleY = Math.abs(pointToLinearDistance(bl, linears.top)) / height;
      break;
    case 'bl':
      scaleX = Math.abs(pointToLinearDistance(tl, linears.right)) / width;
      scaleY = Math.abs(pointToLinearDistance(bl, linears.top)) / height;
      break;
  }

  opts.minScaleX = scaleX;
  opts.minScaleY = scaleY;
}

/**
 * calculates the current scaleX/scaleY of the cropping origin
 * @param croppingOrigin
 * @returns
 */
export function getOriginScaleProperties(croppingTarget: fabric.Image, croppingOrigin: fabric.Image, e: fabric.IEvent) {
  let scaleX = croppingOrigin.scaleX || 1;
  let scaleY = croppingOrigin.scaleY || 1;

  (croppingOrigin as any)._opts = { lastScaleX: 1, lastScaleY: 1, ...(croppingOrigin as any)?._opts };
  const opts = (croppingOrigin as any)._opts as {
    xl?: Point;
    yl?: Point;
    lastScaleX: number;
    lastScaleY: number;
    minScaleX: number;
    minScaleY: number;
  };

  if (scaleX <= opts.minScaleX) {
    scaleX = opts.minScaleX;
    scaleY = opts.lastScaleY;
    setOriginScalePosition(croppingOrigin, e, opts.xl);
  } else {
    opts.lastScaleY = scaleY;
    const xl = getOriginScalePosition(croppingTarget, croppingOrigin, e, 'x');
    xl && (opts.xl = xl);
  }

  if (scaleY <= opts.minScaleY) {
    scaleY = opts.minScaleY;
    scaleX = opts.lastScaleX;
    setOriginScalePosition(croppingOrigin, e, opts.yl);
  } else {
    opts.lastScaleX = scaleX;
    const yl = getOriginScalePosition(croppingTarget, croppingOrigin, e, 'y');
    yl && (opts.yl = yl);
  }

  return { scaleX, scaleY };
}

function getOriginScalePosition(croppingTarget: fabric.Image, croppingOrigin: fabric.Image, e: fabric.IEvent, by: 'x' | 'y') {
  const { tl, tr, bl } = croppingTarget.aCoords as ACoords;
  const { tl: TL, tr: TR, bl: BL } = croppingOrigin.aCoords as ACoords;

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

function setOriginScalePosition(croppingOrigin: fabric.Image, e: fabric.IEvent, point?: Point) {
  if (!point || !e.transform?.corner) {
    return;
  }
  ['tl', 'tr', 'bl'].includes(e.transform.corner) && croppingOrigin.setPositionByOrigin(new fabric.Point(point.x, point.y), 'left', 'top');
}

/**
 * calculates the moving area of the cropping origin
 * @param croppingTarget
 * @param croppingOrigin
 * @param linears
 */
export function setOriginMoveLinearsAndCroods(croppingTarget: fabric.Image, croppingOrigin: fabric.Image, linears: CoordsLinears) {
  const { angle = 0 } = croppingTarget;
  const { tl, tr, br, bl } = croppingTarget.aCoords as ACoords;
  const { br: BR } = croppingOrigin.aCoords as ACoords;

  const leftLinear = linearFunction(bl, tl);
  const topLinear = linearFunction(tl, tr);
  const rightLinear = linearFunction(tr, br);
  const bottomLinear = linearFunction(br, bl);

  const vLinear = linearFunctionMove(linears.left, Number.isFinite(linears.left.k) ? rightLinear.b - linears.right.b : br.x - BR.x);
  const hLinear = linearFunctionMove(linears.top, Number.isFinite(linears.top.k) ? bottomLinear.b - linears.bottom.b : br.x - BR.x);
  const cAngle = (angle % 360) + (angle < 0 ? 360 : 0);

  let moveLinears: CoordsLinears;

  if (cAngle < 90) {
    moveLinears = {
      left: vLinear as any,
      top: hLinear as any,
      right: leftLinear,
      bottom: topLinear,
    };
  } else if (cAngle < 180) {
    moveLinears = {
      left: topLinear,
      top: vLinear as any,
      right: hLinear as any,
      bottom: leftLinear,
    };
  } else if (cAngle < 270) {
    moveLinears = {
      left: leftLinear,
      top: topLinear,
      right: vLinear as any,
      bottom: hLinear as any,
    };
  } else {
    moveLinears = {
      left: hLinear as any,
      top: leftLinear,
      right: topLinear,
      bottom: vLinear as any,
    };
  }
  const coords = {
    tl: linearsIntersection(moveLinears.top, moveLinears.left),
    tr: linearsIntersection(moveLinears.top, moveLinears.right),
    br: linearsIntersection(moveLinears.bottom, moveLinears.right),
    bl: linearsIntersection(moveLinears.bottom, moveLinears.left),
  };

  (croppingOrigin as any)._opts = { moveLinears: {}, moveCoords: {}, ...(croppingOrigin as any)._opts };
  const opts = (croppingOrigin as any)._opts as { moveLinears: CoordsLinears; moveCoords: ACoords };
  opts.moveLinears = moveLinears;
  opts.moveCoords = coords as any;
}

/**
 * calculates the position of the cropping origin
 * @param croppingOrigin
 * @returns
 */
export function getOriginMoveProperties(croppingOrigin: fabric.Image) {
  const { left = 0, top = 0 } = croppingOrigin;
  const { tl: TL } = croppingOrigin.aCoords as ACoords;

  let l = left;
  let t = top;

  const opts = (croppingOrigin as any)._opts as { moveLinears: CoordsLinears; moveCoords: ACoords };

  const minL = opts.moveLinears.left.reverseFunc(TL.y);
  const maxL = opts.moveLinears.right.reverseFunc(TL.y);
  const minT = opts.moveLinears.top.func(TL.x);
  const maxT = opts.moveLinears.bottom.func(TL.x);

  if (left < minL) {
    if (top < minT) {
      l = opts.moveCoords.tl.x;
      t = opts.moveCoords.tl.y;
    } else if (top > maxT) {
      l = opts.moveCoords.bl.x;
      t = opts.moveCoords.bl.y;
    } else {
      l = minL;
    }
  } else if (left > maxL) {
    if (top > maxT) {
      l = opts.moveCoords.br.x;
      t = opts.moveCoords.br.y;
    } else if (top < minT) {
      l = opts.moveCoords.tr.x;
      t = opts.moveCoords.tr.y;
    } else {
      l = maxL;
    }
  } else {
    if (top < minT) {
      t = minT;
    } else if (top > maxT) {
      t = maxT;
    }
  }
  return { left: l, top: t };
}
