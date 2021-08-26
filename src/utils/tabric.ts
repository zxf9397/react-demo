import { fabric } from 'fabric';
import { getRotatedPoint, linearFunction, linearFunctionMove, linearsIntersection, pointToLinearDistance, symmetricalPoint } from './func';
import type { LinearFunction, Point } from './func';

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;
type CroppingObject = fabric.Image | null;

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
    var actionPerformed = actionHandler(eventData, transform, x, y);
    if (actionPerformed) {
      (fabric as any).controlsUtils.fireEvent(eventName, commonEventInfo(eventData, transform, x, y));
    }
    return actionPerformed;
  };
}

function setControlsActionHandler(obj: fabric.Object) {
  obj.controls.tl.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.mt.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingYOrSkewingX);
  obj.controls.tr.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.bl.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.ml.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingXOrSkewingY);
}
export default class Tabric {
  private _canvas;

  constructor(el: string) {
    this._canvas = new fabric.Canvas(el, {
      width: 1200,
      height: 600,
    });
    this._canvas.preserveObjectStacking = true;
    this._initializeCropping();
  }

  addImage(url: string, options: Partial<fabric.Image> = {}) {
    return fabric.Image.fromURL(
      url,
      (image) => {
        image.set(options);
        this._canvas.add(image).renderAll();
      },
      {
        crossOrigin: 'anonymous',
      }
    );
  }

  /* cropping module */
  // real cropping object
  croppingTarget: CroppingObject = null;
  croppingTargetBackup: CroppingObject = null;
  // the position in stack of _objects before cropping
  croppingIndex: number = -1;
  // the original object for cropping
  croppingOrigin: CroppingObject = null;
  croppingOriginBackup: CroppingObject = null;

  // initialize cropping event
  _initializeCropping = () => {
    this._canvas.on('mouse:down', (e: fabric.IEvent) => {
      if (!this.croppingTarget || e.target === this.croppingTarget || e.target === this.croppingOrigin) {
        return;
      }
      // 裁切中，点击其他区域默认触发裁切事件
      this.confirmCropping();
    });
    this._canvas.on('mouse:dblclick', (e: fabric.IEvent) => {
      if (!this.croppingTarget) {
        if (e.target?.type === 'image') {
          this.startCropping();
        }
        return;
      }
      if (e.target === this.croppingTarget || e.target === this.croppingOrigin) {
        this.confirmCropping();
      }
    });
  };

