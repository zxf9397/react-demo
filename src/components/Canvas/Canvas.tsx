import { fabric } from 'fabric';
import React, { Component } from 'react';
import CropEnvironment from './utils/crop.class';

interface CanvasProps {
  id: string;
  width?: number;
  height?: number;
}

interface CanvasState {
  canvas: fabric.Canvas | null;
  cropEnv: CropEnvironment | null;
}

export default class Canvas extends Component<CanvasProps> {
  constructor(props: CanvasProps) {
    super(props);
  }

  imageUrl = 'https://clkj-dev.oss-cn-qingdao.aliyuncs.com/images/material/short/472-04c45fe3eb8243033b49518c55f87824.jpg?x-oss-process=image';
  options = {
    width: 400,
    height: 400,
    left: 400,
    top: 100,
  };

  state: CanvasState = {
    canvas: null,
    cropEnv: null,
  };

  addImage(url: string, options: Partial<fabric.Image> = {}) {
    if (!this.state.canvas) return null;
    return fabric.Image.fromURL(
      url,
      (image) => {
        image.set(options);
        this.state.canvas?.add(image).renderAll();
      },
      {
        crossOrigin: 'anonymous',
      }
    );
  }

  componentDidMount() {
    this.state.canvas = new fabric.Canvas('canvas');
    this.state.cropEnv = new CropEnvironment(this.state.canvas);
    this.setState({ ...this.state });
  }
  render() {
    return (
      <div className="coo-canvas">
        <div className="coo-canvas__board">
          <canvas id={this.props.id} width={this.props.width || 1200} height={this.props.height || 600}></canvas>
        </div>
        <div className="coo-canvas__buttons">
          <button onClick={() => this.addImage(this.imageUrl, this.options)}>添加图片</button>
          <button onClick={this.state.cropEnv?.enterCropping}>开始裁切</button>
          <button onClick={this.state.cropEnv?.cancelCropping}>取消裁切</button>
          <button onClick={this.state.cropEnv?.confirmCropping}>确认裁切</button>
        </div>
      </div>
    );
  }
}
