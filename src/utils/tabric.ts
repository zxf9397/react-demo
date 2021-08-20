import { fabric } from 'fabric';

const CONTROLS = ['bl', 'br', 'mb', 'ml', 'mr', 'mt', 'tl', 'tr', 'mtr'] as const;
type ControlType = typeof CONTROLS[number];

interface Point extends Pick<fabric.Point, 'x' | 'y'> {}

interface LinearFunctionDefault {
  k: number;
  b: number;
  func: (x: number) => number;
  reverseFunc: (y: number) => number;
}

interface LinearFunction {
  k: number;
  b: number;
  func: (x: number) => number;
  reverseFunc: (y: number) => number;
  A: Point;
  B: Point;
}

type ActionHandler = (eventData: MouseEvent, transform: fabric.Transform, x: number, y: number) => boolean;

type WrapWithFireEvent = (eventName: string, actionHandler: ActionHandler) => ActionHandler;
type WrapWithFixedAnchor = (actionHandler: ActionHandler) => ActionHandler;

const scaleCursorStyleHandler = (fabric as any).controlsUtils.scaleCursorStyleHandler;
const scalingX = (fabric as any).controlsUtils.scalingX;

function wrapWithFixedAnchor(actionHandler: ActionHandler) {
  return function (e: MouseEvent, transform: fabric.Transform, x: number, y: number) {
    const target = transform.target;
    const centerPoint = target.getCenterPoint();
    const constraint = target.translateToOriginPoint(centerPoint, transform.originX, transform.originY);
    const actionPerformed = actionHandler(e, transform, x, y);
    target.setPositionByOrigin(constraint, transform.originX, transform.originY);
    return actionPerformed;
  };
}

function wrapWithFireEvent(eventName: string, actionHandler: ActionHandler) {
  return function (e: MouseEvent, transform: fabric.Transform, x: number, y: number) {
    var actionPerformed = actionHandler(e, transform, x, y);
    if (actionPerformed) {
      fireEvent(eventName, commonEventInfo(e, transform, x, y));
    }
    return actionPerformed;
  };
}

function fireEvent(eventName: string, options: { e: MouseEvent; transform: fabric.Transform; pointer: { x: number; y: number } }) {
  const target = options.transform.target;
  const canvas = target.canvas;
  const canvasOptions = fabric.util.object.clone(options);
  canvasOptions.target = target;
  canvas && canvas.fire('object:' + eventName, canvasOptions);
  target.fire(eventName, options);
}

function commonEventInfo(e: MouseEvent, transform: fabric.Transform, x: number, y: number) {
  return {
    e,
    transform,
    pointer: {
      x: x,
      y: y,
    },
  };
}

function getLocalPoint(transform: fabric.Transform, originX: string, originY: string, x: number, y: number) {
  const target = transform.target;
  const control = target.controls[transform.corner];
  const zoom = target.canvas?.getZoom() || 1;
  const padding = (target.padding || 0) / zoom;
  const localPoint = target.toLocalPoint(new fabric.Point(x, y), originX, originY);
  if (localPoint.x >= padding) {
    localPoint.x -= padding;
  }
  if (localPoint.x <= -padding) {
    localPoint.x += padding;
  }
  if (localPoint.y >= padding) {
    localPoint.y -= padding;
  }
  if (localPoint.y <= padding) {
    localPoint.y += padding;
  }
  localPoint.x -= control.offsetX;
  localPoint.y -= control.offsetY;
  return localPoint;
}

interface EventTransform {
  corner: ControlType;
  original: fabric.Object;
  originX: string;
  originY: string;
  width: number;
}

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;

