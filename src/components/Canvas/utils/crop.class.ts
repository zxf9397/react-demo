import { Point } from '../../../utils/func';
import { LinearFunction } from '../../../utils/func';
import { fabric } from 'fabric';
import OriginalEventsEnv from './orginal.class';
import CroppedEventsEnv from './cropped.class';

export type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;
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
export type CroppedImage = fabric.Image & Cropped;
export type OriginalImage = fabric.Image & Origin;
export interface CropEnvironmentOptions {
  minWidth?: number; // 最小裁切宽度
  minHeight?: number; // 最小裁切高度
  cornerWidth?: number; // 折线宽度
  cornerLength?: number; // 折线长度
  originalImageOpacity?: number; // 原图透明度
}
const defaultControls = (({ tl, tr, br, bl }) => ({ tl, tr, br, bl }))(fabric.Image.prototype.controls);
const controlsHidden: { [key in Controls]?: boolean } = { mtr: false, ml: false, mt: false, mr: false, mb: false };
const eventLock: { [key in ControlsEvents]?: boolean } = {
  lockMovementX: true,
  lockMovementY: true,
  lockSkewingX: true,
  lockSkewingY: true,
  centeredScaling: false,
};
const DEFAULT_CROP_ENV_OPTS: Required<CropEnvironmentOptions> = {
  minWidth: 0,
  minHeight: 0,
  cornerWidth: 4,
  cornerLength: 10,
  originalImageOpacity: 0.8,
};

function wrapWithModified(handler: (target: fabric.Object, origin: fabric.Object) => void) {
  return function (e: fabric.IEvent) {
    let targets: CroppedImage[] = [];
    if (e.target?.type === 'image' && (e.target as CroppedImage).originalImage) {
      targets = [e.target as CroppedImage];
    } else if (e.target?.type === 'activeSelection') {
      targets = (e.target as fabric.Group)._objects.filter((obj) => (obj as CroppedImage).originalImage) as CroppedImage[];
    }
    targets.forEach((target) => {
      target.originalImage && handler(target, target.originalImage);
    });
  };
}

export default class CropEnvironment {
  cropping = false;
  cropped: CroppedImage | null = null;
  croppedBackup: CroppedImage | null = null;
  original: OriginalImage | null = null;
  originalBackup: OriginalImage | null = null;
  private index: number = -1;
  private croppedEventsEnv: CroppedEventsEnv;
  private originalEventEnv: OriginalEventsEnv;
  private preserveObjectStacking: boolean | undefined;
  private options: Required<CropEnvironmentOptions> = DEFAULT_CROP_ENV_OPTS;

  constructor(private canvas: fabric.Canvas, options?: CropEnvironmentOptions) {
    this.options = { ...DEFAULT_CROP_ENV_OPTS, ...options };
    this.croppedEventsEnv = new CroppedEventsEnv(this, canvas, { minWidth: options?.minWidth, minHeight: options?.minHeight });
    this.originalEventEnv = new OriginalEventsEnv(this, canvas);
    this.preserveObjectStacking = canvas.preserveObjectStacking;
    this.bind();
  }

  private mouseDown = (e: fabric.IEvent) => {
    if (!this.cropped || !this.original) return;
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
    ['object:modified', 'selection:cleared'].forEach((event) => {
      this.canvas.on(event, this._updateMinions);
    });
  }

  unbound() {
    this.canvas.off('mouse:down', this.mouseDown);
    this.canvas.off('mouse:dblclick', this.dblclick);
    this.canvas.off('after:render', this.afterRender);
    ['object:modified', 'object:rotating', 'object:scaling', 'object:fliped', 'selection:cleared'].forEach((event) => {
      this.canvas.off(event, this._updateMinions);
    });
    this.croppedEventsEnv.unbound();
    this.originalEventEnv.unbound();
  }

  private drawLine = (ctx: CanvasRenderingContext2D, x: number, y: number, fabricObject: fabric.Object) => {
    let points: number[] = [];
    const lineWidth = Math.min(fabricObject.getScaledWidth(), this.options.cornerLength);
    const lineHeight = Math.min(fabricObject.getScaledHeight(), this.options.cornerLength);
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
    ctx.lineWidth = this.options.cornerWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();
  };

