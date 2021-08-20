import React, { useEffect } from 'react';
import Tabric from '../../utils/tabric';

export default function FabricCanvas() {
  useEffect(() => {
    const tabric = new Tabric('canvas');

    tabric.createImage(
      'https://clkj-dev.oss-cn-qingdao.aliyuncs.com/images/material/short/472-04c45fe3eb8243033b49518c55f87824.jpg?x-oss-process=image'
    );
  }, []);
  return (
    <div>
      <div style={{ position: 'relative', width: 'max-content', height: 'max-content' }}>
        <canvas id="canvas" width="1200" height="600" style={{ boxSizing: 'border-box', border: '1px solid skyblue' }}></canvas>
        {/* <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: '#ffffff55' }}></div> */}
      </div>
      <button>裁剪</button>
    </div>
  );
}