function cropX(container: fabric.Object, options: { by?: 'left' | 'right' }) {
  return function (e: MouseEvent, transform: fabric.Transform, _x: number, _y: number) {
    const point = getLocalPoint(transform, transform.originX, transform.originY, _x, _y);
    const klass = transform.target;
    const scaleWidth = container.getScaledWidth();
    const { tl, bl, tr } = klass.aCoords as ACoords;
    const { tl: TL, bl: BL } = container.aCoords as ACoords;
    const { angle = 0, width = 0 } = klass;
    let x = options.by === 'left' ? -point.x : point.x;

    (klass as any).pad = { left: 0, top: 0, right: 0, bottom: 0, ...(klass as any).pad };

    let distance = 0;
    const ang = (angle < 0 ? 360 : 0) + (angle % 360);
    if (ang === 0) {
      distance = tl.x - TL.x;
    } else if (ang === 90) {
      distance = tl.y - TL.y;
    } else if (ang === 180) {
      distance = TL.x - tl.x;
    } else if (ang === 270) {
      distance = TL.y - tl.y;
    } else if (ang < 180) {
      distance = -pointToLinearDistance({ x: _x, y: _y }, getLinearFunction(TL, BL));
    } else {
      distance = pointToLinearDistance(tl, getLinearFunction(TL, BL));
    }

    if (distance < 0) {
      if (options.by === 'left') {
        (klass as any).pad.left = 0;
      } else {
        (klass as any).pad.right = 0;
      }
      klass.set('width', scaleWidth);
      return false;
    } else if (distance > scaleWidth) {
      klass.set('width', 0);
      return false;
    }

    if (options.by === 'left') {
      (klass as any).pad.left = distance;
    } else {
      (klass as any).pad.right = distance;
    }

    klass.set('width', x);
    return true;
  };
}

function cropY(container: fabric.Object, options: { by?: 'top' | 'bottom' }) {
  return function (e: MouseEvent, transform: fabric.Transform, _x: number, _y: number) {
    const point = getLocalPoint(transform, transform.originX, transform.originY, _x, _y);
    const klass = transform.target;
    const scaleHeight = container.getScaledHeight();

    let y = options.by === 'top' ? -point.y : point.y;

    if (y < 2) {
      klass.set('height', 2);
      return false;
    }
    if (y > scaleHeight) {
      klass.set('height', scaleHeight);
      return false;
    }
    klass.set('height', y);
    return true;
  };
}

export default class Tabric {
  private _canvas;
  lastTop = 0;
  lastLeft = 0;
  constructor(el: string) {
    this._canvas = new fabric.Canvas(el, {
      width: 1200,
      height: 600,
    });
    this._canvas.preserveObjectStacking = true;
  }

  createImage(url: string) {
    let fabricImage: fabric.Image;
    const img = new Image();
    img.src = url;
    img.onload = () => {
      const image = new fabric.Image(img, {
        width: 400,
        height: 400,
        left: 400,
        top: 100,
        opacity: 0.4,
        lockScalingFlip: true,
      });
      fabricImage = image;
      image.rotate(30);

      this._canvas.add(image);

      const clipImage: fabric.Image = fabric.util.object.clone(image);

      image.setControlVisible('mtr', false);
      image.setControlVisible('ml', false);
      image.setControlVisible('mt', false);
      image.setControlVisible('mr', false);
      image.setControlVisible('mb', false);
      clipImage.setControlVisible('mtr', false);

      const controls = { ...image.controls };
      clipImage.controls = controls;
      clipImage.controls.mr = new fabric.Control({ ...controls.mr });

      clipImage.set({
        lockMovementX: true,
        lockMovementY: true,
        lockSkewingX: true,
        lockSkewingY: true,
        lockScalingFlip: true,
      });

      let scaleWidth = Infinity;
      let scaleHeight = Infinity;

      clipImage.on('mousedown', (e: fabric.IEvent) => {
        const { width = 0, height = 0 } = clipImage;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1 } = image;
        const { tl, tr, br, bl } = clipImage.get('aCoords') as ACoords;
        const { tl: TL, tr: TR, br: BR, bl: BL } = image.get('aCoords') as ACoords;
        const leftLinear = getLinearFunction(tl, bl);
        const topLinear = getLinearFunction(tl, tr);
        const rightLinear = getLinearFunction(tr, br);
        const bottomLinear = getLinearFunction(br, bl);

        const leftDistance = Math.abs(pointToLinearDistance(TL, leftLinear));
        const topDistance = Math.abs(pointToLinearDistance(TL, topLinear));
        const rightDistance = Math.abs(pointToLinearDistance(TR, rightLinear));
        const bottomDistance = Math.abs(pointToLinearDistance(BR, bottomLinear));

        switch (e.transform?.corner) {
          case 'ml':
            scaleWidth = width * imageScaleX + leftDistance;
            break;
          case 'mr':
            scaleWidth = width * imageScaleX + rightDistance;
            break;
          case 'mt':
            scaleHeight = height * imageScaleY + topDistance;
            break;
          case 'mb':
            scaleHeight = height * imageScaleY + bottomDistance;
            break;
          case 'tl':
            scaleWidth = width * imageScaleX + leftDistance;
            scaleHeight = height * imageScaleY + topDistance;
            break;
          case 'tr':
            scaleWidth = width * imageScaleX + rightDistance;
            scaleHeight = height * imageScaleY + topDistance;
            break;
          case 'br':
            scaleWidth = width * imageScaleX + rightDistance;
            scaleHeight = height * imageScaleY + bottomDistance;
            break;
          case 'bl':
            scaleWidth = width * imageScaleX + leftDistance;
            scaleHeight = height * imageScaleY + bottomDistance;
            break;
        }
      });
      clipImage.on('scaling', () => {
        // clipImage.set('opacity', 0);
        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = clipImage;
        let scaleW = width * scaleX;
        let scaleH = height * scaleY;

        if (scaleW > scaleWidth) {
          scaleW = scaleWidth;
        }

        if (scaleH > scaleHeight) {
          scaleH = scaleHeight;
        }

        clipImage.set({
          width: scaleW,
          height: scaleH,
          scaleX: 1,
          scaleY: 1,
        });
      });
      clipImage.on('scaled', calculateCrop);

      let minScaleX = 0;
      let minScaleY = 0;

      function calculateCrop() {
        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = clipImage as fabric.Image;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1 } = image as fabric.Image;

        const { tl: TL } = image.aCoords as ACoords;
        const point = clipImage.toLocalPoint(new fabric.Point(TL.x, TL.y), 'left', 'top');

        clipImage.set({
          width: (width * scaleX) / imageScaleX,
          height: (height * scaleY) / imageScaleY,
          cropX: Math.abs(point.x) / imageScaleX,
          cropY: Math.abs(point.y) / imageScaleY,
          scaleX: imageScaleX,
          scaleY: imageScaleY,
          opacity: 1,
        });
      }

