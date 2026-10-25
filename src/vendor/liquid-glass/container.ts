/**
 * ES-module port of `Container` from liquid-glass-js
 * (https://github.com/dashersw/liquid-glass-js @ 78cb6ccb, MIT — see LICENSE).
 *
 * Differences from upstream:
 * - html2canvas-pro is imported on demand instead of relying on a global `html2canvas`
 * - effect parameters come from constructor options instead of `window.glassControls`
 * - nested `Button` support removed; content is rendered by React on top of the canvas
 * - `destroy()` releases listeners, the WebGL context and the DOM element
 * - one decoded snapshot image is shared by every instance; `refreshSnapshot()` re-captures it
 * - the canvas is re-rendered after it is resized (resizing clears the drawing buffer)
 * - console logging removed
 * The fragment shader is unchanged.
 */
export type GlassShape = 'rounded' | 'circle' | 'pill'

export interface GlassEffectOptions {
  blurRadius: number
  edgeIntensity: number
  rimIntensity: number
  baseIntensity: number
  edgeDistance: number
  rimDistance: number
  baseDistance: number
  cornerBoost: number
  rippleEffect: number
}

export interface LiquidGlassOptions extends Partial<GlassEffectOptions> {
  borderRadius?: number
  type?: GlassShape
  tintOpacity?: number
  warp?: boolean
  shadow?: string
}

/** Attribute that excludes an element (and its subtree) from the page snapshot. */
export const SNAPSHOT_IGNORE_ATTRIBUTE = 'data-glass-ignore'

const DEFAULT_EFFECT: GlassEffectOptions = {
  blurRadius: 5.0,
  edgeIntensity: 0.01,
  rimIntensity: 0.05,
  baseIntensity: 0.01,
  edgeDistance: 0.15,
  rimDistance: 0.8,
  baseDistance: 0.1,
  cornerBoost: 0.02,
  rippleEffect: 0.1,
}

interface GlRefs {
  gl: WebGLRenderingContext
  program: WebGLProgram
  texture: WebGLTexture
  positionBuffer: WebGLBuffer
  texcoordBuffer: WebGLBuffer
  resolutionLoc: WebGLUniformLocation | null
  textureSizeLoc: WebGLUniformLocation | null
  scrollYLoc: WebGLUniformLocation | null
  borderRadiusLoc: WebGLUniformLocation | null
  containerPositionLoc: WebGLUniformLocation | null
}

const VS_SOURCE = `
    attribute vec2 a_position;
    attribute vec2 a_texcoord;
    varying vec2 v_texcoord;

    void main() {
      gl_Position = vec4(a_position, 0, 1);
      v_texcoord = a_texcoord;
    }
  `

