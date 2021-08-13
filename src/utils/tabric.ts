import { fabric } from 'fabric';

const icon = {
  rotate: `data:image/svg+xml;charset=utf-8;base64,PHN2ZyB2aWV3Qm94PScwIDAgMTAyNCAxMDI0JyB2ZXJzaW9uPScxLjEnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zycgd2lkdGg9JzMyJyBoZWlnaHQ9JzMyJz48cGF0aCBkPSdNOTYyLjQ5MzQ0IDM0NC40NDhjLTQxLjg1Ni0xMTEuNzQ0LTEzMC4zMDQtMjA5LjQ3Mi0yNDEuOTg0LTI1Ni0xMDIuNC01MS4yLTIzMi43NjgtNTEuMi0zNDkuMTItOS4zNDRBNTE2LjI4OCA1MTYuMjg4IDAgMCAwIDE4NS4yMTM0NCAyMDAuMTI4bC05LjI4IDEzLjk1MnYtMTIwLjk2QzE3NS45MzM0NCA2OS43NiAxNjEuOTE3NDQgNTEuMiAxMzQuMDEzNDQgNTEuMmMtMjcuOTA0IDAtNDEuOTIgMTguNTYtNDEuOTIgNDEuOTJ2MjUxLjMyOGMwIDIzLjIzMiAxNC4wMTYgNDEuODU2IDQxLjkyIDQxLjg1NmgyNTEuMzI4YzIzLjI5NiAwIDQxLjkyLTEzLjk1MiA0MS45Mi00MS44NTYgMC0yMy4yOTYtMTMuOTUyLTQxLjkyLTQxLjkyLTQxLjkySDIxNy44NTM0NGw5LjM0NC05LjI4YzQxLjg1Ni02MC41NDQgOTcuNzI4LTEwNy4wNzIgMTY3LjU1Mi0xMzUuMDQgODguNDQ4LTM3LjE4NCAxOTUuNDU2LTMyLjUxMiAyODguNTc2IDkuMzQ0IDg4LjQ0OCA0MS45MiAxNTguMjcyIDExMS43NDQgMTk1LjQ1NiAyMDQuOCAzNy4yNDggOTMuMTIgMzcuMjQ4IDIwMC4xMjgtNC42MDggMjkzLjI0OC00MS45MiA4OC40NDgtMTExLjc0NCAxNTguMjcyLTIwNC44IDE5NS41Mi04OC40NDggMzcuMTg0LTE5NS41MiAzMi41NzYtMjg4LjY0LTkuMzQ0LTg4LjM4NC00MS44NTYtMTU4LjIwOC0xMTEuNjgtMTk1LjQ1Ni0yMDQuOC00LjY3Mi0xMy45NTItMjMuMjk2LTI3LjkwNC0zNy4yNDgtMjcuOTA0LTQuNjcyIDAtOS4yOCAwLTE4LjU2IDQuNjA4YTU2LjA2NCA1Ni4wNjQgMCAwIDAtMjMuMjk2IDIzLjI5NiAzOS43NDQgMzkuNzQ0IDAgMCAwIDAgMzIuNjRjNDEuODU2IDExMS42OCAxMzAuMzA0IDIwOS40MDggMjQxLjk4NCAyNTZhNDU1LjI5NiA0NTUuMjk2IDAgMCAwIDE5MC44NDggNDEuODU2YzU1Ljg3MiAwIDExNi4zNTItOS4zNDQgMTYyLjk0NC0yNy45NjggMTExLjY4LTQxLjg1NiAyMDkuNDA4LTEzMC4zMDQgMjU2LTI0MS45ODQgNDEuODU2LTEyNS42OTYgNDYuNTI4LTI1MS4zOTIgNC42MDgtMzYzLjA3MnonIGZpbGw9JyNmZmZmZmYnPjwvcGF0aD48L3N2Zz4=`,
  crop: `data:image/svg+xml;charset=utf-8;base64,PHN2ZyB2aWV3Qm94PScwIDAgMTAyNCAxMDI0JyB2ZXJzaW9uPScxLjEnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zycgd2lkdGg9JzMyJyBoZWlnaHQ9JzMyJz48cGF0aCBkPSdNODUzLjMxMiA3MzkuNTg0VjI1NmMwLTQ3LjEwNC0zOC4yMDgtODUuMzEyLTg1LjMxMi04NS4zMTJIMjg0LjQxNlYwSDE3MC42ODh2MTcwLjY4OEgwdjExMy43MjhoMTcwLjY4OFY3NjhjMCA0Ny4xMDQgMzguMjA4IDg1LjMxMiA4NS4zMTIgODUuMzEyaDQ4My41ODRWMTAyNGgxMTMuNzI4di0xNzAuNjg4SDEwMjR2LTExMy43MjhoLTE3MC42ODh6IG0tNTY4Ljg5NiAwVjI4NC40MTZoNDU1LjE2OHY0NTUuMTY4SDI4NC40MTZ6JyBmaWxsPScjZmZmZmZmJz48L3BhdGg+PC9zdmc+`,
  scale: `data:image/svg+xml;charset=utf-8;base64,PHN2ZyB2aWV3Qm94PScwIDAgMTAyNCAxMDI0JyB2ZXJzaW9uPScxLjEnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zycgd2lkdGg9JzMyJyBoZWlnaHQ9JzMyJz48cGF0aCBkPSdNNTE2LjMxNTQyOSA0NjAuNTA3NDI5TDE1Mi41NzYgOTYuNzY4aDMzNy4yNjE3MTRWMTAuNDU5NDI5SDUuMTkzMTQzdjQ3Ni40NTI1NzFoODYuMzA4NTcxdi0zMjkuMTQyODU3bDM2My43Mzk0MjkgMzYzLjgxMjU3MSA2MS4wNzQyODYtNjEuMDc0Mjg1eiBtNDA5LjYgNjYuMTIxMTQydjMyOS4xNDI4NThMNTYyLjE3NiA0OTIuMDMybC02MS4wNzQyODYgNjEuMDAxMTQzIDM2My44MTI1NzIgMzYzLjczOTQyOEg1MjcuNTc5NDI5djg2LjMwODU3MkgxMDEyLjIyNFY1MjYuNjI4NTcxaC04Ni4zMDg1NzF6JyBmaWxsPScjZmZmZmZmJz48L3BhdGg+PC9zdmc+`,
  delete: `data:image/svg+xml;charset=utf-8;base64,PHN2ZyB2aWV3Qm94PScwIDAgMTAyNCAxMDI0JyB2ZXJzaW9uPScxLjEnIHhtbG5zPSdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2Zycgd2lkdGg9JzMyJyBoZWlnaHQ9JzMyJz48cGF0aCBkPSdNNTE3LjU2OCAyMS42MzJBMTg1LjM0NCAxODUuMzQ0IDAgMCAwIDMzMi40MTYgMjAwLjk2SDk4LjYyNGE0Ny4yOTYgNDcuMjk2IDAgMCAwIDAgOTQuNDY0aDUyLjA5NnY1MjguMzg0YzAgOTkuMiA2Ny4yIDE4MC4yODggMTUwLjQgMTgwLjI4OGg0MjMuNTUyYzgyLjk0NCAwIDE1MC4zMzYtODAuNjQgMTUwLjMzNi0xODAuMjg4VjI5NS43NDRoNDcuMjMyYTQ3LjI5NiA0Ny4yOTYgMCAwIDAgMC05NC40NjRoLTIxOS43NzZBMTg0LjgzMiAxODQuODMyIDAgMCAwIDUxNy41NjggMjEuNjMyek00MjAuOTI4IDIwMC45NmMzLjQ1Ni01MS4yIDQ1LjE4NC05MC44OCA5Ni44MzItOTAuODggNTEuNjQ4IDAgOTMuMzc2IDM5Ljg3MiA5Ni4zMiA5MC44OEg0MjAuOTI4ek0zMDAuOTI4IDkxNS44NGMtMjkuNDQgMC02MS44ODgtMzcuODI0LTYxLjg4OC05Mi4wMzJWMjk1Ljc0NGg1NDcuMzI4djUyOC41NzZjMCA1NC4wMTYtMzIuNDQ4IDkxLjk2OC02MS44ODggOTEuOTY4SDMwMC45Mjh2LTAuNTEyeiBtNjMuNDg4LTExMy42YzIxLjU2OCAwIDM5LjM2LTIxLjU2OCAzOS4zNi00OC42NFY0NzYuMDMyYzAtMjcuMDcyLTE3LjY2NC00OC42NC0zOS4zNi00OC42NC0yMS42MzIgMC0zOS40MjQgMjEuNTY4LTM5LjQyNCA0OC42NHYyNzcuNTY4YzAgMjYuODggMTcuMzQ0IDQ4LjY0IDM5LjQyNCA0OC42NHogbTE0Mi40NjQgMGMyMS41NjggMCAzOS4zNi0yMS41NjggMzkuMzYtNDguNjRWNDc2LjAzMmMwLTI3LjA3Mi0xNy42LTQ4LjY0LTM5LjM2LTQ4LjY0LTIxLjU2OCAwLTM5LjM2IDIxLjU2OC0zOS4zNiA0OC42NHYyNzcuNTY4YzAgMjYuODggMTcuNzkyIDQ4LjY0IDM5LjM2IDQ4LjY0eiBtMTQ5Ljg4OCAwYzIxLjU2OCAwIDM5LjM2LTIxLjU2OCAzOS4zNi00OC42NFY0NzYuMDMyYzAtMjcuMDcyLTE3LjYtNDguNjQtMzkuMzYtNDguNjQtMjEuNTY4IDAtMzkuMzYgMjEuNTY4LTM5LjM2IDQ4LjY0djI3Ny41NjhjMCAyNi44OCAxNy4xNTIgNDguNjQgMzkuMzYgNDguNjR6JyBmaWxsPScjZmZmZmZmJz48L3BhdGg+PC9zdmc+`,
  refresh: `data:image/svg+xml;charset=utf-8;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBzdGFuZGFsb25lPSJubyI/PjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+PHN2ZyB0PSIxNjE2MDMzNzAzNDc5IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDExNzAgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9Ijk2MjciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMjI4LjUxNTYyNSIgaGVpZ2h0PSIyMDAiPjxkZWZzPjxzdHlsZSB0eXBlPSJ0ZXh0L2NzcyI+PC9zdHlsZT48L2RlZnM+PHBhdGggZD0iTTEwNzEuMTAzMjM1IDYxMC4xNTgwMWMtMy40Mzc3MTItNi43MjkxMzgtMjcuMDYyODM4LTI5LjYyMjgzNi0zNC4yMzA4MzMtMzEuODkwMjYzLTcuMjQxMTM4LTIuMzQwNTctMzQuMDg0NTQ3LTMuNTEwODU1LTQwLjgxMzY4NSAwbC0xMTQuODM0MjA0IDcwLjE0Mzk1YTI4LjUyNTY5NCAyOC41MjU2OTQgMCAwIDAgMjUuOTY1Njk2IDUwLjgzNDI0OWw0NC4yNTEzOTctMjAuNjk5NDE0Yy05NS4yMzE5MzIgMTQ0LjQ1NzA0LTIwNi45OTQxMzggMjA3LjcyNTU2Ni0zODguMDk1NzIzIDIwNy43MjU1NjYtMTk5LjUzMzU3MiAwLTM0My45OTA2MTEtOTguNjY5NjQ0LTQwMy45Njc3MTEtMjg4LjYyMTUwOC0yLjkyNTcxMi0xMC4wMjA1NjQtMTIuNDM0Mjc3LTEzLjE2NTcwNS0yMi41Mjc5ODQtMTUuNTA2Mjc0LTEwLjE2Njg1LTIuMzQwNTctNTAuMzIyMjUgNy43NTMxMzctNTcuMzQzOTU5IDE1LjUwNjI3NC02Ljk0ODU2NiA3LjY3OTk5NS03LjgyNjI4IDIyLjE2MjI3LTQuNDYxNzExIDMxLjk2MzQwNmE1MTIuODc3MzQ4IDUxMi44NzczNDggMCAwIDAgMTgyLjg1NzAxMiAyNTYuNTg0OTZBNTA3LjY4NDIwOSA1MDcuNjg0MjA5IDAgMCAwIDU2My4yNzI3NDEgOTg3LjQyODU5OGMxMTEuMDMwNzc4IDAgMjI5LjAxMDEyMi0zNC45NjIyNjEgMzE3LjgwNTQ4Ny0xMDEuMTU2NSA3Mi4xMTg4MDYtNTMuNjEzNjc2IDExOS45NTQyLTEwNC41MjEwNjggMTU1LjcyMTAzMS0xODYuOTUzMDA5bDM0LjIzMDgzMyA1My4wMjg1MzRhMjguNTI1Njk0IDI4LjUyNTY5NCAwIDAgMCA1MC45MDczOTItMjYuMDM4ODM5IDcyMDEuNzEzNzEzIDcyMDEuNzEzNzEzIDAgMCAwLTUwLjkwNzM5Mi0xMTYuMDc3NjMxek01NC4wNTI1MzMgMzc3LjEyNTAzM2MzLjQzNzcxMiA2LjcyOTEzOCAyNy4wNjI4MzggMjkuNjIyODM2IDM0LjIzMDgzMyAzMS45NjM0MDYgNy4yNDExMzggMi4zNDA1NyAzNC4wODQ1NDcgMy40Mzc3MTIgNDAuODEzNjg1IDBsMTE0LjgzNDIwMy03MC4yMTcwOTJhMjguNTI1Njk0IDI4LjUyNTY5NCAwIDAgMC0yNS45NjU2OTUtNTAuODM0MjVsLTQ0LjI1MTM5NyAyMC42OTk0MTRjOTUuMjMxOTMyLTE0NC4zODM4OTcgMjA2Ljk5NDEzOC0yMDcuNjUyNDIzIDM4OC4wOTU3MjItMjA3LjY1MjQyMyAxOTkuNTMzNTcyIDAgMzQzLjk5MDYxMSA5OC41OTY1MDEgNDAzLjk2NzcxMiAyODguNjIxNTA4IDIuOTI1NzEyIDkuOTQ3NDIxIDEyLjQzNDI3NyAxMy4xNjU3MDUgMjIuNTI3OTg0IDE1LjUwNjI3NSAxMC4xNjY4NSAyLjM0MDU3IDUwLjMyMjI1LTcuODI2MjggNTcuMjcwODE2LTE1LjUwNjI3NSA3LjAyMTcwOS03LjY3OTk5NSA3Ljg5OTQyMy0yMi4xNjIyNyA0LjUzNDg1NC0zMS45NjM0MDZhNTEyLjg3NzM0OCA1MTIuODc3MzQ4IDAgMCAwLTE4Mi44NTcwMTItMjU2LjY1ODEwMkE1MDcuNjg0MjA5IDUwNy42ODQyMDkgMCAwIDAgNTYxLjgwOTg4NCAwLjAwMDczMUM0NTAuNzc5MTA3IDAuMDAwNzMxIDMzMi43OTk3NjIgMzQuOTYyOTkyIDI0NC4wMDQzOTcgMTAxLjA4NDA4OGMtNzIuMTE4ODA2IDUzLjYxMzY3Ni0xMTkuOTU0MiAxMDQuNTk0MjExLTE1NS43MjEwMzEgMTg2Ljk1MzAwOUw1NC4xMjU2NzYgMjM1LjA4MTcwNmEyOC41MjU2OTQgMjguNTI1Njk0IDAgMSAwLTUwLjkwNzM5MyAyNi4wMzg4MzljMzEuNTk3NjkyIDcyLjg1MDIzNCA0OC41NjY4MjIgMTExLjU0Mjc3NyA1MC45MDczOTMgMTE2LjAwNDQ4OHoiIHAtaWQ9Ijk2MjgiIGZpbGw9IiNmZmZmZmYiPjwvcGF0aD48L3N2Zz4=`,
};