      let linear: {
        left: LinearFunction;
        top: LinearFunction;
        right: LinearFunction;
        bottom: LinearFunction;
      } = {} as any;

      image.on('mousedown', (e: fabric.IEvent) => {
        const { tl, tr, br, bl } = clipImage.get('aCoords') as ACoords;
        const { tl: TL, tr: TR, br: BR, bl: BL } = image.get('aCoords') as ACoords;
        const leftLinear = getLinearFunction(bl, tl);
        const topLinear = getLinearFunction(tl, tr);
        const rightLinear = getLinearFunction(tr, br);
        const bottomLinear = getLinearFunction(br, bl);

        const leftLINEAR = getLinearFunction(BL, TL);
        const topLINEAR = getLinearFunction(TL, TR);
        const rightLINEAR = getLinearFunction(TR, BR);
        const bottomLINEAR = getLinearFunction(BR, BL);

        const leftDistance = pointToLinearDistance(TL, leftLinear);
        const topDistance = pointToLinearDistance(TL, topLinear);
        const rightDistance = pointToLinearDistance(TR, rightLinear);
        const bottomDistance = pointToLinearDistance(BL, bottomLinear);

        // scaling
        if (e.transform?.corner) {
          const { width = 0, height = 0 } = image;
          switch (e.transform?.corner) {
            case 'ml':
              minScaleX = Math.abs(pointToLinearDistance(tl, rightLINEAR)) / width;
              break;
            case 'mr':
              minScaleX = Math.abs(pointToLinearDistance(tr, leftLINEAR)) / width;
              break;
            case 'mt':
              minScaleY = Math.abs(pointToLinearDistance(tl, bottomLINEAR)) / height;
              break;
            case 'mb':
              minScaleY = Math.abs(pointToLinearDistance(bl, topLINEAR)) / height;
              break;
            case 'tl':
              minScaleX = Math.abs(pointToLinearDistance(tl, rightLINEAR)) / width;
              minScaleY = Math.abs(pointToLinearDistance(tl, bottomLINEAR)) / height;
              break;
            case 'tr':
              minScaleX = Math.abs(pointToLinearDistance(tr, leftLINEAR)) / width;
              minScaleY = Math.abs(pointToLinearDistance(tl, bottomLINEAR)) / height;
              break;
            case 'br':
              minScaleX = Math.abs(pointToLinearDistance(tr, leftLINEAR)) / width;
              minScaleY = Math.abs(pointToLinearDistance(bl, topLINEAR)) / height;
              break;
            case 'bl':
              minScaleX = Math.abs(pointToLinearDistance(tl, rightLINEAR)) / width;
              minScaleY = Math.abs(pointToLinearDistance(bl, topLINEAR)) / height;
              break;
          }
          return;
        }
        // moving

        const vLinear = (() => {
          const k = leftLINEAR.k;
          const b = leftLINEAR.b - (rightLINEAR.b - rightLinear.b);
          let func: (x: number) => number;
          let reverseFunc: (y: number) => number;
          if (!Number.isFinite(k)) {
            func = function (x) {
              return Infinity;
            };
            reverseFunc = function (y) {
              return TL.x - (BR.x - br.x);
            };
          } else if (k === 0) {
            func = function (x) {
              return TL.y - (BR.y - br.y);
            };
            reverseFunc = function (y) {
              return Infinity;
            };
          } else {
            func = function (x: number) {
              return k * x + b;
            };
            reverseFunc = function (y: number) {
              return (y + b) / k;
            };
          }
          return { k, b, func, reverseFunc };
        })();

        const hLinear = (() => {
          const k = topLINEAR.k;
          const b = topLINEAR.b - (bottomLINEAR.b - bottomLinear.b);
          let func: (x: number) => number;
          let reverseFunc: (y: number) => number;
          if (!Number.isFinite(k)) {
            func = function (x) {
              return Infinity;
            };
            reverseFunc = function (y) {
              return TL.x - (BR.x - br.x);
            };
          } else if (k === 0) {
            func = function (x) {
              return TL.y - (BR.y - br.y);
            };
            reverseFunc = function (y) {
              return Infinity;
            };
          } else {
            func = function (x: number) {
              return k * x + b;
            };
            reverseFunc = function (y: number) {
              return (y + b) / k;
            };
          }
          return { k, b, func, reverseFunc };
        })();

        let pointA = { x: 0, y: 0 };
        let pointB = { x: 0, y: 0 };
        const pointC = { x: TL.x - (BR.x - br.x), y: TL.y - (BR.y - br.y) };
        const pointD = { x: tl.x, y: tl.y };
        if (!Number.isFinite(vLinear.k) || !Number.isFinite(hLinear.k)) {
          pointA = { x: TL.x - (BR.x - br.x), y: tl.y };
          pointB = { x: tl.x, y: TL.y - (BR.y - br.y) };
        } else {
          // x = (b2 - b1) / (k1 - k2)
          const aX = (hLinear.b - leftLinear.b) / (leftLinear.k - hLinear.k);
          const bX = (vLinear.b - topLinear.b) / (topLinear.k - vLinear.k);
          pointA = { x: aX, y: leftLinear.func(aX) };
          pointB = { x: bX, y: topLinear.func(bX) };
        }

        const points = [pointA, pointB, pointC, pointD].sort((a, b) => {
          if (a.x === b.x) {
            return a.y - b.y;
          }
          return a.x - b.x;
        });

        const moveTL = points[0].y < points[1].y ? points[0] : points[1];
        const moveTR = points[2].y < points[3].y ? points[2] : points[3];
        const moveBL = points[0].y > points[1].y ? points[0] : points[1];
        const moveBR = points[2].y > points[3].y ? points[2] : points[3];
        linear = {
          left: getLinearFunction(moveBL, moveTL),
          top: getLinearFunction(moveTL, moveTR),
          right: getLinearFunction(moveTR, moveBR),
          bottom: getLinearFunction(moveBR, moveBL),
        };
      });

