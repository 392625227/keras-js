/* global Vue */

import './mnist-cnn.css'

import debounce from 'lodash/debounce'
import range from 'lodash/range'
import * as utils from './utils'

const MODEL_CONFIG = {
  filepaths: {
    model: '/demos/data/mnist_cnn/mnist_cnn.json',
    weights: '/demos/data/mnist_cnn/mnist_cnn_weights.buf',
    metadata: '/demos/data/mnist_cnn/mnist_cnn_metadata.json'
  }
}

/**
 *
 * VUE COMPONENT
 *
 */
export const MnistCnn = Vue.extend({
  template: `
  <div class="demo mnist-cnn">
    <div class="title">Basic Convnet - MNIST</div>
    <div class="loading-progress" v-if="modelLoading && loadingProgress < 100">
      Loading...{{ loadingProgress }}%
    </div>
    <div class="columns">
      <div class="column">
        <div class="input-container">
          <div class="input-label">Draw any digit (0-9) here <span class="arrow">⤸</span></div>
          <div class="canvas-container">
            <canvas
              id="input-canvas" width="240" height="240"
              @mousedown="activateDraw"
              @mouseup="deactivateDrawAndPredict"
              @mouseleave="deactivateDrawAndPredict"
              @mousemove="draw"
              @touchstart="activateDraw"
              @touchend="deactivateDrawAndPredict"
              @touchmove="draw"
            ></canvas>
            <canvas id="input-canvas-scaled" width="28" height="28" style="display:none;"></canvas>
            <canvas id="input-canvas-centercrop" style="display:none;"></canvas>
          </div>
          <div class="input-clear" v-on:click="clear">
            <i class="material-icons">clear</i>CLEAR
          </div>
        </div>
      </div>
      <div class="column">
        <div class="output">
          <div class="output-class"
            v-bind:class="{ 'predicted': i === predictedClass }"
            v-for="i in outputClasses"
          >
            <div class="output-label">{{ i }}</div>
            <div class="output-bar"
              style="height: {{ Math.round(100 * output[i]) }}px; background: rgba(27, 188, 155, {{ output[i].toFixed(2) }});"
            ></div>
          </div>
        </div>
      </div>
    </div>
    <div>

    </div>
  </div>
  `,

  data: function () {
    return {
      model: new KerasJS.Model(MODEL_CONFIG),
      modelLoading: true,
      input: new Float32Array(784),
      output: new Float32Array(10),
      outputClasses: range(10),
      drawing: false,
      strokes: []
    }
  },

  computed: {
    loadingProgress: function () {
      return this.model.getLoadingProgress()
    },
    predictedClass: function () {
      if (this.output.reduce((a, b) => a + b, 0) === 0) {
        return -1
      }
      return this.output.reduce((argmax, n, i) => n > this.output[argmax] ? i : argmax, 0)
    }
  },

  created: function () {
    // initialize KerasJS model
    this.model.initialize()
    this.model.ready().then(() => {
      this.modelLoading = false
    })
  },

  methods: {

    clear: function (e) {
      const ctx = document.getElementById('input-canvas').getContext('2d')
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      const ctxCenterCrop = document.getElementById('input-canvas-centercrop').getContext('2d')
      ctxCenterCrop.clearRect(0, 0, ctxCenterCrop.canvas.width, ctxCenterCrop.canvas.height)
      const ctxScaled = document.getElementById('input-canvas-scaled').getContext('2d')
      ctxScaled.clearRect(0, 0, ctxScaled.canvas.width, ctxScaled.canvas.height)
      this.output = new Float32Array(10)
      this.drawing = false
      this.strokes = []
    },

    activateDraw: function (e) {
      this.drawing = true
      this.strokes.push([])
      let points = this.strokes[this.strokes.length - 1]
      points.push(utils.getCoordinates(e))
    },

    draw: function (e) {
      if (!this.drawing) return

      const ctx = document.getElementById('input-canvas').getContext('2d')

      ctx.lineWidth = 20
      ctx.lineJoin = ctx.lineCap = 'round'
      ctx.strokeStyle = '#393E46'

      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

      let points = this.strokes[this.strokes.length - 1]
      points.push(utils.getCoordinates(e))

      // draw individual strokes
      for (let s = 0, slen = this.strokes.length; s < slen; s++) {
        points = this.strokes[s]

        let p1 = points[0]
        let p2 = points[1]
        ctx.beginPath()
        ctx.moveTo(...p1)

        // draw points in stroke
        // quadratic bezier curve
        for (let i = 1, len = points.length; i < len; i++) {
          ctx.quadraticCurveTo(...p1, ...utils.getMidpoint(p1, p2))
          p1 = points[i]
          p2 = points[i + 1]
        }
        ctx.lineTo(...p1)
        ctx.stroke()
      }
    },

    deactivateDrawAndPredict: debounce(function () {
      if (!this.drawing) return
      this.drawing = false

      const ctx = document.getElementById('input-canvas').getContext('2d')

      // center crop
      const imageDataCenterCrop = utils.centerCrop(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height))
      const ctxCenterCrop = document.getElementById('input-canvas-centercrop').getContext('2d')
      ctxCenterCrop.canvas.width = imageDataCenterCrop.width
      ctxCenterCrop.canvas.height = imageDataCenterCrop.height
      ctxCenterCrop.putImageData(imageDataCenterCrop, 0, 0)

      // scaled to 28 x 28
      const ctxScaled = document.getElementById('input-canvas-scaled').getContext('2d')
      ctxScaled.save()
      ctxScaled.scale(28 / ctxCenterCrop.canvas.width, 28 / ctxCenterCrop.canvas.height)
      ctxScaled.clearRect(0, 0, ctxCenterCrop.canvas.width, ctxCenterCrop.canvas.height)
      ctxScaled.drawImage(document.getElementById('input-canvas-centercrop'), 0, 0)
      const imageDataScaled = ctxScaled.getImageData(0, 0, ctxScaled.canvas.width, ctxScaled.canvas.height)
      ctxScaled.restore()

      // process image data for model input
      const { data } = imageDataScaled
      this.input = new Float32Array(784)
      for (let i = 0, len = data.length; i < len; i += 4) {
        this.input[i / 4] = data[i + 3] / 255
      }

      this.output = this.model.predict({ input: this.input }).output
    }, 200, { leading: true, trailing: true })

  }
})