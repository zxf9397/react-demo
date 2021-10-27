import { fabric } from 'fabric';
import { linearFunction, Point } from './func';
import {
  bindFollow,
  getTargetCroppedProperties,
  getOriginScaleProperties,
  setOriginMinScale,
  updateMinions,
  wrapWithModified,
  getTargetScaleProperties,
  initializeCroppingEvents,
  initializeUnCroppingEvents,
  setTargetScaleCroods,
  setOriginMoveRectRange,
  getOriginMovingProperties,
} from './fabricFunc';

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', Point>;
type CroppingObject = fabric.Image | null;
export default class Tabric {
  private _canvas;

  constructor(el: string) {
    this._canvas = new fabric.Canvas(el, {
      width: 1200,
      height: 600,
    });
    this._canvas.preserveObjectStacking = true;
    this._canvas.centeredScaling = true;
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
  mouseDown = false;

  // initialize cropping event
  _initializeCropping = () => {
    this._canvas.on('mouse:down', (e) => {
      if (!this.croppingTarget || !this.croppingOrigin) {
        return;
      }
      if (!e.transform?.corner) {
        setOriginMoveRectRange(this.croppingTarget, this.croppingOrigin, e);
        this.mouseDown = true;
      }
      if (e.target === this.croppingTarget || e.target === this.croppingOrigin) {
        return;
      }
      // 裁切中，点击其他区域默认触发裁切事件
      this.confirmCropping();
    });
    this._canvas.on('mouse:up', (e) => {
      this.mouseDown = false;
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
    ['object:modified', 'object:rotating', 'object:scaling', 'object:fliped', 'selection:cleared'].forEach((event) => {
      this._canvas.on(event, wrapWithModified(updateMinions));
    });
    this._canvas.on('mouse:move', (e) => {
      if (!this.croppingTarget || !this.croppingOrigin || !this.mouseDown) {
        return;
      }
      this.croppingOrigin.set(getOriginMovingProperties(this.croppingTarget, this.croppingOrigin, e)).setCoords();
      this.croppingTarget.set(getTargetCroppedProperties(this.croppingTarget, this.croppingOrigin)).setCoords();
      this._canvas.renderAll();
    });
    this._canvas.on('after:render', (e: any) => {
      if (!this.croppingTarget && !this.croppingOrigin) return;
      (this.croppingTarget as any)._renderControls(e.ctx, { hasControls: false, hasBorders: true });
      (this.croppingOrigin as any)._renderControls(e.ctx, { hasControls: false, hasBorders: true });
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

    initializeCroppingEvents(this.croppingTarget, this.croppingOrigin);

    if (!(this.croppingTarget as any).bound) {
      (this.croppingTarget as any).bound = true;
      // bind cropping target
      this.croppingTarget.on('mousedown', (e: fabric.IEvent) => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }
        if (e.transform?.corner) {
          setTargetScaleCroods(this.croppingTarget);
        }
      });
      this.croppingTarget.on('scaling', (e) => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }
        const opts = getTargetScaleProperties(this.croppingTarget, this.croppingOrigin, e);
        this.croppingTarget.set(opts).setCoords();
        calculateCrop();
      });
      const calculateCrop = () => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }
        const opts = getTargetCroppedProperties(this.croppingTarget, this.croppingOrigin);
        this.croppingTarget.set(opts).setCoords();
      };
      this.croppingTarget.on('scaled', calculateCrop);

      // bind cropping origin
      this.croppingOrigin.on('mousedown', (e: fabric.IEvent) => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }
        // scaling
        if (e.transform?.corner) {
          setOriginMinScale(this.croppingTarget, this.croppingOrigin, e.transform.corner);
          return;
        }
      });
      this.croppingOrigin.on('scaling', (e) => {
        if (!this.croppingTarget || !this.croppingOrigin) {
          return;
        }
        if (e.transform?.corner) {
          const opts = getOriginScaleProperties(this.croppingTarget, this.croppingOrigin, e.transform?.corner);
          this.croppingOrigin.set(opts).setCoords();
          calculateCrop();
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
    initializeUnCroppingEvents(this.croppingTarget);
    this._canvas.remove(this.croppingOrigin, this.croppingTarget).add(this.croppingTargetBackup);
    this.croppingTargetBackup.moveTo(this.croppingIndex);
    this._canvas.setActiveObject(this.croppingTargetBackup);
    // clear
    this.croppingTarget = null;
    this.croppingTargetBackup = null;
    this.croppingOrigin = null;
  };

  confirmCropping = () => {
    if (!this.croppingOrigin || !this.croppingTargetBackup || !this.croppingTarget) {
      return;
    }

    (this.croppingTarget as any).croppingOrigin = this.croppingOrigin;
    this._canvas.setActiveObject(this.croppingTarget);
    this.croppingTarget.moveTo(this.croppingIndex);
    this._canvas.remove(this.croppingOrigin);
    initializeUnCroppingEvents(this.croppingTarget);
    bindFollow(this.croppingTarget);
    // clear
    this.croppingTarget = null;
    this.croppingTargetBackup = null;
    this.croppingOrigin = null;
  };

  flip = (type: 'flipX' | 'flipY') => {
    const activeObj = this._canvas.getActiveObject();
    if (!activeObj || this.croppingTarget) {
      return;
    }
    const flipX = !activeObj.get(type);
    activeObj.set(type, flipX).setCoords();
    // setCoords for activeSelection._objects
    (activeObj as any)?.addWithUpdate?.();
    this._canvas.renderAll();
    this._canvas.fire('object:fliped', { target: activeObj });
  };

  clipper: fabric.Object | null = null;

  paste = () => {
    if (!this.clipper) return;
    this.clipper.clone((cloned: fabric.Object) => {
      this._canvas.discardActiveObject();
      cloned.set({
        left: (cloned.left || 0) + 20,
        top: (cloned.top || 0) + 20,
      });
      if (cloned.isType('activeSelection')) {
        cloned.canvas = this._canvas;
        (cloned as fabric.ActiveSelection).forEachObject((obj) => {
          this._canvas.add(obj);
        });
        cloned.setCoords();
      } else {
        this._canvas.add(cloned);
      }
      this._canvas.setActiveObject(cloned);
    });
  };

  copy = () => {
    this.clipper = this._canvas.getActiveObject();
  };

  delete = () => {
    const active = this._canvas.getActiveObject();
    this._canvas.discardActiveObject();
    if (active.isType('activeSelection')) {
      (active as fabric.ActiveSelection).forEachObject((obj) => {
        this._canvas.remove(obj);
      });
    } else {
      this._canvas.remove(active);
    }
  };
}