const CONTROLS = ['bl', 'br', 'mb', 'ml', 'mr', 'mt', 'tl', 'tr', 'mtr'] as const;
type ControlType = typeof CONTROLS[number];
type FabricType = 'Image' | 'Group' | 'ActiveSelection';
interface ControlProperty {
  icon?: string;
  x?: number;
  y?: number;
  sizeX?: number;
  sizeY?: number;
  offsetX?: number;
  offsetY?: number;
  touchSize?: number;
  cornerSize?: number;
  actionName?: string;
  cursorStyle?: string;
  onClick?: () => void;
  actionHandler?: () => void;
}

const setCustomControl = (
  type: FabricType,
  seat: ControlType,
  {
    icon,
    x,
    y,
    sizeX = 24,
    sizeY = 24,
    offsetX,
    offsetY,
    touchSize = 36,
    cornerSize = 24,
    cursorStyle,
    onClick,
    actionHandler,
    actionName,
  }: ControlProperty
) => {
  const img = new Image();
  if (icon) {
    img.src = icon;
  }
  const control = (fabric[type].prototype as any).controls[seat];
  if (x) {
    control.x = x;
  }
  if (y) {
    control.y = y;
  }
  if (offsetX) {
    control.offsetX = offsetX;
  }
  if (offsetY) {
    control.offsetY = offsetY;
  }

  control.sizeX = sizeX;
  control.sizeY = sizeY;
  control.touchSizeX = touchSize;
  control.touchSizeY = touchSize;

  control.render = function (this: any, ctx: CanvasRenderingContext2D, left: number, top: number, _styleOverride: any, fabricObject: fabric.Object) {
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle || 0));
    if (cursorStyle) {
      control.cursorStyleHandler = () => cursorStyle;
      control.cursorStyle = cursorStyle;
    }
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, 2 * Math.PI);
    ctx.fill();
    ctx.drawImage(img, -cornerSize / 2, -cornerSize / 2, cornerSize, cornerSize);

    ctx.restore();
  };
  if (onClick) {
    control.actionHandler = () => {};
    control.mouseUpHandler = onClick;
  }
  if (actionHandler) {
    control.actionHandler = actionHandler;
  }
  if (actionName) {
    control.actionName = actionName;
  }
};

