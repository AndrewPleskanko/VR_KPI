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

let sensorSocket = null;           // WebSocket for phone sensor stream
let sensorConnected = false;       // True while socket is open
let sensorHeadingRad = 0;          // Yaw angle derived from magnetometer
let sensorHeadingValid = false;    // False until first valid packet arrives

let sphere;                     // Model for the sound source
let audioCtx;                   // WebAudio Context
let panner;                     // Spatial Panner Node
let highPassFilter;             // Biquad Filter (Variant 8)
let audioEl = new Audio();      // Dynamic Audio element
audioEl.volume = 0.2;
let track;                      // Media element source
let soundRadius = 2.5;          // Distance of sound source from center

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
    let modelView = getActiveModelViewMatrix();

    let rotateToPointZero = m4.axisRotation([0.707, 0.707, 0], 0.7);
    let translateToPointZero = m4.translation(0, 0, -10);


    let currentAngle = (sensorConnected && sensorHeadingValid) ? -sensorHeadingRad : 0;

    let sX = Math.sin(currentAngle) * soundRadius;
    let sY = 0.5;
    let sZ = -Math.cos(currentAngle) * soundRadius;

    if (panner) {
        panner.positionX.value = sX;
        panner.positionY.value = sY;
        panner.positionZ.value = sZ;
    }

    let posSpan = document.getElementById('sourcePosition');
    if (posSpan) posSpan.textContent = `${sX.toFixed(2)}, ${sY.toFixed(2)}, ${sZ.toFixed(2)}`;

    let matSphereTranslation = m4.translation(sX, sY, sZ);

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

    let matSphereL1 = m4.multiply(matAccum0, matSphereTranslation);
    let matSphereL2 = m4.multiply(leftCam.modelView, matSphereL1);
    let matSphereL3 = m4.multiply(translateToPointZero, matSphereL2);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matSphereL3);
    gl.uniform4fv(shProgram.iColor, [1, 0, 0, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, sphere.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.iIndexBuffer);
    sphere.Draw();


    // The SECOND PASS (for the right eye)

    gl.clear(gl.DEPTH_BUFFER_BIT);

    let rightCam = stereoCam.ApplyRightFrustum();
    gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, rightCam.projection);

    matAccum1 = m4.multiply(rightCam.modelView, matAccum0);
    matAccum2 = m4.multiply(translateToPointZero, matAccum1);

    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matAccum2);

    gl.colorMask(false, true, true, false);

    // Webcam background at zero-parallax plane (right eye)
    if (webcamActive) drawWebcamBackground();

    shProgram.Use();
    gl.bindBuffer(gl.ARRAY_BUFFER, surface.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, surface.iIndexBuffer);

    gl.uniform4fv(shProgram.iColor, [1, 1, 1, 1]);
    surface.Draw();

    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1, 1);
    gl.uniform4fv(shProgram.iColor, [0.2, 0.2, 0.2, 1]);
    surface.DrawWireframe();
    gl.disable(gl.POLYGON_OFFSET_FILL);

    let matSphereR1 = m4.multiply(matAccum0, matSphereTranslation);
    let matSphereR2 = m4.multiply(rightCam.modelView, matSphereR1);
    let matSphereR3 = m4.multiply(translateToPointZero, matSphereR2);
    gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, matSphereR3);
    gl.uniform4fv(shProgram.iColor, [1, 0, 0, 1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, sphere.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphere.iIndexBuffer);
    sphere.Draw();

    gl.colorMask(true, true, true, true);
}


function getActiveModelViewMatrix() {
    return spaceball.getViewMatrix();
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

    const wsInput = document.getElementById('sensorWsUrl');
    if (wsInput) {
        wsInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') connectSensor();
        });
    }

    updateSensorUiStatus('Disconnected');
    document.getElementById('playAudio').addEventListener('click', function () {
        const fileInput = document.getElementById('audioFile');
        if (fileInput.files.length === 0) {
            alert('Please select an mp3/ogg file first!');
            return;
        }
        if (!audioCtx) setupAudioNodes();

        const file = fileInput.files[0];

        if (audioEl.dataset.filename !== file.name) {
            const objectURL = URL.createObjectURL(file);
            audioEl.src = objectURL;
            audioEl.loop = true;
            audioEl.dataset.filename = file.name;
        }

        audioCtx.resume().then(() => {
            audioEl.play();
            document.getElementById('playAudio').disabled = true;
            document.getElementById('pauseAudio').disabled = false;
            document.getElementById('audioStatus').textContent = 'Playing: ' + file.name;
        });
    });

    document.getElementById('pauseAudio').addEventListener('click', function () {
        if (audioEl && !audioEl.paused) {
            audioEl.pause();
            document.getElementById('playAudio').disabled = false;
            document.getElementById('pauseAudio').disabled = true;
            document.getElementById('audioStatus').textContent = 'Paused';
        }
    });

    document.getElementById('highPassToggle').addEventListener('change', function (e) {
        if (highPassFilter) {
            highPassFilter.frequency.value = e.target.checked ? 1000 : 0;
        }
    });

    document.getElementById('audioVolume').addEventListener('input', function (e) {
        let vol = e.target.value;
        document.getElementById('volumeValue').textContent = vol;
        audioEl.volume = vol / 100.0;
    });
}

