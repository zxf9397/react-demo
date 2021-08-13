import React, { useEffect, useRef, useState } from 'react';
import 'antd/dist/antd.css';
import EditableTable from './components/EditTable/EditTable';
import ScrollLoad from './components/ScrollLoad/ScrollLoad';
import Mytable from './components/EditTable/Mytable';
import FabricCanvas from './components/FabricCanvas/FabricCanvas';
// import Scrolling from './pages/Scrolling/Scrolling';
// import VirtualScroll from './pages/VirtualScroll/VirtualScroll';

function App() {
  const [list, setList] = useState<number[]>([]);
  useEffect(() => {
    let list = [];
    for (let i = 0; i < 100; i++) {
      list.push(i);
    }
    setList(list);
  }, []);
  return (
    <div className="App">
      {/* <EditableTable /> */}
      <FabricCanvas />
      {/* <Mytable /> */}
    </div>
  );
}

export default App;
