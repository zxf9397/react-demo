import { fabric } from 'fabric';
import cixiu from './cixiu.jpg';

const type = 'embroidery';
let embroideryImage;
new fabric.Image.fromURL(cixiu, (image) => {
  embroideryImage = image;
});

fabric.Image.filters[type] = fabric.util.createClass(fabric.Image.filters.BaseFilter, {
  type,
  fragmentSource: `
    precision highp float;
    uniform sampler2D uTexture;
    uniform sampler2D uEmbroideryTexture;
    varying vec2 vTexCoord;
    uniform float u_colors[30];
    uniform float uScaleX;
    uniform float uScaleY;
    void main() {
      vec4 c1 = texture2D(uTexture, vTexCoord);
      vec4 c1_new;
      if(c1.a == 0.0) {
        // discard;
        return;
      }
      float min_value = 1000.0;
      for(int i = 0; i < 30 / 3; i++) {
        float temp = 
        abs(pow(c1.r, 2.0) - pow(u_colors[i * 3], 2.0)) * 0.299 + 
        abs(pow(c1.g, 2.0) - pow(u_colors[i * 3 + 1], 2.0)) * 0.587 + 
        abs(pow(c1.b, 2.0) - pow(u_colors[i * 3 + 2], 2.0)) * 0.114;
        if(temp <= min_value) {
          min_value = temp;
          c1_new = vec4(u_colors[i * 3], u_colors[i * 3 + 1], u_colors[i * 3 + 2], c1.a);
        }
      }
      vec4 c2 = texture2D(uEmbroideryTexture, vec2(mod(vTexCoord.x * uScaleX, 1.0), mod(vTexCoord.y * uScaleY, 1.0)));
      vec4 muti = c1_new * c2;
      const float opcatiy = 0.1;
      float alpha = opcatiy + muti.a * (1.0 - opcatiy);
      gl_FragColor = vec4(
          (c2.rgb * opcatiy + muti.rgb * muti.a * (1.0 - opcatiy)) / alpha,
          alpha
        );
    }
  `,

  applyToWebGL: function (options) {
    const gl = options.context;
    const embroideryTexture = this.createTexture(options.filterBackend, embroideryImage);
    this.bindAdditionalTexture(gl, embroideryTexture, gl.TEXTURE1);
    // this.callSuper('applyToWebGL', options);
    const shader = this.retrieveShader(options);
    if (options.pass === 0 && options.originalTexture) {
      gl.bindTexture(gl.TEXTURE_2D, options.originalTexture);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, options.sourceTexture);
    }
    gl.useProgram(shader.program);
    this.sendAttributeData(gl, shader.attributeLocations, options.aPosition);

    gl.uniform1f(shader.uniformLocations.uStepW, 1 / options.sourceWidth);
    gl.uniform1f(shader.uniformLocations.uStepH, 1 / options.sourceHeight);

    gl.uniform1f(shader.uniformLocations.uScaleX, (options.klass.width * options.klass.scaleX) / 512);
    gl.uniform1f(shader.uniformLocations.uScaleY, (options.klass.height * options.klass.scaleY) / 512);

    this.sendUniformData(gl, shader.uniformLocations);
    gl.viewport(0, 0, options.destinationWidth, options.destinationHeight);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    //
    this.unbindAdditionalTexture(gl, gl.TEXTURE1);
  },
  createTexture: function (backend, image) {
    if (image) {
      return backend.getCachedTexture(image.cacheKey, image._element);
    } else {
      return backend.createTexture();
    }
  },
  getUniformLocations: function (gl, program) {
    return {
      uEmbroideryTexture: gl.getUniformLocation(program, 'uEmbroideryTexture'),
      u_colors: gl.getUniformLocation(program, 'u_colors'),
      uScaleX: gl.getUniformLocation(program, 'uScaleX'),
      uScaleY: gl.getUniformLocation(program, 'uScaleY'),
    };
  },
  sendUniformData: function (gl, uniformLocations) {
    gl.uniform1i(uniformLocations.uEmbroideryTexture, 1);
    gl.uniform1fv(
      uniformLocations.u_colors,
      new Float32Array(
        // prettier-ignore
        [
          255, 0, 0,
          255, 255, 0,
          255,0,255,
          0, 255, 0,
          0, 0, 255,
          0,255,255,
          255,255,255,
          0,0,0,
          11,26,118,
          29,39,63,
        ]
        .map(a => a / 255)
      )
    );
  },

  toObject: function () {
    return {
      type,
      embroideryImage,
    };
  },
});