function updateSensorUiStatus(statusText) {
    const status = document.getElementById('sensorStatus');
    if (status) status.textContent = statusText;

    const mode = document.getElementById('rotationMode');
    if (mode) mode.textContent = (sensorConnected && sensorHeadingValid) ? 'Phone magnetometer' : 'Trackball';

    const connectBtn = document.getElementById('connectSensor');
    const disconnectBtn = document.getElementById('disconnectSensor');
    if (connectBtn) connectBtn.disabled = sensorConnected;
    if (disconnectBtn) disconnectBtn.disabled = !sensorConnected;
}

function updateHeadingLabel() {
    const headingEl = document.getElementById('sensorHeading');
    if (!headingEl) return;

    if (!sensorHeadingValid) {
        headingEl.textContent = '-';
        return;
    }

    let deg = sensorHeadingRad * 180 / Math.PI;
    if (deg < 0) deg += 360;
    headingEl.textContent = deg.toFixed(1);
}

function extractMagneticVector(payload) {
    if (!payload || typeof payload !== 'object') return null;

    if (Array.isArray(payload.values) && payload.values.length >= 3) {
        return {
            x: payload.values[0],
            y: payload.values[1],
            z: payload.values[2]
        };
    }

    if (typeof payload.mx === 'number' && typeof payload.my === 'number' && typeof payload.mz === 'number') {
        return {x: payload.mx, y: payload.my, z: payload.mz};
    }

    if (typeof payload.x === 'number' && typeof payload.y === 'number' && typeof payload.z === 'number') {
        return {x: payload.x, y: payload.y, z: payload.z};
    }

    if (payload.magnetometer && typeof payload.magnetometer.x === 'number' && typeof payload.magnetometer.y === 'number' && typeof payload.magnetometer.z === 'number') {
        return payload.magnetometer;
    }

    return null;
}

function connectSensor() {
    const wsInput = document.getElementById('sensorWsUrl');
    if (!wsInput) return;

    const url = wsInput.value.trim();
    if (!url) {
        alert('Enter WebSocket URL, for example ws://192.168.0.10:8080');
        return;
    }

    if (sensorSocket) {
        sensorSocket.close();
        sensorSocket = null;
    }

    updateSensorUiStatus('Connecting...');
    sensorHeadingValid = false;
    updateHeadingLabel();

    try {
        sensorSocket = new WebSocket(url);
    } catch (err) {
        updateSensorUiStatus('Connection failed');
        alert('WebSocket error: ' + err.message);
        return;
    }

    sensorSocket.onopen = function () {
        sensorConnected = true;
        updateSensorUiStatus('Connected');
    };

    sensorSocket.onmessage = function (event) {
        let payload;
        try {
            payload = JSON.parse(event.data);
        } catch (_) {
            return;
        }

        const mag = extractMagneticVector(payload);
        if (!mag) return;

        // Variant 8: single-vector compass-like heading (yaw only).
        sensorHeadingRad = Math.atan2(mag.x, mag.y);
        sensorHeadingValid = Number.isFinite(sensorHeadingRad);

        updateHeadingLabel();
        updateSensorUiStatus(sensorConnected ? 'Connected' : 'Disconnected');
        draw();
    };

    sensorSocket.onerror = function () {
        updateSensorUiStatus('Socket error');
    };

    sensorSocket.onclose = function () {
        sensorConnected = false;
        sensorHeadingValid = false;
        sensorSocket = null;
        updateHeadingLabel();
        updateSensorUiStatus('Disconnected');
        draw();
    };
}

function disconnectSensor() {
    if (sensorSocket) {
        sensorSocket.close();
    } else {
        sensorConnected = false;
        sensorHeadingValid = false;
        updateHeadingLabel();
        updateSensorUiStatus('Disconnected');
        draw();
    }
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

    let sphereData = {};
    CreateSphereData(sphereData, 0.4, 20, 20);
    sphere = new Model('Sphere');
    sphere.BufferData(sphereData.verticesF32, sphereData.indicesU16);

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

function CreateSphereData(data, radius, latBands, longBands) {
    let vertexPositionData = [];
    let indexData = [];
    for (let latNumber = 0; latNumber <= latBands; latNumber++) {
        let theta = latNumber * Math.PI / latBands;
        let sinTheta = Math.sin(theta);
        let cosTheta = Math.cos(theta);
        for (let longNumber = 0; longNumber <= longBands; longNumber++) {
            let phi = longNumber * 2 * Math.PI / longBands;
            let sinPhi = Math.sin(phi);
            let cosPhi = Math.cos(phi);
            vertexPositionData.push(radius * cosPhi * sinTheta, radius * cosTheta, radius * sinPhi * sinTheta);
        }
    }
    for (let latNumber = 0; latNumber < latBands; latNumber++) {
        for (let longNumber = 0; longNumber < longBands; longNumber++) {
            let first = (latNumber * (longBands + 1)) + longNumber;
            let second = first + longBands + 1;
            indexData.push(first, second, first + 1);
            indexData.push(second, second + 1, first + 1);
        }
    }
    data.verticesF32 = new Float32Array(vertexPositionData);
    data.indicesU16 = new Uint16Array(indexData);
}

function setupAudioNodes() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    track = audioCtx.createMediaElementSource(audioEl);

    panner = audioCtx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 10000;

    highPassFilter = audioCtx.createBiquadFilter();
    highPassFilter.type = 'highpass';
    highPassFilter.frequency.value = 0;

    track.connect(highPassFilter);
    highPassFilter.connect(panner);
    panner.connect(audioCtx.destination);
}
