'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.
let stereoCam;                  // Object holding stereo camera and its parameters
let shProgramBG;                // Shader program for webcam background
let video;                      // Video element for webcam
let webcamTexture;              // WebGL texture for webcam frame
let webcamActive = false;       // Whether webcam is streaming
let bgVertexBuffer;
let bgTexCoordBuffer;


// Constructor
function ShaderProgram(name, program) {

    this.name = name;
    this.prog = program;

    // Location of the attribute variable in the shader program.
    this.iAttribVertex = -1;
    // Location of the uniform specifying a color for the primitive.
    this.iColor = -1;
    // Location of the uniform matrix representing the combined transformation.
    this.iModelViewProjectionMatrix = -1;

    this.Use = function () {
        gl.useProgram(this.prog);
    }
}


/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn't matter.)
 */
function draw() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    /* Set the values of the projection transformation */
    //let projection = m4.perspective(Math.PI/8, 1, 8, 12);

    /* Get the view matrix from the SimpleRotator object.*/
    let modelView = spaceball.getViewMatrix();

    let rotateToPointZero = m4.axisRotation([0.707, 0.707, 0], 0.7);
    let translateToPointZero = m4.translation(0, 0, -10);

    // The FIRST PASS (for the left eye)

    let leftCam = stereoCam.ApplyLeftFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, leftCam.projection);

    let matAccum0 = m4.multiply(rotateToPointZero, modelView);
    let matAccum1 = m4.multiply(leftCam.modelView, matAccum0);
    let matAccum2 = m4.multiply(translateToPointZero, matAccum1);

    /* Multiply the projection matrix times the modelview matrix to give the
       combined transformation matrix, and send that to the shader program. */
    // let modelViewProjection = m4.multiply(projection, matAccum1 );

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum2);

    gl.colorMask(true, false, false, false);

    // Webcam background at zero-parallax plane (left eye)
    if (webcamActive) drawWebcamBackground();

    shProgram.Use();
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surface.iIndexBuffer);

    gl.uniform4fv(shProgram.iColor, [1, 1, 1, 1]);
    surface.Draw();

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.uniform4fv(shProgram.iColor, [0.2, 0.2, 0.2, 1]);
    surface.DrawWireframe();
    gl.disable(gl.POLYGON_OFFSET_FILL);

    // The SECOND PASS (for the right eye)

    gl.clear(gl.DEPTH_BUFFER_BIT);

    let rightCam = stereoCam.ApplyRightFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, rightCam.projection);

    matAccum0 = m4.multiply(rotateToPointZero, modelView);
    matAccum1 = m4.multiply(rightCam.modelView, matAccum0);
    matAccum2 = m4.multiply(translateToPointZero, matAccum1);

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum2);

    gl.colorMask(false, true, true, false);

    // Webcam background at zero-parallax plane (right eye)
    if (webcamActive) drawWebcamBackground();

    shProgram.Use();
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surface.iIndexBuffer);

    gl.uniform4fv(shProgram.iColor, [1, 1, 1, 1]);
    surface.Draw();

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.uniform4fv(shProgram.iColor, [0.2, 0.2, 0.2, 1]);
    surface.DrawWireframe();
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.colorMask(true, true, true, true);
}


function drawWebcamBackground() {
    if (!video || video.readyState < 2) return;

    shProgramBG.Use();
    gl.disable(gl.DEPTH_TEST);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.bindBuffer(gl.ARRAY_BUFFER, bgVertexBuffer);
    gl.vertexAttribPointer(shProgramBG.iAttribVertex, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgramBG.iAttribVertex);

    gl.bindBuffer(gl.ARRAY_BUFFER, bgTexCoordBuffer);
    gl.vertexAttribPointer(shProgramBG.iAttribTexCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgramBG.iAttribTexCoord);

    gl.uniform1i(shProgramBG.iTexture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
}


function initWebcamResources() {
    webcamTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, webcamTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const bgVertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const bgTexCoords = new Float32Array([1, 1, 0, 1, 1, 0, 0, 0]);

    bgVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, bgVertices, gl.STATIC_DRAW);

    bgTexCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bgTexCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, bgTexCoords, gl.STATIC_DRAW);
}

