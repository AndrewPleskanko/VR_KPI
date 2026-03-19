// Vertex shader
const vertexShaderSource = `
attribute vec3 vertex;
uniform mat4 ModelViewMatrix;
uniform mat4 ProjectionMatrix;

void main() {
    gl_Position = ProjectionMatrix * ModelViewMatrix * vec4(vertex, 1.0);
}`;


// Fragment shader
const fragmentShaderSource = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
   precision highp float;
#else
   precision mediump float;
#endif

uniform vec4 color;
void main() {
    gl_FragColor = color;
}`;

const vertexShaderSourceBG = `
attribute vec2 vertex;
attribute vec2 texCoord;
varying vec2 vTexCoord;
void main() {
    vTexCoord = texCoord;
    gl_Position = vec4(vertex, 0.0, 1.0);
}`;

const fragmentShaderSourceBG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
   precision highp float;
#else
   precision mediump float;
#endif
uniform sampler2D uTexture;
varying vec2 vTexCoord;
void main() {
    gl_FragColor = texture2D(uTexture, vTexCoord);
}`;