fabric.Image.filters[type].fromObject = function (object, callback) {
  const imagePromises = [];
  if (object.embroideryImage) {
    imagePromises.push(
      new Promise((resolve) => {
        fabric.Image.fromObject(
          object.embroideryImage,
          function (image) {
            resolve({ type: 'embroideryImage', image });
          },
          { crossOrigin: 'anonymous' }
        );
      })
    );
  }
  let options = fabric.util.object.clone(object);
  Promise.all(imagePromises).then((imageDatas) => {
    imageDatas.forEach((imageData) => {
      options[imageData.type] = imageData.image;
    });
    callback(new fabric.Image.filters[type](options));
  });
};

function resizeCanvasIfNeeded(pipelineState) {
  var targetCanvas = pipelineState.targetCanvas,
    width = targetCanvas.width,
    height = targetCanvas.height,
    dWidth = pipelineState.destinationWidth,
    dHeight = pipelineState.destinationHeight;

  if (width !== dWidth || height !== dHeight) {
    targetCanvas.width = dWidth;
    targetCanvas.height = dHeight;
  }
}

const applyFilters = function (filters, source, width, height, targetCanvas, cacheKey, klass) {
  var gl = this.gl;
  var cachedTexture;
  if (cacheKey) {
    cachedTexture = this.getCachedTexture(cacheKey, source);
  }
  var pipelineState = {
    originalWidth: source.width || source.originalWidth,
    originalHeight: source.height || source.originalHeight,
    sourceWidth: width,
    sourceHeight: height,
    destinationWidth: width,
    destinationHeight: height,
    context: gl,
    sourceTexture: this.createTexture(gl, width, height, !cachedTexture && source),
    targetTexture: this.createTexture(gl, width, height),
    originalTexture: cachedTexture || this.createTexture(gl, width, height, !cachedTexture && source),
    passes: filters.length,
    webgl: true,
    aPosition: this.aPosition,
    programCache: this.programCache,
    pass: 0,
    filterBackend: this,
    targetCanvas: targetCanvas,
    klass: klass,
  };
  var tempFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFbo);
  filters.forEach(function (filter) {
    filter && filter.applyTo(pipelineState);
  });
  resizeCanvasIfNeeded(pipelineState);
  this.copyGLTo2D(gl, pipelineState);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteTexture(pipelineState.sourceTexture);
  gl.deleteTexture(pipelineState.targetTexture);
  gl.deleteFramebuffer(tempFbo);
  targetCanvas.getContext('2d').setTransform(1, 0, 0, 1, 0, 0);
  return pipelineState;
};

fabric.Image.prototype.applyFilters = function (filters) {
  filters = filters || this.filters || [];
  filters = filters.filter(function (filter) {
    return filter && !filter.isNeutralState();
  });
  this.set('dirty', true);

  // needs to clear out or WEBGL will not resize correctly
  this.removeTexture(this.cacheKey + '_filtered');

  if (filters.length === 0) {
    this._element = this._originalElement;
    this._filteredEl = null;
    this._filterScalingX = 1;
    this._filterScalingY = 1;
    return this;
  }

  var imgElement = this._originalElement,
    sourceWidth = imgElement.naturalWidth || imgElement.width,
    sourceHeight = imgElement.naturalHeight || imgElement.height;

  if (this._element === this._originalElement) {
    // if the element is the same we need to create a new element
    var canvasEl = fabric.util.createCanvasElement();
    canvasEl.width = sourceWidth;
    canvasEl.height = sourceHeight;
    this._element = canvasEl;
    this._filteredEl = canvasEl;
  } else {
    // clear the existing element to get new filter data
    // also dereference the eventual resized _element
    this._element = this._filteredEl;
    this._filteredEl.getContext('2d').clearRect(0, 0, sourceWidth, sourceHeight);
    // we also need to resize again at next renderAll, so remove saved _lastScaleX/Y
    this._lastScaleX = 1;
    this._lastScaleY = 1;
  }
  if (!fabric.filterBackend) {
    fabric.filterBackend = fabric.initFilterBackend();
    fabric.filterBackend.applyFilters = applyFilters;
  }
  fabric.filterBackend.applyFilters(filters, this._originalElement, sourceWidth, sourceHeight, this._element, this.cacheKey, this);
  if (this._originalElement.width !== this._element.width || this._originalElement.height !== this._element.height) {
    this._filterScalingX = this._element.width / this._originalElement.width;
    this._filterScalingY = this._element.height / this._originalElement.height;
  }
  return this;
};