  private renderIcon = ((drawLine) => {
    return function (this: any, ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: object, fabricObject: fabric.Object) {
      ctx.save();
      ctx.translate(left, top);
      ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle || 0));
      drawLine(ctx, this.x, this.y, fabricObject);
      ctx.restore();
    };
  })(this.drawLine);

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
      cropped.controls[name] = new fabric.Control({
        ...ctl,
        render: this.renderIcon,
        sizeX: this.options.cornerLength * 1.5,
        sizeY: this.options.cornerLength * 1.5,
      });
    });
    // 设置原对象的属性
    original.setControlsVisibility(controlsHidden).set({
      ...eventLock,
      lockScalingFlip: true,
      centeredScaling: false,
      opacity: this.options.originalImageOpacity,
    });
    // 设置裁切对象的属性
    cropped.setControlsVisibility(controlsHidden).set(eventLock);
    // 清空裁切对象的最小缩放
    cropped.set('minScaleLimit', undefined);
    // 进入裁切状态
    cropped.cropping = true;
    //
    this.canvas.preserveObjectStacking = true;
    // 绑定事件
    if (!cropped.bound) {
      cropped.bound = true;
      // bind cropping target
      cropped.on('mousedown', (e: fabric.IEvent) => {
        if (!this.cropped || !this.original) return;
        if (e.transform?.corner) {
          this.croppedEventsEnv.initializeBeforeTargetScaling(this.cropped);
        }
      });
      cropped.on('scaling', (e) => {
        if (!this.cropped || !this.original) return;
        const opts = this.croppedEventsEnv.getTargetScalingProperties(this.cropped, this.original, e);
        this.cropped.set(opts).setCoords();
        calculateCrop();
      });
      const calculateCrop = () => {
        if (!this.cropped || !this.original) return;
        const opts = this.croppedEventsEnv.getTargetCroppedProperties(this.cropped, this.original);
        this.cropped.set(opts).setCoords();
      };
      cropped.on('scaled', calculateCrop);

      // bind cropping origin
      original.on('mousedown', (e: fabric.IEvent) => {
        if (!this.cropped || !this.original) return;
        // scaling
        if (e.transform?.corner) {
          this.originalEventEnv.initializeBeforeOriginScaling(this.cropped, this.original, e.transform.corner);
          return;
        }
      });
      original.on('scaling', (e) => {
        if (!this.cropped || !this.original) return;
        if (e.transform?.corner) {
          const opts = this.originalEventEnv.getOriginScalingProperties(this.cropped, this.original, e.transform?.corner);
          this.original.set(opts).setCoords();
          calculateCrop();
        }
      });
      original.on('modified', calculateCrop);
    }
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
    const minScaleX = this.options.minWidth / scaledWidth;
    const minScaleY = this.options.minHeight / scaledHeight;
    cTarget.set('minScaleLimit', Math.max(minScaleX * (cTarget.scaleX || 1), minScaleY * (cTarget.scaleY || 1)));
    // 退出裁切状态
    cTarget.cropping = false;
    //
    this.canvas.preserveObjectStacking = this.preserveObjectStacking;
  }

  enterCropping = () => {
    if (this.cropped) return;
    const active = this.canvas.getActiveObject() as CroppedImage;
    if (active.type !== 'image') return;

    this.index = this.canvas.getObjects().findIndex((klass) => klass === active);
    this.original = fabric.util.object.clone(active.originalImage || active) as OriginalImage;
    this.croppedBackup = fabric.util.object.clone(active);
    this.cropped = active;
    this.originalBackup = active.originalImage;

    this.initializeCroppingEvents(this.cropped, this.original);

    this.canvas.add(this.original);
    this.cropped.bringToFront();
    this.cropping = true;
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
    this.cropping = false;
  };

  confirmCropping = () => {
    if (!this.original || !this.croppedBackup || !this.cropped) return;
    this.cropped.originalImage = this.original;
    this.canvas.setActiveObject(this.cropped);
    this.cropped.moveTo(this.index);
    this.canvas.remove(this.original);
    this.initializeUnCroppingEvents(this.cropped);
    CropEnvironment.bindFollow(this.cropped, this.original);
    // clear
    this.cropped = null;
    this.croppedBackup = null;
    this.original = null;
    this.cropping = false;
  };

  static bindFollow(leader: fabric.Object, follower: fabric.Object) {
    const master = leader as CroppedImage;
    const servant = follower as OriginalImage;
    if (master.cropping) return;

    // 计算裁切对象当前的变换矩阵，并得到逆转变换
    const bossTransform = master.calcTransformMatrix();
    const invertedBossTransform = fabric.util.invertTransform(bossTransform);
    // 关键：拿到能描述 裁切对象和原图对象 关系的变换矩阵
    // 该方法接收三个参数，前两个参数不分先后
    const desiredTransform = fabric.util.multiplyTransformMatrices(
      invertedBossTransform,
      // 返回原图对象的变换矩阵
      servant.calcTransformMatrix()
    );

    // 将“主随关系”的变换矩阵保存在“随从”上
    servant.relationship = desiredTransform;
    return desiredTransform;
  }

  static updateMinions(leader: fabric.Object, follower: fabric.Object, relationship?: number[]) {
    const master = leader as CroppedImage;
    const servant = follower as OriginalImage;
    // 直接返回
    if (master.cropping || (!servant.relationship && !relationship)) return;

    // 将两个矩阵变换叠加，得到新的变换规则
    const newTransform = fabric.util.multiplyTransformMatrices(
      // 返回当前 “主人” 经过 move/rotate/... 操作后的变换矩阵
      master.calcTransformMatrix(),
      // 和 “主随关系” 矩阵相叠加
      relationship || servant.relationship
    );

    // 将包含6个数字元素的数组转换为属性的集合
    const opt = fabric.util.qrDecompose(newTransform);

    const originalFlipX = master.flipX;
    const originalFlipY = master.flipY;
    // 设置“随从” X/Y 轴平方向都不翻转
    servant.set({
      flipX: false,
      flipY: false,
      scaleX: opt.scaleX,
      scaleY: opt.scaleY,
      skewX: opt.skewX,
      skewY: opt.skewY,
    });

    if (originalFlipX !== servant.flipX || originalFlipY !== servant.flipY) {
      servant.flipX = originalFlipX;
      servant.flipY = originalFlipY;
      opt.angle -= 180;
    }
    servant.angle = opt.angle;

    // 设置“随从”原点的位置，这里将矩形的中心作为原点
    servant.setPositionByOrigin(new fabric.Point(opt.translateX, opt.translateY), 'center', 'center');

    // 将上面从矩阵数组转换而得到的属性集合对象作为“随从”的新配置
    // set 方法并不能让和坐标相关的矩阵变换生效，所以还需要再执行下面的方法
    servant.setCoords();
  }
}