interface EventTransform {
  corner: ControlType;
  original: fabric.Object;
  originX: string;
  originY: string;
  width: number;
}

interface SizeAndPosition {
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

type ACoords = Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>;

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
  }

  renderAll() {
    this._canvas.renderAll();
  }

  addImage(url: string) {
    return fabric.Image.fromURL(
      url,
      (image) => {
        image
          .set('width', (image.width || 0) / 2)
          .set('height', (image.height || 0) / 2)
          .set('top', 100)
          .set('left', 100)
          .set({});

        const clonedImage: fabric.Image = fabric.util.object.clone(image);

        this._canvas.add(clonedImage);
        const coverRect = new fabric.Rect({
          width: image.get('width'),
          height: image.get('height'),
          top: image.get('top'),
          left: image.get('left'),
          fill: '#ffffff55',
        });
        // this._canvas.add(coverRect);
        // this._canvas.add(image);

        /* 全 */
        // const rect = new fabric.Rect({
        //   width: image.get('width'),
        //   height: image.get('height'),
        //   top: -(image.get('height') || 0) / 2,
        //   left: -(image.get('width') || 0) / 2,
        // });
        /* 右下 */
        // const rect = new fabric.Rect({
        //   width: image.get('width'),
        //   height: image.get('height'),
        //   top: 0,
        //   left: 0,
        // });
        /* 右上 */
        const rect = new fabric.Rect({
          width: image.get('width'),
          height: (image.get('height') || 2) / 2,
          top: -(image.get('height') || 0) / 2,
          left: 0,
        });
        // const rect = new fabric.Rect({
        //   width: (image.get('width') || 0) + 10,
        //   height: (image.get('height') || 2) / 2 + 10,
        //   top: -(image.get('height') || 0) / 2,
        //   left: 0 - 10,
        // });
        // image.set({
        //   width: (image.get('width') || 0) / 2,
        //   height: (image.get('height') || 0) / 2,
        //   top: 100 + (image.get('height') || 0) / 2,
        //   left: 100 + (image.get('width') || 0) / 2,
        // });
        const activeRect = new fabric.Rect({
          width: (image.get('width') || 0) / 2,
          height: (image.get('height') || 0) / 2,
          top: image.get('top') || 0,
          left: (image.get('left') || 0) + (image.get('width') || 0) / 2,
          fill: 'transparent',
        });

        activeRect.on('scaling', (e) => {
          const { corner } = e.transform as EventTransform;
          if (corner === 'bl') {
            rect.set({
              width: (image.get('width') || 0) + 100,
              height: (image.get('height') || 2) / 2 + 100,
              top: -(image.get('height') || 0) / 2,
              left: 0 - 10,
            });
            image.clipPath = rect;
            this._canvas.renderAll();
          }
        });
        // this._canvas.add(activeRect);

        // image.clipPath = rect;
        // this._canvas.controlsAboveOverlay = true;
        // const clipPath = new fabric.Rect({ top: image.get('top'), left: image.get('left'), width: 200, height: 200 });
        // this._canvas.clipPath = clipPath;
        // this._canvas.add(image);

        const deskRect = new fabric.Rect({
          width: this._canvas.getWidth(),
          height: this._canvas.getHeight(),
          fill: '#ffffff55',
          // hasControls: false,
          // hasBorders: false,
          // lockMovementX: true,
          // lockMovementY: true,
          // hoverCursor: 'default',
        });

        const clipPath = new fabric.Rect({
          width: 100,
          height: 100,
          fill: 'red',
        });

        deskRect.clipPath = clipPath;

        this._canvas.add(deskRect);

        this._canvas.renderAll();
      },
      { crossOrigin: 'anonymous', objectCaching: false }
    );
  }

  newImage(url: string) {
    const logoImg = new Image();
    logoImg.onload = () => {
      const logo = new fabric.Image(logoImg, {
        width: 400,
        height: 400,
        left: 400,
        top: 0,
        angle: 45,
      });

      const clonedImage: fabric.Image = fabric.util.object.clone(logo);
      const L = clonedImage.get('left') || 0;
      const W = clonedImage.get('width') || 0;

      let clipPath: fabric.Image = fabric.util.object.clone(logo);
      clipPath.set({
        top: -(clipPath.get('height') || 0) / 2,
        left: -(clipPath.get('width') || 0) / 2,
      });

      logo.clipPath = clipPath;

      // (logo as any).controls['mr'].actionHandler = (e: MouseEvent, obj: any, x: number, y: number) => {
      //   const klass = obj.target as fabric.Object;
      //   const left = klass.get('left') || 0;
      //   if (x >= L + W) {
      //     klass.set({
      //       width: L + W - left,
      //     });
      //     return true;
      //   }
      //   klass.set({
      //     width: x - left,
      //   });
      //   return true;
      // };

      // (logo as any).controls['ml'].actionHandler = (e: MouseEvent, obj: any, x: number, y: number) => {
      //   const klass = obj.target as fabric.Object;
      //   const width = klass.get('width') || 0;
      //   const left = klass.get('left') || 0;
      //   if (x < L) {
      //     klass.set({
      //       left: L,
      //       width: left + width - L,
      //     });
      //     return true;
      //   }
      //   if (x > L + W) {
      //     klass.set({
      //       left: L + W,
      //       width: 0,
      //     });
      //     return true;
      //   }
      //   klass.set({
      //     left: x,
      //     width: left + width - x,
      //   });
      //   return true;
      // };

      this._canvas.add(clonedImage);
      this._canvas.add(logo);
    };
    logoImg.src = url;
  }

  createImage(url: string) {
    const img = new Image();
    img.src = url;
    img.onload = () => {
      const image = new fabric.Image(img, {
        width: 400,
        height: 400,
        left: 400,
        top: 20,
        angle: 30,
      });

      this._canvas.add(image);

      let clipOrigin = {
        left: -(image.get('width') || 0) / 2,
        top: -(image.get('height') || 0) / 2,
      };

      let imagePosition = {
        width: image.get('width') || 0,
        height: image.get('height') || 0,
        top: image.get('top') || 0,
        left: image.get('left') || 0,
        angle: image.get('angle') || 0,
        aCoords: image.get('aCoords') as Record<'tl' | 'tr' | 'br' | 'bl', fabric.Point>,
      };

      const clipImage: fabric.Image = fabric.util.object.clone(image);

      clipImage.setControlVisible('mtr', false);

      const activeClipRect = new fabric.Rect({
        width: imagePosition.width,
        height: imagePosition.height,
        left: imagePosition.left,
        top: imagePosition.top,
        angle: imagePosition.angle,
        fill: 'transparent',
      });

      function calculate(e: fabric.IEvent) {
        const cornerType = e.transform?.corner as ControlType;
        const { width = 0, height = 0, scaleX = 1, scaleY = 1, left = 0, top = 0, angle = 0, aCoords } = (e.transform as any).target as fabric.Rect;
        const { tl, tr, br, bl } = (e.transform as any).target.aCoords as Record<string, fabric.Point>;
        let options: SizeAndPosition = {};

        // console.log(Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2)), width * scaleX);

        // console.log(Math.sqrt(Math.pow(tl.x, 2) + Math.pow(tl.y, 2)));

        const { tl: tL } = clipImage.get('aCoords') as Record<string, fabric.Point>;

        // console.log(clipImage.get('top'), top)

        switch (cornerType) {
          case 'mr':
          case 'mb':
          case 'br':
            options = {
              width: Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2)),
              height: Math.sqrt(Math.pow(tr.x - br.x, 2) + Math.pow(br.y - tr.y, 2)),
              top: clipOrigin.top + (top - imagePosition.top),
              left: clipOrigin.left + (left - imagePosition.left),
            };
            break;
          case 'tr':
          case 'mt':
            options = {
              width: Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2)),
              height: Math.sqrt(Math.pow(tr.x - br.x, 2) + Math.pow(br.y - tr.y, 2)),
              top: clipOrigin.top + Math.sqrt(Math.pow(tL.x - tl.x, 2) + Math.pow(tl.y - tL.y, 2)),
              left: clipOrigin.left,
            };
            break;
          case 'ml':
            options = {
              width: Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2)),
              height: Math.sqrt(Math.pow(tr.x - br.x, 2) + Math.pow(br.y - tr.y, 2)),
              top: clipOrigin.top,
              left: clipOrigin.left,
            };
            break;
        }
        const clipPath = new fabric.Rect(options);
        clipImage.set('clipPath', clipPath);
      }

      const mrActionHandler = (clipImage as any).controls['mr'].actionHandler;

      (clipImage as any).controls['mr'].actionHandler = (e: MouseEvent, obj: any, x: number, y: number) => {
        const klass = obj.target as fabric.Object;
        const { tl: A1, tr: B1, br: C1, bl: D1 } = klass.get('aCoords') as ACoords;
        const { tl: A2, tr: B2, br: C2, bl: D2 } = image.get('aCoords') as ACoords;
        /*
          L1: ax+by+c=0
          L2: ax+by+d=0
          距离=|c-d|/√（a^2+b^2）

          
          a * B1.x + b * 
         */
        return mrActionHandler(e, obj, x, y);
      };

      (clipImage as any).controls['ml'].actionHandler = (e: MouseEvent, obj: any, x: number, y: number) => {
        const klass = obj.target as fabric.Object;
        const width = klass.get('width') || 0;
        const left = klass.get('left') || 0;
        if (x < imagePosition.left) {
          klass.set({
            left: imagePosition.left,
            width: left + width - imagePosition.left,
          });
          return true;
        }
        if (x > imagePosition.left + imagePosition.width) {
          klass.set({
            left: imagePosition.left + imagePosition.width,
            width: 0,
          });
          return true;
        }
        klass.set({
          left: x,
          width: left + width - x,
        });
        return true;
      };

      // activeClipRect.on('scaling', calculate);
      // activeClipRect.on('scaled', calculate);

      clipImage.on('scaling', (e: fabric.IEvent) => {
        const { width = 0, height = 0, scaleX = 1, scaleY = 1, left = 0, top = 0, angle = 0, aCoords } = (e.transform as any).target as fabric.Rect;
        const { tl, tr, br, bl } = (e.transform as any).target.aCoords as Record<string, fabric.Point>;
        clipImage.set({
          width: width * scaleX,
          height: height * scaleY,
          cropX: left - imagePosition.left,
          cropY: top - imagePosition.top,
          scaleX: 1,
          scaleY: 1,
        });
      });

      this._canvas.add(clipImage);
      // this._canvas.add(activeClipRect);
    };
  }
}