const FS_SOURCE = `
    precision mediump float;
    uniform sampler2D u_image;
    uniform vec2 u_resolution;
      uniform vec2 u_textureSize;
      uniform float u_scrollY;
      uniform float u_pageHeight;
      uniform float u_viewportHeight;
      uniform float u_blurRadius;
      uniform float u_borderRadius;
      uniform vec2 u_containerPosition;
      uniform float u_warp;
      uniform float u_edgeIntensity;
      uniform float u_rimIntensity;
      uniform float u_baseIntensity;
      uniform float u_edgeDistance;
      uniform float u_rimDistance;
      uniform float u_baseDistance;
      uniform float u_cornerBoost;
      uniform float u_rippleEffect;
      uniform float u_tintOpacity;
    varying vec2 v_texcoord;

      float roundedRectDistance(vec2 coord, vec2 size, float radius) {
        vec2 center = size * 0.5;
        vec2 pixelCoord = coord * size;
        vec2 toCorner = abs(pixelCoord - center) - (center - radius);
        float outsideCorner = length(max(toCorner, 0.0));
        float insideCorner = min(max(toCorner.x, toCorner.y), 0.0);
        return (outsideCorner + insideCorner - radius);
      }

      float circleDistance(vec2 coord, vec2 size, float radius) {
        vec2 center = vec2(0.5, 0.5);
        vec2 pixelCoord = coord * size;
        vec2 centerPixel = center * size;
        float distFromCenter = length(pixelCoord - centerPixel);
        return distFromCenter - radius;
      }

      bool isPill(vec2 size, float radius) {
        float heightRatioDiff = abs(radius - size.y * 0.5);
        bool radiusMatchesHeight = heightRatioDiff < 2.0;
        bool isWiderThanTall = size.x > size.y + 4.0;
        return radiusMatchesHeight && isWiderThanTall;
      }

      bool isCircle(vec2 size, float radius) {
        float minDim = min(size.x, size.y);
        bool radiusMatchesMinDim = abs(radius - minDim * 0.5) < 1.0;
        bool isRoughlySquare = abs(size.x - size.y) < 4.0;
        return radiusMatchesMinDim && isRoughlySquare;
      }

      float pillDistance(vec2 coord, vec2 size, float radius) {
        vec2 center = size * 0.5;
        vec2 pixelCoord = coord * size;
        vec2 capsuleStart = vec2(radius, center.y);
        vec2 capsuleEnd = vec2(size.x - radius, center.y);
        vec2 capsuleAxis = capsuleEnd - capsuleStart;
        float capsuleLength = length(capsuleAxis);

        if (capsuleLength > 0.0) {
          vec2 toPoint = pixelCoord - capsuleStart;
          float t = clamp(dot(toPoint, capsuleAxis) / dot(capsuleAxis, capsuleAxis), 0.0, 1.0);
          vec2 closestPointOnAxis = capsuleStart + t * capsuleAxis;
          return length(pixelCoord - closestPointOnAxis) - radius;
        } else {
          return length(pixelCoord - center) - radius;
        }
      }

    void main() {
        vec2 coord = v_texcoord;
        float scrollY = u_scrollY;
        vec2 containerSize = u_resolution;
        vec2 textureSize = u_textureSize;
        vec2 containerCenter = u_containerPosition + vec2(0.0, scrollY);
        vec2 containerOffset = (coord - 0.5) * containerSize;
        vec2 pagePixel = containerCenter + containerOffset;
        vec2 textureCoord = pagePixel / textureSize;

        float distFromEdgeShape;
        vec2 shapeNormal;

        if (isPill(u_resolution, u_borderRadius)) {
          distFromEdgeShape = -pillDistance(coord, u_resolution, u_borderRadius);
          vec2 center = vec2(0.5, 0.5);
          vec2 pixelCoord = coord * u_resolution;
          vec2 capsuleStart = vec2(u_borderRadius, center.y * u_resolution.y);
          vec2 capsuleEnd = vec2(u_resolution.x - u_borderRadius, center.y * u_resolution.y);
          vec2 capsuleAxis = capsuleEnd - capsuleStart;
          float capsuleLength = length(capsuleAxis);

          if (capsuleLength > 0.0) {
            vec2 toPoint = pixelCoord - capsuleStart;
            float t = clamp(dot(toPoint, capsuleAxis) / dot(capsuleAxis, capsuleAxis), 0.0, 1.0);
            vec2 closestPointOnAxis = capsuleStart + t * capsuleAxis;
            vec2 normalDir = pixelCoord - closestPointOnAxis;
            shapeNormal = length(normalDir) > 0.0 ? normalize(normalDir) : vec2(0.0, 1.0);
          } else {
            shapeNormal = normalize(coord - center);
          }
        } else if (isCircle(u_resolution, u_borderRadius)) {
          distFromEdgeShape = -circleDistance(coord, u_resolution, u_borderRadius);
          vec2 center = vec2(0.5, 0.5);
          shapeNormal = normalize(coord - center);
        } else {
          distFromEdgeShape = -roundedRectDistance(coord, u_resolution, u_borderRadius);
          vec2 center = vec2(0.5, 0.5);
          shapeNormal = normalize(coord - center);
        }
        distFromEdgeShape = max(distFromEdgeShape, 0.0);

        float distFromLeft = coord.x;
        float distFromRight = 1.0 - coord.x;
        float distFromTop = coord.y;
        float distFromBottom = 1.0 - coord.y;
        float distFromEdge = distFromEdgeShape / min(u_resolution.x, u_resolution.y);

        float normalizedDistance = distFromEdge * min(u_resolution.x, u_resolution.y);
        float baseIntensity = 1.0 - exp(-normalizedDistance * u_baseDistance);
        float edgeIntensity = exp(-normalizedDistance * u_edgeDistance);
        float rimIntensity = exp(-normalizedDistance * u_rimDistance);

        float baseComponent = u_warp > 0.5 ? baseIntensity * u_baseIntensity : 0.0;
        float totalIntensity = baseComponent + edgeIntensity * u_edgeIntensity + rimIntensity * u_rimIntensity;

        vec2 baseRefraction = shapeNormal * totalIntensity;

        float cornerProximityX = min(distFromLeft, distFromRight);
        float cornerProximityY = min(distFromTop, distFromBottom);
        float cornerDistance = max(cornerProximityX, cornerProximityY);
        float cornerNormalized = cornerDistance * min(u_resolution.x, u_resolution.y);

        float cornerBoost = exp(-cornerNormalized * 0.3) * u_cornerBoost;
        vec2 cornerRefraction = shapeNormal * cornerBoost;

        vec2 perpendicular = vec2(-shapeNormal.y, shapeNormal.x);
        float rippleEffect = sin(distFromEdge * 25.0) * u_rippleEffect * rimIntensity;
        vec2 textureRefraction = perpendicular * rippleEffect;

        vec2 totalRefraction = baseRefraction + cornerRefraction + textureRefraction;
        textureCoord += totalRefraction;

        vec4 color = vec4(0.0);
        vec2 texelSize = 1.0 / u_textureSize;
        float sigma = u_blurRadius / 2.0;
        vec2 blurStep = texelSize * sigma;

        float totalWeight = 0.0;

        for(float i = -6.0; i <= 6.0; i += 1.0) {
          for(float j = -6.0; j <= 6.0; j += 1.0) {
            float distance = length(vec2(i, j));
            if(distance > 6.0) continue;

            float weight = exp(-(distance * distance) / (2.0 * sigma * sigma));

            vec2 offset = vec2(i, j) * blurStep;
            color += texture2D(u_image, textureCoord + offset) * weight;
            totalWeight += weight;
          }
        }

        color /= totalWeight;

        float gradientPosition = coord.y;
        vec3 topTint = vec3(1.0, 1.0, 1.0);
        vec3 bottomTint = vec3(0.7, 0.7, 0.7);
        vec3 gradientTint = mix(topTint, bottomTint, gradientPosition);
        vec3 tintedColor = mix(color.rgb, gradientTint, u_tintOpacity);
        color = vec4(tintedColor, color.a);

        vec2 viewportCenter = containerCenter;
        float topY = (viewportCenter.y - containerSize.y * 0.4) / textureSize.y;
        float midY = viewportCenter.y / textureSize.y;
        float bottomY = (viewportCenter.y + containerSize.y * 0.4) / textureSize.y;

        vec3 topColor = vec3(0.0);
        vec3 midColor = vec3(0.0);
        vec3 bottomColor = vec3(0.0);

        float sampleCount = 0.0;
        for(float x = 0.0; x < 1.0; x += 0.05) {
          for(float yOffset = -5.0; yOffset <= 5.0; yOffset += 1.0) {
            vec2 topSample = vec2(x, topY + yOffset * texelSize.y);
            vec2 midSample = vec2(x, midY + yOffset * texelSize.y);
            vec2 bottomSample = vec2(x, bottomY + yOffset * texelSize.y);

            topColor += texture2D(u_image, topSample).rgb;
            midColor += texture2D(u_image, midSample).rgb;
            bottomColor += texture2D(u_image, bottomSample).rgb;
            sampleCount += 1.0;
          }
        }

        topColor /= sampleCount;
        midColor /= sampleCount;
        bottomColor /= sampleCount;

        vec3 sampledGradient;
        if (gradientPosition < 0.1) {
          sampledGradient = topColor;
        } else if (gradientPosition > 0.9) {
          sampledGradient = bottomColor;
        } else {
          float transitionPos = (gradientPosition - 0.1) / 0.8;
          if (transitionPos < 0.5) {
            float t = transitionPos * 2.0;
            sampledGradient = mix(topColor, midColor, t);
          } else {
            float t = (transitionPos - 0.5) * 2.0;
            sampledGradient = mix(midColor, bottomColor, t);
          }
        }

        vec3 finalTinted = mix(color.rgb, sampledGradient, u_tintOpacity * 0.3);
        color = vec4(finalTinted, color.a);

        float maskDistance;
        if (isPill(u_resolution, u_borderRadius)) {
          maskDistance = pillDistance(coord, u_resolution, u_borderRadius);
        } else if (isCircle(u_resolution, u_borderRadius)) {
          maskDistance = circleDistance(coord, u_resolution, u_borderRadius);
        } else {
          maskDistance = roundedRectDistance(coord, u_resolution, u_borderRadius);
        }
        float mask = 1.0 - smoothstep(-1.0, 1.0, maskDistance);

        gl_FragColor = vec4(color.rgb, mask);
      }
    `

