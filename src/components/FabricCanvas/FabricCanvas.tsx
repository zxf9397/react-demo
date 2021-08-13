import React, { useEffect } from 'react';
import Tabric from '../../utils/tabric';

export default function FabricCanvas() {
  useEffect(() => {
    const tabric = new Tabric('canvas');

    tabric.createImage(
      'https://clkj-dev.oss-cn-qingdao.aliyuncs.com/images/material/short/472-04c45fe3eb8243033b49518c55f87824.jpg?x-oss-process=image'
    );
  }, []);
  return <canvas id="canvas" width="1200" height="600" style={{ boxSizing: 'border-box', border: '1px solid skyblue' }}></canvas>;
}