  startCropping = () => {
    if (this.croppingOrigin) {
      return;
    }
    const activeObj = this._canvas.getActiveObject();
    if (!activeObj || activeObj.type !== 'image') {
      return;
    }
    this.croppingIndex = this._canvas.getObjects().findIndex((klass) => klass === activeObj);
    this.croppingOrigin = fabric.util.object.clone((activeObj as any).croppingOrigin || activeObj) as fabric.Image;
    this.croppingTargetBackup = fabric.util.object.clone(activeObj);
    this.croppingTarget = activeObj as fabric.Image;
    this.croppingOriginBackup = (activeObj as any).croppingOrigin;

    this.croppingOrigin
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

    this.croppingTarget
      .setControlsVisibility({
        mtr: false,
        ml: true,
        mt: true,
        mr: true,
        mb: true,
      })
      .set({
        lockMovementX: true,
        lockMovementY: true,
        lockSkewingX: true,
        lockSkewingY: true,
        lockScalingFlip: true,
      });
    (this.croppingTarget as any).cropping = true;

    if (!(this.croppingTarget as any).croppingOrigin) {
      setControlsActionHandler(this.croppingTarget);
      let scaleWidth = Infinity;
      let scaleHeight = Infinity;

      let linear: {
        left: LinearFunction;
        top: LinearFunction;
        right: LinearFunction;
        bottom: LinearFunction;
      } = {} as any;
      let coords: {
        tl: Point;
        tr: Point;
        br: Point;
        bl: Point;
      } = {} as any;

      let minScaleX = 0;
      let minScaleY = 0;
      let lastScaleX = 1;
      let lastScaleY = 1;

      this.croppingTarget.on('mousedown', (e: fabric.IEvent) => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }
        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = this.croppingTarget;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1, width: WIDTH = 0 } = this.croppingOrigin;
        const { tl, tr, br, bl } = this.croppingTarget.get('aCoords') as ACoords;
        const { tl: TL, tr: TR, br: BR, bl: BL } = this.croppingOrigin.get('aCoords') as ACoords;
        const leftLinear = linearFunction(tl, bl);
        const topLinear = linearFunction(tl, tr);
        const rightLinear = linearFunction(tr, br);
        const bottomLinear = linearFunction(br, bl);

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
      this.croppingTarget.on('scaling', () => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }

        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = this.croppingTarget;

        this.croppingTarget
          .set({
            scaleX: Math.min(scaleX, scaleWidth / width),
            scaleY: Math.min(scaleY, scaleHeight / height),
          })
          .setCoords();

        calculateCrop();
      });
      const calculateCrop = () => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }

        const { width = 0, height = 0, scaleX = 1, scaleY = 1, flipX = false, flipY = false } = this.croppingTarget;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1 } = this.croppingOrigin;

        const { tl: TL, tr: TR, br: BR, bl: BL } = this.croppingOrigin.aCoords as ACoords;

        let point: fabric.Point;

        if (flipX && flipY) {
          point = this.croppingTarget.toLocalPoint(new fabric.Point(BR.x, BR.y), 'right', 'bottom');
        } else if (flipX) {
          point = this.croppingTarget.toLocalPoint(new fabric.Point(TR.x, TR.y), 'right', 'top');
        } else if (flipY) {
          point = this.croppingTarget.toLocalPoint(new fabric.Point(BL.x, BL.y), 'left', 'bottom');
        } else {
          point = this.croppingTarget.toLocalPoint(new fabric.Point(TL.x, TL.y), 'left', 'top');
        }

        this.croppingTarget
          .set({
            width: (width * scaleX) / imageScaleX,
            height: (height * scaleY) / imageScaleY,
            cropX: Math.abs(point.x) / imageScaleX,
            cropY: Math.abs(point.y) / imageScaleY,
            scaleX: imageScaleX,
            scaleY: imageScaleY,
          })
          .setCoords();
      };
      this.croppingTarget.on('scaled', calculateCrop);

      this.croppingOrigin.on('mousedown', (e: fabric.IEvent) => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }
        const { angle = 0 } = this.croppingTarget;
        const { tl, tr, br, bl } = this.croppingTarget.get('aCoords') as ACoords;
        const { tl: TL, tr: TR, br: BR, bl: BL } = this.croppingOrigin.get('aCoords') as ACoords;
        const leftLinear = linearFunction(bl, tl);
        const topLinear = linearFunction(tl, tr);
        const rightLinear = linearFunction(tr, br);
        const bottomLinear = linearFunction(br, bl);

        const leftLINEAR = linearFunction(BL, TL);
        const topLINEAR = linearFunction(TL, TR);
        const rightLINEAR = linearFunction(TR, BR);
        const bottomLINEAR = linearFunction(BR, BL);

        // scaling
        if (e.transform?.corner) {
          const { width = 0, height = 0 } = this.croppingOrigin;
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

        const vLinear = linearFunctionMove(leftLINEAR, Number.isFinite(leftLINEAR.k) ? rightLinear.b - rightLINEAR.b : br.x - BR.x);
        const hLinear = linearFunctionMove(topLINEAR, Number.isFinite(topLINEAR.k) ? bottomLinear.b - bottomLINEAR.b : br.x - BR.x);
        const cAngle = (angle % 360) + (angle < 0 ? 360 : 0);
        if (cAngle < 90) {
          linear = {
            left: vLinear as any,
            top: hLinear as any,
            right: leftLinear,
            bottom: topLinear,
          };
        } else if (cAngle < 180) {
          linear = {
            left: topLinear,
            top: vLinear as any,
            right: hLinear as any,
            bottom: leftLinear,
          };
        } else if (cAngle < 270) {
          linear = {
            left: leftLinear,
            top: topLinear,
            right: vLinear as any,
            bottom: hLinear as any,
          };
        } else {
          linear = {
            left: hLinear as any,
            top: leftLinear,
            right: topLinear,
            bottom: vLinear as any,
          };
        }
        coords = {
          tl: linearsIntersection(linear.top, linear.left),
          tr: linearsIntersection(linear.top, linear.right),
          br: linearsIntersection(linear.bottom, linear.right),
          bl: linearsIntersection(linear.bottom, linear.left),
        };
      });
      this.croppingOrigin.on('scaling', () => {
        if (!this.croppingOrigin) {
          return;
        }
        let scaleX = this.croppingOrigin.scaleX || 1;
        let scaleY = this.croppingOrigin.scaleY || 1;

        if (scaleX <= minScaleX) {
          scaleX = minScaleX;
          scaleY = lastScaleY;
        } else {
          lastScaleY = scaleY;
        }

        if (scaleY <= minScaleY) {
          scaleY = minScaleY;
          scaleX = lastScaleX;
        } else {
          lastScaleX = scaleX;
        }

        this.croppingOrigin.set({ scaleX, scaleY }).setCoords();
        calculateCrop();
      });
      this.croppingOrigin.on('moving', (e) => {
        if (!this.croppingOrigin) {
          return;
        }
        const { left = 0, top = 0, angle = 0 } = this.croppingOrigin;
        const { tl: TL } = this.croppingOrigin.aCoords as ACoords;

        let l = left;
        let t = top;

        const minL = linear.left.reverseFunc(TL.y);
        const maxL = linear.right.reverseFunc(TL.y);
        const minT = linear.top.func(TL.x);
        const maxT = linear.bottom.func(TL.x);

        if (left < minL) {
          if (top < minT) {
            l = coords.tl.x;
            t = coords.tl.y;
          } else if (top > maxT) {
            l = coords.bl.x;
            t = coords.bl.y;
          } else {
            l = minL;
          }
        } else if (left > maxL) {
          if (top > maxT) {
            l = coords.br.x;
            t = coords.br.y;
          } else if (top < minT) {
            l = coords.tr.x;
            t = coords.tr.y;
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

        this.croppingOrigin.set({ left: l, top: t });
        calculateCrop();
      });
      this.croppingOrigin.on('moved', () => {
        if (!this.croppingTarget) {
          return;
        }
      });
      this.croppingOrigin.on('modified', calculateCrop);
    }

    this._canvas.add(this.croppingOrigin);
    this.croppingTarget.bringToFront();
  };

  //
  cancelCropping = () => {
    if (!this.croppingOrigin || !this.croppingTargetBackup || !this.croppingTarget) {
      return;
    }
    (this.croppingTarget as any).croppingOrigin = this.croppingOriginBackup;
    (this.croppingTarget as any).cropping = false;
    this.croppingTarget.setControlVisible('mtr', true).set({
      lockMovementX: false,
      lockMovementY: false,
      lockSkewingX: false,
      lockSkewingY: false,
      lockScalingFlip: false,
    });
    this._canvas.remove(this.croppingOrigin, this.croppingTarget).add(this.croppingTargetBackup);
    this.croppingTargetBackup.moveTo(this.croppingIndex);
    this._canvas.setActiveObject(this.croppingTargetBackup);
    this.croppingTarget = null;
    this.croppingTargetBackup = null;
    this.croppingOrigin = null;
  };

  confirmCropping = () => {
    if (!this.croppingOrigin || !this.croppingTargetBackup || !this.croppingTarget) {
      return;
    }

    (this.croppingTarget as any).croppingOrigin = this.croppingOrigin;
    (this.croppingTarget as any).cropping = false;
    this._canvas.setActiveObject(this.croppingTarget);
    this.croppingTarget.moveTo(this.croppingIndex);
    this._canvas.remove(this.croppingOrigin);
    this.croppingTarget.setControlVisible('mtr', true).set({
      lockMovementX: false,
      lockMovementY: false,
      lockSkewingX: false,
      lockSkewingY: false,
      lockScalingFlip: false,
    });
    // after cropping, move the cropped image we need to move the original image as well.
    // the same to rotation and scale
    if (!(this.croppingTarget as any).cropbound) {
      (this.croppingTarget as any).cropbound = true;
      let startLeft = 0;
      let startTop = 0;
      let startAngle = 0;
      // record position
      this.croppingTarget.on('mousedown', function (this: fabric.Image) {
        startLeft = this.left || 0;
        startTop = this.top || 0;
        startAngle = this.angle || 0;
      });

      this.croppingTarget.on('moved', function (this: fabric.Image) {
        const croppingOrigin = (this as any).croppingOrigin as fabric.Image;
        const { left = 0, top = 0 } = this;
        croppingOrigin
          .set({
            left: (croppingOrigin.left || 0) + (left - startLeft),
            top: (croppingOrigin.top || 0) + (top - startTop),
          })
          .setCoords();
      });
      this.croppingTarget.on('rotated', function (this: fabric.Image) {
        const croppingOrigin = (this as any).croppingOrigin as fabric.Image;
        const centerPoint = this.getCenterPoint();
        const { left = 0, top = 0 } = croppingOrigin;
        const point = getRotatedPoint(centerPoint, { x: left, y: top }, (this.angle || 0) - startAngle);
        croppingOrigin
          .set({
            left: point.x,
            top: point.y,
            angle: this.angle,
          })
          .setCoords();
      });
      this.croppingTarget.on('scaled', function (this: fabric.Image) {
        if ((this as any).cropping) {
          return;
        }
        const croppingOrigin = (this as any).croppingOrigin as fabric.Image;
        const { tl } = this.aCoords as ACoords;
        const { scaleX = 1, scaleY = 1, cropX = 0, cropY = 0, angle = 0 } = this;
        const mathSin = Math.sin((angle * Math.PI) / 180);
        const mathCos = Math.cos((angle * Math.PI) / 180);
        const scaleCropX = cropX * scaleX;
        const scaleCropY = cropY * scaleY;
        croppingOrigin
          .set({
            left: tl.x + mathSin * scaleCropY - mathCos * scaleCropX,
            top: tl.y - mathCos * scaleCropY - mathSin * scaleCropX,
            scaleX,
            scaleY,
          })
          .setCoords();
      });
    }
    // clear
    this.croppingTarget = null;
    this.croppingTargetBackup = null;
    this.croppingOrigin = null;
  };

  flipX = () => {
    const activeObj = this._canvas.getActiveObject();
    if (!activeObj || this.croppingTarget) {
      return;
    }
    const flipX = !activeObj.get('flipX');
    activeObj.set('flipX', flipX);
    const croppingOrigin = (activeObj as any).croppingOrigin as fabric.Image;
    if (croppingOrigin) {
      const centerPoint = activeObj.getCenterPoint();
      const { tl, tr } = activeObj.aCoords as ACoords;
      const { tl: TL, tr: TR } = croppingOrigin.aCoords as ACoords;
      const point = symmetricalPoint(TL, linearFunction(centerPoint, { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 }));
      croppingOrigin.set({ left: point.x - (TR.x - TL.x), top: point.y - (TR.y - TL.y), flipX }).setCoords();
    }
    this._canvas.renderAll();
  };

  flipY = () => {
    const activeObj = this._canvas.getActiveObject();
    if (!activeObj || this.croppingTarget) {
      return;
    }
    const flipY = !activeObj.get('flipY');
    activeObj.set('flipY', flipY);
    const croppingOrigin = (activeObj as any).croppingOrigin as fabric.Image;
    if (croppingOrigin) {
      const centerPoint = activeObj.getCenterPoint();
      const { tl, bl } = activeObj.aCoords as ACoords;
      const { tl: TL, bl: BL } = croppingOrigin.aCoords as ACoords;
      const point = symmetricalPoint(TL, linearFunction(centerPoint, { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 }));
      croppingOrigin.set({ left: point.x - (BL.x - TL.x), top: point.y - (BL.y - TL.y), flipY }).setCoords();
    }
    this._canvas.renderAll();
  };
}
