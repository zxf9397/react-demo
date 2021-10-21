import React, { useEffect, useState } from 'react';
import Tabric from '../../utils/tabric';

export default function FabricCanvas() {
  const [tabric, setTabric] = useState<Tabric>();
  const imageUrl = 'https://clkj-dev.oss-cn-qingdao.aliyuncs.com/images/material/short/472-04c45fe3eb8243033b49518c55f87824.jpg?x-oss-process=image';
  const options = {
    width: 400,
    height: 400,
    left: 400,
    top: 100,
  };
  useEffect(() => {
    const tabric = new Tabric('canvas');
    setTabric(tabric);
    (window as any).tabric = tabric;
  }, []);
  return (
    <div>
      <div style={{ position: 'relative', width: 'max-content', height: 'max-content' }}>
        <canvas id="canvas" width="1200" height="600" style={{ boxSizing: 'border-box', border: '1px solid skyblue' }}></canvas>
        {/* <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#ffffff55' }}></div> */}
      </div>
      <button onClick={() => tabric?.addImage(imageUrl, options)}>添加图片</button>
      <button onClick={tabric?.startCropping}>开始裁切</button>
      <button onClick={tabric?.cancelCropping}>取消裁切</button>
      <button onClick={tabric?.confirmCropping}>确认裁切</button>
      <button onClick={() => tabric?.flip('flipX')}>水平翻转</button>
      <button onClick={() => tabric?.flip('flipY')}>垂直翻转</button>
      <button onClick={() => tabric?.copy()}>copy</button>
      <button onClick={() => tabric?.paste()}>paste</button>
      <button onClick={() => tabric?.delete()}>delete</button>
      <div id="cropper"></div>
    </div>
  );
}