function startWebcam() {
    video = document.getElementById('videoElement');
    navigator.mediaDevices.getUserMedia({video: true})
        .then(function (stream) {
            video.srcObject = stream;
            webcamActive = true;
            document.getElementById('startCamera').disabled = true;
            document.getElementById('stopCamera').disabled = false;
            requestAnimationFrame(animateWithWebcam);
        })
        .catch(function () {
            alert('Could not access webcam');
        });
}

function stopWebcam() {
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    webcamActive = false;
    document.getElementById('startCamera').disabled = false;
    document.getElementById('stopCamera').disabled = true;
    draw();
}

function animateWithWebcam() {
    if (webcamActive) {
        draw();
        requestAnimationFrame(animateWithWebcam);
    }
}

function updateStereoParameters() {
    const eyeSep = parseFloat(document.getElementById('eyeSeparation').value);
    const fov = parseFloat(document.getElementById('fieldOfView').value);
    const nearClip = parseFloat(document.getElementById('nearClipping').value);
    const convergence = parseFloat(document.getElementById('convergence').value);

    document.getElementById('eyeSeparationValue').textContent = eyeSep;
    document.getElementById('fieldOfViewValue').textContent = fov;
    document.getElementById('nearClippingValue').textContent = nearClip;
    document.getElementById('convergenceValue').textContent = convergence;

    stereoCam.mEyeSeparation = eyeSep;
    stereoCam.mFOV = fov * Math.PI / 180.0;
    stereoCam.mNearClippingDistance = nearClip;
    stereoCam.mConvergence = convergence;

    if (!webcamActive) draw();
}

function initControls() {
    document.getElementById('eyeSeparation').addEventListener('input', updateStereoParameters);
    document.getElementById('fieldOfView').addEventListener('input', updateStereoParameters);
    document.getElementById('nearClipping').addEventListener('input', updateStereoParameters);
    document.getElementById('convergence').addEventListener('input', updateStereoParameters);
}


/* Initialize the WebGL context. Called from init() */
function initGL() {
    let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    shProgram = new ShaderProgram('Basic', prog);
    shProgram.Use();

    shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    shProgram.iModelViewMatrix = gl.getUniformLocation(prog, "ModelViewMatrix");
    shProgram.iProjectionMatrix = gl.getUniformLocation(prog, "ProjectionMatrix");
    shProgram.iColor = gl.getUniformLocation(prog, "color");

    let progBG = createProgram(gl, vertexShaderSourceBG, fragmentShaderSourceBG);
    shProgramBG = new ShaderProgram('Background', progBG);
    shProgramBG.iAttribVertex = gl.getAttribLocation(progBG, "vertex");
    shProgramBG.iAttribTexCoord = gl.getAttribLocation(progBG, "texCoord");
    shProgramBG.iTexture = gl.getUniformLocation(progBG, "uTexture");

    let data = {};

    CreateSurfaceData(data)

    surface = new Model('Surface');
    surface.BufferData(data.verticesF32, data.indicesU16);

    stereoCam = new StereoCamera(
        .7,     // decimeters
        14.0,   // decimeters
        1.3,    // aspect ratio of canvas
        0.4,    // radians
        8.0,    // decimeters
        20.0    // decimeters
    );

    initWebcamResources();
    gl.enable(gl.DEPTH_TEST);
}


/* Creates a program for use in the WebGL context gl, and returns the
 * identifier for that program.  If an error occurs while compiling or
 * linking the program, an exception of type Error is thrown.  The error
 * string contains the compilation or linking error.  If no error occurs,
 * the program identifier is the return value of the function.
 * The second and third parameters are strings that contain the
 * source code for the vertex shader and for the fragment shader.
 */
function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vsh, vShader);
    gl.compileShader(vsh);
    if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
    }
    let fsh = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
        throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
    }
    let prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
    }
    return prog;
}


/**
 * initialization function that will be called when the page has loaded
 */
function init() {
    let canvas;
    try {
        canvas = document.getElementById("webglcanvas");
        gl = canvas.getContext("webgl");
        if (!gl) {
            throw "Browser does not support WebGL";
        }
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }
    try {
        initGL();  // initialize the WebGL graphics context
    } catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

    stereoCam.mAspectRatio = canvas.width / canvas.height;
    initControls();
    spaceball = new TrackballRotator(canvas, draw, 0);

    draw();
}
