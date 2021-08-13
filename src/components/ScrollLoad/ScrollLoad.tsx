import React, { useCallback, useEffect, useState } from 'react';
import LIST from './list';
import MeScroll from 'mescroll.js/mescroll.min.js';
import 'mescroll.js/mescroll.min.css';
import './ScrollLoad.scss';

export default function ScrollLoad() {
  const [list, setList] = useState(LIST.result.splice(0, 8));
  const [mescroll, setMescroll] = useState<any>();

  const upCallback = useCallback(
    ({ num, size }: { num: number; size: number }) => {
      console.log(num, size);
      mescroll.endByPage(list.length, 2);
    },
    [list.length]
  );
  useEffect(() => {
    const mescroll = new MeScroll('mescroll', {
      up: {
        callback: upCallback,
        page: {
          num: 0,
          size: 10,
        },
        htmlNodata: '<p class="upwarp-nodata">-- END --</p>',
        noMoreSize: 5,
        toTop: {
          src: '../img/mescroll-totop.png',
          offset: 1000,
        },
        empty: {
          warpId: 'xxid',
          icon: '../img/mescroll-empty.png',
          tip: '暂无相关数据~',
        },
        lazyLoad: {
          use: true,
          attr: 'imgurl',
        },
      },
    });
    setMescroll(mescroll);
  }, []);
  return (
    <div id="mescroll" className="mescroll">
      <div className="list">
        {list.map(({ id, imgUrl }) => (
          <img src={imgUrl} key={id} />
        ))}
      </div>
    </div>
  );
}
