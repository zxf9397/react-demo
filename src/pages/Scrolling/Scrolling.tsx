import React, { Component, createRef } from 'react';
import type { CSSProperties } from 'react';
import './Scrolling.scss';

interface ScrollingProps {
  direction?: 'row' | 'column';
  className?: string;
  style?: CSSProperties;
}

interface ScrollingState {
  style: CSSProperties;
}

type BounceType = 'noBounce' | 'weekBounce' | 'strongBounce';

const defaultScrollingProps: ScrollingProps = {
  direction: 'column',
  className: '',
  style: {},
};

export default class Scrolling extends Component<
  ScrollingProps,
  ScrollingState
> {
  wrapperRef = createRef<HTMLDivElement>();
  scrollerRef = createRef<HTMLDivElement>();
  minY = 0;
  maxY = 0;
  wrapperHeight = 0;
  offsetY = 0;
  duration = 0;
  bezier = 'linear';
  startY = 0;
  pointY = 0;
  startTime = 0; // 惯性滑动范围内的 startTime
  momentumStartY = 0; // 惯性滑动范围内的 startY
  momentumTimeThreshold = 300; // 惯性滑动的启动 时间阈值
  momentumYThreshold = 15; // 惯性滑动的启动 距离阈值
  isStarted = false; // start锁

  state: ScrollingState = {
    style: {
      transform: `translate3d(0, ${this.offsetY}px, 0)`,
      transitionDuration: `${this.duration}ms`,
      transitionTimingFunction: this.bezier,
    },
  };

  constructor(props: ScrollingProps) {
    super(props);
  }

  onStart = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    const pointY = (e instanceof TouchEvent ? e.touches[0] : e) as unknown as
      | Touch
      | MouseEvent;
    this.isStarted = true;
    this.duration = 0;
    this.setStyle();
    this.stop();
    this.pointY = pointY.pageY;
    this.momentumStartY = this.startY = this.offsetY;
    this.startTime = new Date().getTime();
  };
  onMove = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (!this.isStarted) return;
    window.getSelection()?.removeAllRanges();
    const point = (e instanceof TouchEvent ? e.touches[0] : e) as unknown as
      | Touch
      | MouseEvent;
    const deltaY = point.pageY - this.pointY;
    // 浮点数坐标会影响渲染速度
    let offsetY = Math.round(this.startY + deltaY);
    // 超出边界时增加阻力
    if (offsetY < this.minY || offsetY > this.maxY) {
      offsetY = Math.round(this.startY + deltaY / 3);
    }
    this.offsetY = offsetY;
    const now = new Date().getTime();
    // 记录在触发惯性滑动条件下的偏移值和时间
    if (now - this.startTime > this.momentumTimeThreshold) {
      this.momentumStartY = this.offsetY;
      this.startTime = now;
    }
    this.setStyle();
  };
  onEnd = () => {
    if (!this.isStarted) return;
    this.isStarted = false;
    if (this.isNeedReset()) return;
    const absDeltaY = Math.abs(this.offsetY - this.momentumStartY);
    const duration = new Date().getTime() - this.startTime;
    // 启动惯性滑动
    if (
      duration < this.momentumTimeThreshold &&
      absDeltaY > this.momentumYThreshold
    ) {
      const momentum = this.momentum(
        this.offsetY,
        this.momentumStartY,
        duration
      );
      this.offsetY = Math.round(momentum.destination);
      this.duration = momentum.duration;
      this.bezier = momentum.bezier;
      this.setStyle();
    }
  };
  onTransitionEnd = () => {
    this.isNeedReset();
  };
  momentum(current: number, start: number, duration: number) {
    const durationMap = {
      noBounce: 2500,
      weekBounce: 800,
      strongBounce: 400,
    };
    const bezierMap = {
      noBounce: 'cubic-bezier(.17, .89, .45, 1)',
      weekBounce: 'cubic-bezier(.25, .46, .45, .94)',
      strongBounce: 'cubic-bezier(.25, .46, .45, .94)',
    };
    let type: BounceType = 'noBounce';
    // 惯性滑动加速度
    const deceleration = 0.003;
    // 回弹阻力
    const bounceRate = 10;
    // 强弱回弹的分割值
    const bounceThreshold = 300;
    // 回弹的最大限度
    const maxOverflowY = this.wrapperHeight / 6;
    let overflowY;

    const distance = current - start;
    const speed = (2 * Math.abs(distance)) / duration;
    let destination =
      current + (speed / deceleration) * (distance < 0 ? -1 : 1);
    if (destination < this.minY) {
      overflowY = this.minY - destination;
      type = overflowY > bounceThreshold ? 'strongBounce' : 'weekBounce';
      destination = Math.max(
        this.minY - maxOverflowY,
        this.minY - overflowY / bounceRate
      );
    } else if (destination > this.maxY) {
      overflowY = destination - this.maxY;
      type = overflowY > bounceThreshold ? 'strongBounce' : 'weekBounce';
      destination = Math.min(
        this.maxY + maxOverflowY,
        this.maxY + overflowY / bounceRate
      );
    }

    return {
      destination,
      duration: durationMap[type],
      bezier: bezierMap[type],
    };
  }
  // 超出边界时需要重置位置
  isNeedReset() {
    let offsetY;
    if (this.offsetY < this.minY) {
      offsetY = this.minY;
    } else if (this.offsetY > this.maxY) {
      offsetY = this.maxY;
    }
    if (typeof offsetY !== 'undefined') {
      this.offsetY = offsetY;
      this.duration = 500;
      this.bezier = 'cubic-bezier(.165, .84, .44, 1)';
      this.setStyle();
      return true;
    }
    return false;
  }
  stop() {
    if (!this.scrollerRef.current) return;
    // 获取当前 translate 的位置
    const matrix = window
      .getComputedStyle(this.scrollerRef.current)
      .getPropertyValue('transform');
    this.offsetY = Math.round(+matrix.split(')')[0].split(', ')[5]);
    this.setStyle();
  }

  setStyle() {
    if (!this.wrapperRef.current || !this.scrollerRef.current) return;
    this.scrollerRef.current.style.transform = `translate3d(0, ${this.offsetY}px, 0)`;
    this.scrollerRef.current.style.transitionDuration = `${this.duration}ms`;
    this.scrollerRef.current.style.transitionTimingFunction = this.bezier;
  }

  componentDidMount() {
    if (!this.wrapperRef.current || !this.scrollerRef.current) return;
    const { height: wrapperHeight } =
      this.wrapperRef.current.getBoundingClientRect();
    const { height: scrollHeight } =
      this.scrollerRef.current.getBoundingClientRect();
    this.wrapperHeight = wrapperHeight;
    this.minY = wrapperHeight - scrollHeight;
  }

  render() {
    return (
      <div
        ref={this.wrapperRef}
        className={`scrolling-wrapper ${this.props.className}`}
        style={this.props.style}
        onTouchStart={this.onStart}
        onTouchMove={this.onMove}
        onTouchEnd={this.onEnd}
        onTouchCancel={this.onEnd}
        onMouseDown={this.onStart}
        onMouseMove={this.onMove}
        onMouseUp={this.onEnd}
        onMouseLeave={this.onEnd}
        onTransitionEnd={this.onTransitionEnd}
      >
        <div
          ref={this.scrollerRef}
          className="scrolling-scroller"
          style={this.state.style}
        >
          {this.props.children}
        </div>
      </div>
    );
  }
}
