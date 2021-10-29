export interface Point {
  x: number;
  y: number;
}

export interface LinearFunction {
  k: number;
  b: number;
  func: (x: number) => number;
  reverseFunc: (y: number) => number;
  A: Point;
  B: Point;
}

export function pointToPointDistance(pointA: Point, pointB: Point) {
  return Math.sqrt(Math.pow(pointA.x - pointB.x, 2) + Math.pow(pointA.y - pointB.y, 2));
}

export function pointToLinearDistance(point: Point, linear: LinearFunction) {
  let distance = 0;
  if (linear.A.x === linear.B.x) {
    // linear 平行于 y 轴
    distance = Math.abs(linear.A.x - point.x);
  } else if (linear.A.y === linear.B.y) {
    // linear 平行于 x 轴
    distance = Math.abs(linear.A.y - point.y);
  } else {
    distance = Math.abs((linear.k * point.x - point.y + linear.b) / Math.sqrt(Math.pow(linear.k, 2) + 1));
  }
  // (x1-x3)*(y2-y3)-(y1-y3)*(x2-x3)
  const direction = Math.sign((linear.A.x - point.x) * (linear.B.y - point.y) - (linear.A.y - point.y) * (linear.B.x - point.x));
  return direction * distance;
}

export function linearsIntersection(linear1: LinearFunction, linear2: LinearFunction): Point {
  if (linear1.k === linear2.k) {
    return { x: Infinity, y: Infinity };
  }
  if (!Number.isFinite(linear1.k)) {
    const x = linear1.reverseFunc(0);
    return { x, y: linear2.func(x) };
  }
  if (!Number.isFinite(linear2.k)) {
    const x = linear2.reverseFunc(0);
    return { x, y: linear1.func(x) };
  }
  const x = (linear2.b - linear1.b) / (linear1.k - linear2.k);
  return {
    x,
    y: linear1.func(x),
  };
}

export function getRotatedPoint(origin: Point, point: Point, angle: number): Point {
  return {
    x: (point.x - origin.x) * Math.cos((angle * Math.PI) / 180) - (point.y - origin.y) * Math.sin((angle * Math.PI) / 180) + origin.x,
    y: (point.x - origin.x) * Math.sin((angle * Math.PI) / 180) + (point.y - origin.y) * Math.cos((angle * Math.PI) / 180) + origin.y,
  };
}

export function linearFunction(pointA: Point, pointB: Point): LinearFunction {
  const k = (pointA.y - pointB.y) / (pointA.x - pointB.x);
  const b = pointA.y - k * pointA.x;
  if (k === 0) {
    const sign = Math.sign(pointB.x - pointA.x) * Infinity;
    const y = pointA.y;
    return {
      k,
      b,
      reverseFunc: () => sign,
      func: () => y,
      A: pointA,
      B: pointB,
    };
  } else if (!Number.isFinite(k)) {
    const sign = Math.sign(pointB.y - pointA.y) * Infinity;
    const x = pointA.x;
    return {
      k,
      b,
      reverseFunc: () => x,
      func: () => sign,
      A: pointA,
      B: pointB,
    };
  } else {
    return {
      k,
      b,
      reverseFunc: (y: number) => (y - b) / k,
      func: (x: number) => k * x + b,
      A: pointA,
      B: pointB,
    };
  }
}

/**
 * 获取点关于直线的对称点
 * @param point
 * @param linear
 * @returns
 */
export function symmetricalPoint(point: Point, linear: LinearFunction) {
  if (linear.k === 0) {
    return {
      x: point.x,
      y: 2 * linear.b - point.y,
    };
  } else if (!Number.isFinite(linear.k)) {
    return {
      x: 2 * linear.reverseFunc(0) - point.x,
      y: point.y,
    };
  } else {
    return {
      x: ((1 - linear.k ** 2) * point.x + 2 * linear.k * point.y - 2 * linear.k * linear.b) / (linear.k ** 2 + 1),
      y: (2 * linear.k * point.x + (linear.k ** 2 - 1) * point.y + 2 * linear.b) / (linear.k ** 2 + 1),
    };
  }
}

export function pedalPoint(point: Point, linear: LinearFunction): Point {
  if (!Number.isFinite(linear.k)) {
    return { x: linear.reverseFunc(0), y: point.y };
  }

  if (linear.k === 0) {
    return { x: point.x, y: linear.func(0) };
  }

  const x = (point.x + linear.k * point.y - linear.k * linear.b) / (linear.k * linear.k + 1);
  const y = (linear.k * linear.k * point.y + linear.k * point.x + linear.b) / (linear.k * linear.k + 1);
  return { x, y };
}

export function perpendicularLinear(point: Point, linear: LinearFunction) {
  if (!Number.isFinite(linear.k)) {
    return linearFunction(point, { x: linear.reverseFunc(0), y: point.y });
  }

  if (linear.k === 0) {
    return linearFunction(point, { x: point.x, y: linear.func(0) });
  }

  const x = (point.x + linear.k * point.y - linear.k * linear.b) / (linear.k * linear.k + 1);
  const y = (linear.k * linear.k * point.y + linear.k * point.x + linear.b) / (linear.k * linear.k + 1);
  return linearFunction(point, { x, y });
}

/**
 * 已知 start 点对应 end 点， 求 point 点的对应点
 * @param point point
 * @param start start point
 * @param end end point
 * @returns corresponding  point
 */
export function getCorrespondingPoint(point: Point, start: Point, end: Point): Point {
  return { x: point.x - start.x + end.x, y: point.y - start.y + end.y };
}
