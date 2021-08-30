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
    const actionPerformed = actionHandler(eventData, transform, x, y);
    if (actionPerformed) {
      (fabric as any).controlsUtils.fireEvent(eventName, commonEventInfo(eventData, transform, x, y));
    }
    return actionPerformed;
  };
}
function setControlsActionHandler(obj: fabric.Object) {
  // 解决缩放时的抖动
  obj.controls.tl.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.mt.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingYOrSkewingX);
  obj.controls.tr.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.bl.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingEqually);
  obj.controls.ml.actionHandler = wrapWithFireEvent('scaling', (fabric as any).controlsUtils.scalingXOrSkewingY);
}
function wrapWithModified(handler: (target: fabric.Image, e: { angle?: number; target?: fabric.Object }) => void) {
  return function (e: fabric.IEvent) {
    let targets: fabric.Image[] = [];
    if (e.target?.type === 'image' && (e.target as any).croppingOrigin) {
      targets = [e.target as fabric.Image];
    } else if (e.target?.type === 'activeSelection') {
      targets = (e.target as fabric.ActiveSelection)._objects.filter((obj) => obj.type === 'image' && (obj as any).croppingOrigin) as fabric.Image[];
    }
    targets.forEach((target) => {
      if ((e as any).action === 'rotate') {
        handler(target, {
          target: e.target,
          angle: e.target?.type === 'image' ? target.angle : (target.angle || 0) + (e.target?.angle || 0),
        });
      } else {
        handler(target, { target: e.target });
      }
    });
  };
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
    this._canvas.on('mouse:down', (e) => {
      if (!this.croppingTarget || e.target === this.croppingTarget || e.target === this.croppingOrigin) {
        return;
      }
      // 裁切中，点击其他区域默认触发裁切事件
      this.confirmCropping();
    });
    this._canvas.on('mouse:dblclick', (e) => {
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
    ['object:modified', 'object:rotating', 'object:scaling', 'object:fliped'].forEach((event) => {
      this._canvas.on(event, wrapWithModified(updateMinions));
    });

    this._canvas.on('object:modified', wrapWithModified(bindFollow));
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
    bindFollow(this.croppingTarget);
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
    const flipX = !activeObj.flipX;
    activeObj.set('flipX', flipX).setCoords();
    wrapWithModified(updateMinions)({ target: activeObj } as any);
    this._canvas.fire('object:fliped', { target: activeObj });
    this._canvas.renderAll();
  };

  flipY = () => {
    const activeObj = this._canvas.getActiveObject();
    if (!activeObj || this.croppingTarget) {
      return;
    }
    const flipY = !activeObj.flipY;
    activeObj.set('flipY', flipY).setCoords();
    this._canvas.fire('object:fliped', { target: activeObj });
    this._canvas.renderAll();
  };
}

function updateMinions(croppingTarget: fabric.Object) {
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

  // 设置“随从” X/Y 轴平方向都不翻转
  croppingOrigin.set({
    flipX: false,
    flipY: false,
  });

  // 设置“随从”原点的位置，这里将矩形的中心作为原点
  croppingOrigin.setPositionByOrigin({ x: opt.translateX, y: opt.translateY } as fabric.Point, 'center', 'center');

  // 将上面从矩阵数组转换而得到的属性集合对象作为“随从”的新配置
  croppingOrigin.set(opt);

  // set 方法并不能让和坐标相关的矩阵变换生效，所以还需要再执行下面的方法
  croppingOrigin.setCoords();
}

function bindFollow(croppingTarget: fabric.Object) {
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
