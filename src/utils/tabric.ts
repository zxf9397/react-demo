import { fabric } from 'fabric';

const CONTROLS = ['bl', 'br', 'mb', 'ml', 'mr', 'mt', 'tl', 'tr', 'mtr'] as const;
type ControlType = typeof CONTROLS[number];

interface Point {
  x: number;
  y: number;
}

interface LinearFunction {
  k: number;
  b: number;
  func: (x: number) => number;
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

  constructor(el: string) {
    /*    setCustomControl('Image', 'tr', {
      actionHandler: ((e: MouseEvent, obj: any, x: number, y: number) => {
        const klass = obj.target;
        klass.set({
          width: x - klass.get('left'),
          top: y,
          height: klass.get('height') - (y - klass.get('top')),
        });
        return true;
      }) as any,
      actionName: 'crop',
    });
    setCustomControl('Image', 'br', {
      actionHandler: ((e: MouseEvent, obj: any, x: number, y: number) => {
        const klass = obj.target;
        klass.set({
          width: x - obj.target.get('left'),
          height: y - klass.get('top'),
        });
        return true;
      }) as any,
      actionName: 'crop',
    });
    setCustomControl('Image', 'tl', {
      actionHandler: ((e: MouseEvent, obj: any, x: number, y: number) => {
        const klass = obj.target;
        klass.set({
          left: x,
          width: klass.get('width') - (x - klass.get('left')),
          top: y,
          height: klass.get('height') - (y - klass.get('top')),
        });
        return true;
      }) as any,
      actionName: 'crop',
    });
    setCustomControl('Image', 'bl', {
      actionHandler: ((e: MouseEvent, obj: any, x: number, y: number) => {
        const klass = obj.target;
        klass.set({
          left: x,
          width: klass.get('width') - (x - klass.get('left')),
          height: y - klass.get('top'),
        });
        return true;
      }) as any,
      actionName: 'crop',
    }); */
    this._canvas = new fabric.Canvas(el, {
      width: 1200,
      height: 600,
    });
    this._canvas.preserveObjectStacking = true;
  }