      let lastScaleX = 1;
      let lastScaleY = 1;

      image.on('scaling', () => {
        let scaleX = image.scaleX || 1;
        let scaleY = image.scaleY || 1;

        if (scaleX < minScaleX) {
          scaleX = minScaleX;
          scaleY = lastScaleY;
        } else {
          lastScaleY = scaleY;
        }

        if (scaleY < minScaleY) {
          scaleY = minScaleY;
          scaleX = lastScaleX;
        } else {
          lastScaleX = scaleX;
        }

        image.set({ scaleX, scaleY });
      });

      image.on('moving', () => {
        const { left = 0, top = 0 } = image;
        const { tl: TL } = image.aCoords as ACoords;

        let l = left;
        let t = top;

        const minL = linear.left.reverseFunc(TL.y);
        const maxL = linear.right.reverseFunc(TL.y);
        const minT = linear.top.func(TL.x);
        const maxT = linear.bottom.func(TL.x);

        if (left < minL) {
          l = minL;
        } else if (left > maxL) {
          l = maxL;
        }

        if (top < minT) {
          t = minT;
        } else if (top > maxT) {
          t = maxT;
        }

        image.set({
          left: l,
          top: t,
        });
      });
      image.on('moved', () => {
        clipImage.set('opacity', 1);
      });

