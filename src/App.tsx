import React, { useEffect, useRef, useState } from 'react';
import 'antd/dist/antd.css';
// import FabricCanvas from './components/FabricCanvas/FabricCanvas';
import Canvas from './components/Canvas/Canvas';

function App() {
  return (
    <div className="App">
      {/* <FabricCanvas /> */}
      <Canvas id="canvas" />
    </div>
  );
}

export default App;