  createImage(url: string) {
    const img = new Image();
    img.src = url;
    img.onload = () => {
      const image = new fabric.Image(img, {
        width: 400,
        height: 400,
        left: 400,
        top: 100,
        opacity: 0.5,
      });
      image.rotate(0);

      this._canvas.add(image);

      const clipImage: fabric.Image = fabric.util.object.clone(image);

      image.setControlVisible('mtr', false);
      clipImage.setControlVisible('mtr', false);

      const controls = { ...image.controls };
      clipImage.controls = controls;
      clipImage.controls.mr = new fabric.Control({ ...controls.mr });

      // clipImage.controls.mr.actionHandler = wrapWithFireEvent('croping', wrapWithFixedAnchor(cropX(image, { by: 'right' })));
      // clipImage.controls.ml.actionHandler = wrapWithFireEvent('croping', wrapWithFixedAnchor(cropX(image, { by: 'left' })));
      // clipImage.controls.mt.actionHandler = wrapWithFireEvent('croping', wrapWithFixedAnchor(cropY(image, { by: 'top' })));
      // clipImage.controls.mb.actionHandler = wrapWithFireEvent('croping', wrapWithFixedAnchor(cropY(image, { by: 'bottom' })));

      clipImage.set({
        lockMovementX: true,
        lockMovementY: true,
        lockSkewingX: true,
        lockSkewingY: true,
        lockScalingFlip: true,
      });

      clipImage.on('scaling', (e: fabric.IEvent) => {
        clipImage.set('opacity', 0);
      });
      clipImage.on('scaled', calculateCrop);

      clipImage.on('mousedown', (e: fabric.IEvent) => {
        const { tl, tr, br, bl } = (e.transform as any).target.aCoords as Record<string, fabric.Point>;
        const { tl: TL, tr: TR, br: BR, bl: BL } = image.get('aCoords') as ACoords;
        const { x = 0, y = 0 } = ((e.transform as any).target as fabric.Image).getCenterPoint();
        const targetLinear = getLinearFunction(tl, tr);
        const imageLinear = getLinearFunction(TL, TR);
      });

      let lastPositon = {
        left: image.get('left') || 0,
        top: image.get('left') || 0,
      };
      const movableX = { min: 0, max: 0 };
      const movableY = { min: 0, max: 0 };
      let scaleX = 1;
      let scaleY = 1;

      // image.on('mousedown', () => {
      //   const { tl: TL } = image.aCoords as ACoords;
      //   const point = clipImage.toLocalPoint(new fabric.Point(TL.x, TL.y), 'left', 'top');
      //   console.log(point);
      // })

      // clipImage.on('mousedown', (e: fabric.IEvent) => {
      //   const transform = e.transform as fabric.Transform;
      //   const klass = transform.target;
      //   const control = klass.controls[transform.corner];
      //   if (!control) return;
      //   const { tl: TL } = image.aCoords as ACoords;
      //   const point = klass.toLocalPoint(new fabric.Point(TL.x, TL.y), 'left', 'top');
      // });

      function calculateCrop(e: fabric.IEvent) {
        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = clipImage as fabric.Image;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1 } = image as fabric.Image;

        const { tl: TL } = image.aCoords as ACoords;
        const point = clipImage.toLocalPoint(new fabric.Point(TL.x, TL.y), 'left', 'top');

        console.log(point);

        clipImage.set({
          width: (width * scaleX) / imageScaleX,
          height: (height * scaleY) / imageScaleY,
          cropX: Math.abs(point.x) * imageScaleX,
          cropY: Math.abs(point.y) * imageScaleY,
          scaleX: imageScaleX,
          scaleY: imageScaleY,
          opacity: 1,
        });
      }
      image.on('mousedown', (e: fabric.IEvent) => {
        const { tl, tr, br, bl } = clipImage.get('aCoords') as ACoords;
        const transform = e.transform as fabric.Transform;
        const klass = transform.target;
        const { left = 0, top = 0, scaleX = 1, scaleY = 1 } = klass;
        const { tl: TL, tr: TR, br: BR, bl: BL } = klass.get('aCoords') as ACoords;
        const leftLinear = getLinearFunction(tl, bl);
        const topLinear = getLinearFunction(tl, tr);
        const rightLinear = getLinearFunction(tr, br);
        const bottomLinear = getLinearFunction(br, bl);

        const leftDistance = pointToLinearDistance(TL, leftLinear);
        const topDistance = pointToLinearDistance(TL, topLinear);
        const rightDistance = pointToLinearDistance(TR, rightLinear);
        const bottomDistance = pointToLinearDistance(BL, bottomLinear);

        movableX.min = TL.x + rightDistance;
        movableX.max = TL.x + leftDistance;
        movableY.min = TL.y + bottomDistance;
        movableY.max = TL.y + topDistance;
      });

      image.on('scaling', () => {
        const { left = 0, top = 0 } = image;

        if (left < movableX.min) {
          image.set({
            left: movableX.min,
          });
        } else if (left > movableX.max) {
          image.set({
            left: movableX.max,
          });
        }

        if (top < movableY.min) {
          image.set({
            top: movableY.min,
          });
        } else if (top > movableY.max) {
          image.set({
            top: movableY.max,
          });
        }
      });

      image.on('moving', () => {
        clipImage.set('opacity', 0);
        const { left = 0, top = 0 } = image;

        if (left < movableX.min) {
          image.set({
            left: movableX.min,
          });
        } else if (left > movableX.max) {
          image.set({
            left: movableX.max,
          });
        }

        if (top < movableY.min) {
          image.set({
            top: movableY.min,
          });
        } else if (top > movableY.max) {
          image.set({
            top: movableY.max,
          });
        }
      });
      image.on('moved', () => {
        clipImage.set('opacity', 1);
      });

      image.on('modified', calculateCrop);

      this._canvas.add(clipImage);
    };
  }
}

function getHypotenuse(a: Point, b: Point) {
  return Math.sqrt(Math.pow(Math.abs(a.x - b.x), 2) + Math.pow(Math.abs(a.y - b.y), 2));
}

function getLinearFunction(A: Point, B: Point): LinearFunction {
  const k = (A.y - B.y) / (A.x - B.x);
  const b = A.y - k * A.x;
  return {
    k,
    b,
    func: function (x: number) {
      return k * x + b;
    },
    A,
    B,
  };
}

function pointToLinearDistance(point: Point, linear: LinearFunction) {
  // linear 平行于 y 轴
  if (linear.A.x === linear.B.x) {
    return linear.A.x - point.x;
  }
  // linear 平行于 x 轴
  if (linear.A.y === linear.B.y) {
    return linear.A.y - point.y;
  }
  return (linear.k * point.x - point.y + linear.b) / Math.sqrt(Math.pow(linear.k, 2) + 1);
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
