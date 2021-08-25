import React, { useEffect, useState } from 'react';
import Tabric from '../../utils/tabric';

export default function FabricCanvas() {
  const [tabric, setTabric] = useState<Tabric>();
  useEffect(() => {
    const tabric = new Tabric('canvas');

    setTabric(tabric);

    tabric.addImage(
      'https://clkj-dev.oss-cn-qingdao.aliyuncs.com/images/material/short/472-04c45fe3eb8243033b49518c55f87824.jpg?x-oss-process=image'
    );

    // const cropper = new Cropper(document.querySelector('#cropper'));
    (window as any).tabric = tabric;
  }, []);
  return (
    <div>
      <div style={{ position: 'relative', width: 'max-content', height: 'max-content' }}>
        <canvas id="canvas" width="1200" height="600" style={{ boxSizing: 'border-box', border: '1px solid skyblue' }}></canvas>
        {/* <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#ffffff55' }}></div> */}
      </div>
      <button onClick={tabric?.startCrop}>裁剪</button>
      <button onClick={tabric?.cancelCrop}>取消</button>
      <button onClick={tabric?.crop}>确认</button>
      <button onClick={tabric?.flipX}>水平翻转</button>
      <button onClick={tabric?.flipY}>垂直翻转</button>
      <div id="cropper"></div>
    </div>
  );
}
