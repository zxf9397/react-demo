import { fabric } from 'fabric';
import { getRotatedPoint, linearFunction, linearFunctionMove, linearsIntersection, pointToLinearDistance, symmetricalPoint } from './func';
import type { LinearFunction, Point } from './func';

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;
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
    this._canvas.on('mouse:down', (e: fabric.IEvent) => {
      if (!this.cropTarget || e.target === this.cropTarget || e.target === this.cropStatic) {
        return;
      }
      // 裁切中，点击其他区域默认触发裁切事件
      this.crop();
    });
    this._canvas.on('mouse:dblclick', (e: fabric.IEvent) => {
      if (!this.cropTarget) {
        return;
      }
      if (e.target === this.cropTarget || e.target === this.cropStatic) {
        this.crop();
      }
    });
  }

  addImage(url: string) {
    return fabric.Image.fromURL(url, (image) => {
      image.set({
        width: 400,
        height: 400,
        left: 400,
        top: 100,
      });
      image.rotate(30);
      this._canvas.add(image);
    });
  }

  cropTarget: fabric.Image | null = null;
  cropIndex: number = -1;
  cropBackups: fabric.Image | null = null;
  cropStatic: fabric.Image | null = null;
  cropStaticBackups: fabric.Image | null = null;

  startCrop = () => {
    if (this.cropStatic && this.cropBackups && this.cropTarget) {
      return;
    }
    const activeObj = this._canvas.getActiveObject();
    if (!activeObj || activeObj.type !== 'image') {
      return;
    }
    this.cropIndex = this._canvas.getObjects().findIndex((klass) => klass === activeObj);

    // 移动对象
    this.cropStatic = fabric.util.object.clone(((activeObj as any).cropStatic as fabric.Image) || activeObj) as fabric.Image;
    // 备份对象
    this.cropBackups = fabric.Image = fabric.util.object.clone(activeObj);
    // 裁剪对象
    this.cropTarget = activeObj as fabric.Image;
    // 移动对象备份
    this.cropStaticBackups = (activeObj as any).cropStatic;

    this.cropStatic
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

    this.cropTarget
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
    (this.cropTarget as any).cropping = true;
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

    if (!(this.cropTarget as any).cropStatic) {
      this.cropTarget.on('mousedown', (e: fabric.IEvent) => {
        if (!this.cropTarget || !this.cropStatic) {
          return;
        }
        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = this.cropTarget;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1, width: WIDTH = 0 } = this.cropStatic;
        const { tl, tr, br, bl } = this.cropTarget.get('aCoords') as ACoords;
        const { tl: TL, tr: TR, br: BR, bl: BL } = this.cropStatic.get('aCoords') as ACoords;
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
      this.cropTarget.on('scaling', () => {
        if (!this.cropTarget || !this.cropStatic) {
          return;
        }

        const { width = 0, height = 0, scaleX = 1, scaleY = 1 } = this.cropTarget;

        this.cropTarget.set({
          scaleX: Math.min(scaleX, scaleWidth / width),
          scaleY: Math.min(scaleY, scaleHeight / height),
        });
      });
      const calculateCrop = () => {
        if (!this.cropTarget || !this.cropStatic) {
          return;
        }

        const { width = 0, height = 0, scaleX = 1, scaleY = 1, flipX = false, flipY = false } = this.cropTarget;
        const { scaleX: imageScaleX = 1, scaleY: imageScaleY = 1 } = this.cropStatic;

        const { tl: TL, tr: TR, br: BR, bl: BL } = this.cropStatic.aCoords as ACoords;

        let point: fabric.Point;

        if (flipX && flipY) {
          point = this.cropTarget.toLocalPoint(new fabric.Point(BR.x, BR.y), 'right', 'bottom');
        } else if (flipX) {
          point = this.cropTarget.toLocalPoint(new fabric.Point(TR.x, TR.y), 'right', 'top');
        } else if (flipY) {
          point = this.cropTarget.toLocalPoint(new fabric.Point(BL.x, BL.y), 'left', 'bottom');
        } else {
          point = this.cropTarget.toLocalPoint(new fabric.Point(TL.x, TL.y), 'left', 'top');
        }

        this.cropTarget.set({
          width: (width * scaleX) / imageScaleX,
          height: (height * scaleY) / imageScaleY,
          cropX: Math.abs(point.x) / imageScaleX,
          cropY: Math.abs(point.y) / imageScaleY,
          scaleX: imageScaleX,
          scaleY: imageScaleY,
          opacity: 1,
        });
      };
      this.cropTarget.on('scaled', calculateCrop);

      this.cropStatic.on('mousedown', (e: fabric.IEvent) => {
        if (!this.cropTarget || !this.cropStatic) {
          return;
        }
        const { angle = 0 } = this.cropTarget;
        const { tl, tr, br, bl } = this.cropTarget.get('aCoords') as ACoords;
        const { tl: TL, tr: TR, br: BR, bl: BL } = this.cropStatic.get('aCoords') as ACoords;
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
          const { width = 0, height = 0 } = this.cropStatic;
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
      this.cropStatic.on('scaling', () => {
        if (!this.cropStatic) {
          return;
        }
        let scaleX = this.cropStatic.scaleX || 1;
        let scaleY = this.cropStatic.scaleY || 1;

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

        this.cropStatic.set({ scaleX, scaleY });
      });
      this.cropStatic.on('moving', (e) => {
        if (!this.cropStatic) {
          return;
        }
        const { left = 0, top = 0, angle = 0 } = this.cropStatic;
        const { tl: TL } = this.cropStatic.aCoords as ACoords;

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

        this.cropStatic.set({ left: l, top: t });
      });
      this.cropStatic.on('moved', () => {
        if (!this.cropTarget) {
          return;
        }
        this.cropTarget.set('opacity', 1);
      });
      this.cropStatic.on('modified', calculateCrop);
    }

    this._canvas.add(this.cropStatic);
    this.cropTarget.bringToFront();
  };

  cancelCrop = () => {
    if (!this.cropStatic || !this.cropBackups || !this.cropTarget) {
      return;
    }
    (this.cropTarget as any).cropStatic = this.cropStaticBackups;
    (this.cropTarget as any).cropping = false;
    this.cropTarget.setControlVisible('mtr', true).set({
      lockMovementX: false,
      lockMovementY: false,
      lockSkewingX: false,
      lockSkewingY: false,
      lockScalingFlip: false,
    });
    this._canvas.remove(this.cropStatic, this.cropTarget).add(this.cropBackups);
    this.cropBackups.moveTo(this.cropIndex);
    this._canvas.setActiveObject(this.cropBackups);
    this.cropTarget = null;
    this.cropBackups = null;
    this.cropStatic = null;
  };

  crop = () => {
    if (!this.cropStatic || !this.cropBackups || !this.cropTarget) {
      return;
    }

    (this.cropTarget as any).cropStatic = this.cropStatic;
    (this.cropTarget as any).cropping = false;
    this._canvas.setActiveObject(this.cropTarget);
    this._canvas.remove(this.cropStatic);
    this.cropTarget.setControlVisible('mtr', true).set({
      lockMovementX: false,
      lockMovementY: false,
      lockSkewingX: false,
      lockSkewingY: false,
      lockScalingFlip: false,
    });
    // 计算移动和旋转偏移，首次裁剪绑定监听事件
    if (!(this.cropTarget as any)?.cropbound) {
      (this.cropTarget as any).cropbound = true;
      let startLeft = 0;
      let startTop = 0;
      let startAngle = 0;

      this.cropTarget.on('mousedown', function (this: fabric.Image) {
        startLeft = this.left || 0;
        startTop = this.top || 0;
        startAngle = this.angle || 0;
      });
      this.cropTarget.on('moved', function (this: fabric.Image) {
        const cropStatic = (this as any).cropStatic as fabric.Image;
        const { left = 0, top = 0 } = this;
        cropStatic.set({
          left: (cropStatic.left || 0) + (left - startLeft),
          top: (cropStatic.top || 0) + (top - startTop),
        });
      });
      this.cropTarget.on('rotated', function (this: fabric.Image) {
        const cropStatic = (this as any).cropStatic as fabric.Image;
        const centerPoint = this.getCenterPoint();
        const { left = 0, top = 0 } = cropStatic;
        const point = getRotatedPoint(centerPoint, { x: left, y: top }, (this.angle || 0) - startAngle);
        cropStatic.set({
          left: point.x,
          top: point.y,
          angle: this.angle,
        });
      });
      this.cropTarget.on('scaled', function (this: fabric.Image) {
        if ((this as any).cropping) {
          return;
        }
        const { tl } = this.aCoords as ACoords;
        const cropStatic = (this as any).cropStatic as fabric.Image;
        const { tl: TL } = cropStatic.aCoords as ACoords;
        const { scaleX = 1, scaleY = 1, cropX = 0, cropY = 0, angle = 0 } = this;

        const x1 = TL.x - Math.sin((angle * Math.PI) / 180) * cropY * scaleY;
        const y1 = TL.y + Math.cos((angle * Math.PI) / 180) * cropY * scaleY;
        const x2 = TL.x + Math.cos((angle * Math.PI) / 180) * cropX * scaleX;
        const y2 = TL.y + Math.sin((angle * Math.PI) / 180) * cropX * scaleX;
        const x3 = x1 + (x2 - TL.x);
        const y3 = y1 + (y2 - TL.y);
        cropStatic.set({
          left: tl.x - (x3 - TL.x),
          top: tl.y - (y3 - TL.y),
          scaleX,
          scaleY,
        });
      });
    }
    // 清空
    this.cropTarget = null;
    this.cropBackups = null;
    this.cropStatic = null;
  };

  flipX = () => {
    const activeObj = this._canvas.getActiveObject();
    if (!activeObj || this.cropTarget) {
      return;
    }
    const flipX = !activeObj.get('flipX');
    activeObj.set('flipX', flipX);
    const cropStatic = (activeObj as any).cropStatic as fabric.Image;
    if (cropStatic) {
      const centerPoint = activeObj.getCenterPoint();
      const { tl, tr } = activeObj.aCoords as ACoords;
      const { tl: TL, tr: TR } = cropStatic.aCoords as ACoords;
      const point = symmetricalPoint(TL, linearFunction(centerPoint, { x: (tl.x + tr.x) / 2, y: (tl.y + tr.y) / 2 }));
      cropStatic.set({ left: point.x - (TR.x - TL.x), top: point.y - (TR.y - TL.y), flipX });
      this._canvas.renderAll();
    }
    this._canvas.renderAll();
  };

  flipY = () => {
    const activeObj = this._canvas.getActiveObject();
    if (!activeObj || this.cropTarget) {
      return;
    }
    const flipY = !activeObj.get('flipY');
    activeObj.set('flipY', flipY);
    const cropStatic = (activeObj as any).cropStatic as fabric.Image;
    if (cropStatic) {
      const centerPoint = activeObj.getCenterPoint();
      const { tl, bl } = activeObj.aCoords as ACoords;
      const { tl: TL, bl: BL } = cropStatic.aCoords as ACoords;
      const point = symmetricalPoint(TL, linearFunction(centerPoint, { x: (tl.x + bl.x) / 2, y: (tl.y + bl.y) / 2 }));
      cropStatic.set({ left: point.x - (BL.x - TL.x), top: point.y - (BL.y - TL.y), flipY });
      this._canvas.renderAll();
    }
    this._canvas.renderAll();
  };
}
