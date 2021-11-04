import React, { useCallback, useEffect, useRef, useState } from 'react';
import './Canvas.scss';
import DesignTool, { Design } from './utils/design.class';

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
  // const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    // if (ref.current) {
    // ref.current.value = design.getScaledWidth().toFixed(0);
    setValue(design.getScaledWidth().toFixed(0));
    // }
  }, [design]);
  return (
    <div className="coo-canvas__card">
      <input
        // ref={ref}
        value={value}
        type="range"
        min={0}
        max={400}
        onChange={(e) => {
          const width = e.target.value;
          setValue(width);
          // ref.current && (ref.current.value = width);
          design.scaleToWidth(+width);
          designer?.canvas.renderAll();
        }}
      />
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
      </div>
      <div className="coo-canvas__cards">
        {designs.map((design, i) => (
          <CanvasCard design={design} designer={designer} onDelete={() => removeCard(design)} key={i} />
        ))}
      </div>
    </div>
  );
}
