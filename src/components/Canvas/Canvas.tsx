import { Input } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import './Canvas.scss';
import DesignTool, { Design, InterfacePayload } from './utils/design.class';

const imageUrl = 'https://clkj-dev.oss-cn-qingdao.aliyuncs.com/images/material/short/472-04c45fe3eb8243033b49518c55f87824.jpg?x-oss-process=image';
const options = {
  width: 400,
  height: 400,
  left: 400,
  top: 100,
};

interface CanvasCardProps {
  design: Design;
  designer?: DesignTool;
  onDelete(): void;
}

function CanvasCard({ design, designer, onDelete }: CanvasCardProps) {
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [angle, setAngle] = useState('');

  useEffect(() => {
    setWidth(design.getScaledWidth().toFixed(0));
    setHeight(design.getScaledHeight().toFixed(0));
    setAngle(design.angle.toFixed(0));
  }, [design]);

  useEffect(() => {
    function change(payload: InterfacePayload) {
      setWidth((payload.width * payload.scaleX).toFixed(0));
      setHeight((payload.height * payload.scaleY).toFixed(0));
      setAngle(payload.angle.toFixed(0));
    }
    design.on('datachange', change);
    return () => {
      design.off('datachange', change);
    };
  }, []);
  const setDesign = useCallback(
    function <T extends keyof InterfacePayload>(type: T, handler: (value: string) => void) {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (typeof design[type] === 'number') {
          handler(value);
          designer?.set(design, type, Number(value));
        }
      };
    },
    [design]
  );
  return (
    <div className="coo-canvas__card">
      <div>
        <span>width:</span>
        <Input value={width} onChange={setDesign('width', setWidth)} />
      </div>
      <div>
        <span>height:</span>
        <Input value={height} onChange={setDesign('height', setHeight)} />
      </div>
      <div>
        <span>angle:</span>
        <Input value={angle} onChange={setDesign('angle', setAngle)} />
      </div>
      <button onClick={onDelete}>删除</button>
    </div>
  );
}

export default function Canvas() {
  const [designer, setDesigner] = useState<DesignTool>();
  const [designs, setDesigns] = useState<Design[]>([]);
  useEffect(() => {
    setDesigner(new DesignTool('canvas', { update: (designs) => setDesigns(designs) }));
  }, []);

  const addImage = useCallback(
    async (url: string, options?: Partial<fabric.Image>) => {
      designer?.addImage(url, options);
    },
    [designer, designs]
  );
  const removeCard = useCallback(
    (design) => {
      designer?.removeDesign(design);
    },
    [designer, designs]
  );
  return (
    <div className="coo-canvas">
      <div className="coo-canvas__board">
        <canvas id="canvas" width="1200" height="600"></canvas>
      </div>
      <div className="coo-canvas__buttons">
        <button onClick={() => addImage(imageUrl, options)}>添加图片</button>
        <button onClick={designer?.cropEnv.enterCropping}>开始裁切</button>
        <button onClick={designer?.cropEnv.cancelCropping}>取消裁切</button>
        <button onClick={designer?.cropEnv.confirmCropping}>确认裁切</button>
        <button onClick={designer?.addPath}>addPath</button>
      </div>
      <div className="coo-canvas__cards">
        {designs.map((design, i) => (
          <CanvasCard design={design} designer={designer} onDelete={() => removeCard(design)} key={i} />
        ))}
      </div>
    </div>
  );
}