export class LiquidGlassContainer {
  private static instances = new Set<LiquidGlassContainer>()
  private static snapshotImage: Promise<HTMLImageElement> | null = null

  readonly element: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGLRenderingContext | null
  private readonly type: GlassShape
  private readonly tintOpacity: number
  private readonly warp: boolean
  private readonly effect: GlassEffectOptions
  private borderRadius: number
  private width = 0
  private height = 0
  private refs: GlRefs | null = null
  private destroyed = false
  private sizeFrame = 0
  private readonly onScroll = () => this.render()

  constructor(options: LiquidGlassOptions = {}) {
    this.borderRadius = options.borderRadius ?? 48
    this.type = options.type ?? 'rounded'
    this.tintOpacity = options.tintOpacity ?? 0.2
    this.warp = options.warp ?? false
    this.effect = { ...DEFAULT_EFFECT, ...pickEffect(options) }

    this.element = document.createElement('div')
    this.element.setAttribute(SNAPSHOT_IGNORE_ATTRIBUTE, '')
    this.element.setAttribute('aria-hidden', 'true')
    Object.assign(this.element.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '-1',
      pointerEvents: 'none',
      borderRadius: `${this.borderRadius}px`,
    })

    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      borderRadius: `${this.borderRadius}px`,
      boxShadow: options.shadow ?? '0 25px 50px rgba(0, 0, 0, 0.25)',
    })
    this.element.appendChild(this.canvas)

    this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true })
    LiquidGlassContainer.instances.add(this)

    this.updateSizeFromDOM()
    if (this.gl) void this.initWebGL()
  }

  /** True once the shader is compiled and the snapshot texture is uploaded. */
  get isReady() {
    return this.refs !== null
  }

  static isSupported() {
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl'))
    } catch {
      return false
    }
  }

  /** Re-capture the page (e.g. after a route change) and update every live instance. */
  static async refreshSnapshot() {
    LiquidGlassContainer.snapshotImage = null
    const image = await LiquidGlassContainer.getSnapshot()
    for (const instance of LiquidGlassContainer.instances) instance.uploadTexture(image)
  }

  /** Re-capture only if the cached snapshot is older than `maxAgeMs`; mounts in the same burst share one capture. */
  static ensureFreshSnapshot(maxAgeMs: number) {
    if (LiquidGlassContainer.snapshotImage && performance.now() - LiquidGlassContainer.snapshotStartedAt <= maxAgeMs) return
    void LiquidGlassContainer.refreshSnapshot().catch(() => {})
  }

  private static snapshotStartedAt = 0

  private static getSnapshot() {
    if (!LiquidGlassContainer.snapshotImage) LiquidGlassContainer.snapshotStartedAt = performance.now()
    LiquidGlassContainer.snapshotImage ??= import('html2canvas-pro')
      .then(({ default: html2canvas }) =>
        html2canvas(document.body, {
          scale: 1,
          useCORS: true,
          allowTaint: false,
          backgroundColor: null,
          logging: false,
          ignoreElements: (element) => element.hasAttribute(SNAPSHOT_IGNORE_ATTRIBUTE),
        }),
      )
      .then(
        (snapshot) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error('Snapshot could not be decoded'))
            img.src = snapshot.toDataURL()
          }),
      )
      .catch((error: unknown) => {
        LiquidGlassContainer.snapshotImage = null
        throw error
      })
    return LiquidGlassContainer.snapshotImage
  }

  updateSizeFromDOM() {
    cancelAnimationFrame(this.sizeFrame)
    this.sizeFrame = requestAnimationFrame(() => {
      if (this.destroyed) return
      const rect = this.element.getBoundingClientRect()
      let newWidth = Math.ceil(rect.width)
      let newHeight = Math.ceil(rect.height)

      if (this.type === 'circle') {
        const size = Math.max(newWidth, newHeight)
        newWidth = size
        newHeight = size
        this.borderRadius = size / 2
      } else if (this.type === 'pill') {
        this.borderRadius = newHeight / 2
      }
      this.element.style.borderRadius = `${this.borderRadius}px`
      this.canvas.style.borderRadius = `${this.borderRadius}px`

      if (newWidth !== this.width || newHeight !== this.height) {
        this.width = newWidth
        this.height = newHeight
        this.canvas.width = newWidth
        this.canvas.height = newHeight

        if (this.refs) {
          const { gl } = this.refs
          gl.useProgram(this.refs.program)
          gl.viewport(0, 0, newWidth, newHeight)
          gl.uniform2f(this.refs.resolutionLoc, newWidth, newHeight)
          gl.uniform1f(this.refs.borderRadiusLoc, this.borderRadius)
        }
      }
      this.render()
    })
  }

  render() {
    if (!this.refs || this.destroyed) return
    const { gl } = this.refs
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform1f(this.refs.scrollYLoc, window.scrollY || document.documentElement.scrollTop)
    const rect = this.canvas.getBoundingClientRect()
    gl.uniform2f(this.refs.containerPositionLoc, rect.left + rect.width / 2, rect.top + rect.height / 2)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.sizeFrame)
    window.removeEventListener('scroll', this.onScroll)
    LiquidGlassContainer.instances.delete(this)
    if (this.refs) {
      const { gl } = this.refs
      gl.deleteTexture(this.refs.texture)
      gl.deleteBuffer(this.refs.positionBuffer)
      gl.deleteBuffer(this.refs.texcoordBuffer)
      gl.deleteProgram(this.refs.program)
      this.refs = null
    }
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext()
    this.element.remove()
  }

  private async initWebGL() {
    let image: HTMLImageElement
    try {
      image = await LiquidGlassContainer.getSnapshot()
    } catch {
      return
    }
    if (this.destroyed || !this.gl) return
    this.setupShader(this.gl, image)
  }

  private uploadTexture(image: HTMLImageElement) {
    if (!this.refs) return
    const { gl } = this.refs
    gl.useProgram(this.refs.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.refs.texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.uniform2f(this.refs.textureSizeLoc, image.width, image.height)
    this.render()
  }

  private setupShader(gl: WebGLRenderingContext, image: HTMLImageElement) {
    const program = createProgram(gl, VS_SOURCE, FS_SOURCE)
    const positionBuffer = gl.createBuffer()
    const texcoordBuffer = gl.createBuffer()
    const texture = gl.createTexture()
    if (!program || !positionBuffer || !texcoordBuffer || !texture) return

    gl.useProgram(program)

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const positionLoc = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW)
    const texcoordLoc = gl.getAttribLocation(program, 'a_texcoord')
    gl.enableVertexAttribArray(texcoordLoc)
    gl.vertexAttribPointer(texcoordLoc, 2, gl.FLOAT, false, 0, 0)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const loc = (name: string) => gl.getUniformLocation(program, name)
    const e = this.effect
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.uniform2f(loc('u_resolution'), this.canvas.width, this.canvas.height)
    gl.uniform2f(loc('u_textureSize'), image.width, image.height)
    gl.uniform1f(loc('u_blurRadius'), e.blurRadius)
    gl.uniform1f(loc('u_borderRadius'), this.borderRadius)
    gl.uniform1f(loc('u_warp'), this.warp ? 1.0 : 0.0)
    gl.uniform1f(loc('u_edgeIntensity'), e.edgeIntensity)
    gl.uniform1f(loc('u_rimIntensity'), e.rimIntensity)
    gl.uniform1f(loc('u_baseIntensity'), e.baseIntensity)
    gl.uniform1f(loc('u_edgeDistance'), e.edgeDistance)
    gl.uniform1f(loc('u_rimDistance'), e.rimDistance)
    gl.uniform1f(loc('u_baseDistance'), e.baseDistance)
    gl.uniform1f(loc('u_cornerBoost'), e.cornerBoost)
    gl.uniform1f(loc('u_rippleEffect'), e.rippleEffect)
    gl.uniform1f(loc('u_tintOpacity'), this.tintOpacity)
    gl.uniform1f(loc('u_pageHeight'), Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))
    gl.uniform1f(loc('u_viewportHeight'), window.innerHeight)
    gl.uniform1i(loc('u_image'), 0)

    this.refs = {
      gl,
      program,
      texture,
      positionBuffer,
      texcoordBuffer,
      resolutionLoc: loc('u_resolution'),
      textureSizeLoc: loc('u_textureSize'),
      scrollYLoc: loc('u_scrollY'),
      borderRadiusLoc: loc('u_borderRadius'),
      containerPositionLoc: loc('u_containerPosition'),
    }

    window.addEventListener('scroll', this.onScroll, { passive: true })
    this.render()
  }
}

function pickEffect(options: LiquidGlassOptions): Partial<GlassEffectOptions> {
  const picked: Partial<GlassEffectOptions> = {}
  for (const key of Object.keys(DEFAULT_EFFECT) as (keyof GlassEffectOptions)[]) {
    const value = options[key]
    if (typeof value === 'number') picked[key] = value
  }
  return picked
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}