      image.on('modified', calculateCrop);

      this._canvas.add(clipImage);
      (window as any).image = image;
      (window as any).clip = clipImage;
      (window as any).canvas = this._canvas;
    };
  }
}

type Line = [Point, Point];

function getParallelLineDistance(lineA: Line, lineB: Line) {
  const a1 = lineA[0].y - lineA[1].y;
  const b1 = lineA[1].x - lineA[0].x;
  const c1 = lineA[0].x * lineA[1].y - lineA[1].x * lineA[0].y;
  const a2 = lineB[0].y - lineB[1].y;
  const b2 = lineB[1].x - lineB[0].x;
  const ratio = a1 ? a1 / a2 : b1 / b2;
  const c2 = (lineB[0].x * lineB[1].y - lineB[1].x * lineB[0].y) * ratio;
  // console.log(a1, a2, b1, b2, c1, c2);
  return (c1 - c2) / Math.sqrt(a1 ** 2 + b1 ** 2);
}

function getHypotenuse(a: Point, b: Point) {
  return Math.sqrt(Math.pow(Math.abs(a.x - b.x), 2) + Math.pow(Math.abs(a.y - b.y), 2));
}

function getLinearFunction(A: Point, B: Point): LinearFunction {
  const k = (A.y - B.y) / (A.x - B.x);
  const b = A.y - k * A.x;
  let func;
  let reverseFunc;
  if (!Number.isFinite(k)) {
    func = function (x: number) {
      return Infinity;
    };
    reverseFunc = function (y: number) {
      return A.x;
    };
  } else if (k === 0) {
    func = function (x: number) {
      return A.y;
    };
    reverseFunc = function (y: number) {
      return Infinity;
    };
  } else {
    func = function (x: number) {
      return k * x + b;
    };
    reverseFunc = function (y: number) {
      return (y - b) / k;
    };
  }
  return {
    k,
    b,
    func,
    reverseFunc,
    A,
    B,
  };
}

function pointToLinearDistance(point: Point, linear: LinearFunction) {
  let distance = 0;
  if (linear.A.x === linear.B.x) {
    // linear 平行于 y 轴
    distance = Math.abs(linear.A.x - point.x);
  } else if (linear.A.y === linear.B.y) {
    // linear 平行于 x 轴
    distance = Math.abs(linear.A.y - point.y);
  } else {
    distance = Math.abs((linear.k * point.x - point.y + linear.b) / Math.sqrt(Math.pow(linear.k, 2) + 1));
  }
  // (x1-x3)*(y2-y3)-(y1-y3)*(x2-x3)
  const direction = Math.sign((linear.A.x - point.x) * (linear.B.y - point.y) - (linear.A.y - point.y) * (linear.B.x - point.x));
  return direction * distance;
}

function getAbsDistance(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) {
  const linear = getLinearFunction(a, b);
  return Math.abs(linear.k * p.x - p.y + linear.b) / Math.sqrt(Math.pow(linear.k, 2) + 1);
}

function getDistance(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }) {
  const linear = getLinearFunction(a, b);
  return (linear.k * p.x - p.y + linear.b) / Math.sqrt(Math.pow(linear.k, 2) + 1);
}

function getLimitedNumber(num: number, min: number, max: number) {
  if (num < min) {
    return min;
  }
  if (num > max) {
    return max;
  }
  return num;
}
