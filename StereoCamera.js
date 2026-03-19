'use strict';

// Constructor function

function StereoCamera(
    Convergence,
    EyeSeparation,
    AspectRatio,
    FOV,
    NearClippingDistance,
    FarClippingDistance
) {
    this.mConvergence          = Convergence;
    this.mEyeSeparation        = EyeSeparation;
    this.mAspectRatio          = AspectRatio;
    this.mFOV                  = FOV * Math.PI / 180.0;
    this.mNearClippingDistance = NearClippingDistance;
    this.mFarClippingDistance  = FarClippingDistance;

    this.ApplyLeftFrustum = function () {
        let top    =  this.mNearClippingDistance * Math.tan(this.mFOV / 2);
        let bottom = -top;

        let a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;
        let b = a - this.mEyeSeparation / 2;
        let c = a + this.mEyeSeparation / 2;

        let left  = -b * this.mNearClippingDistance / this.mConvergence;
        let right =  c * this.mNearClippingDistance / this.mConvergence;

        let projection = m4.frustum(left, right, bottom, top,
                                    this.mNearClippingDistance,
                                    this.mFarClippingDistance);

        let modelView = m4.translation(this.mEyeSeparation / 2, 0.0, 0.0);

        return { projection: projection, modelView: modelView };
    };

    this.ApplyRightFrustum = function () {
        let top    =  this.mNearClippingDistance * Math.tan(this.mFOV / 2);
        let bottom = -top;

        let a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;
        let b = a - this.mEyeSeparation / 2;
        let c = a + this.mEyeSeparation / 2;

        let left  = -c * this.mNearClippingDistance / this.mConvergence;
        let right =  b * this.mNearClippingDistance / this.mConvergence;

        let projection = m4.frustum(left, right, bottom, top,
                                    this.mNearClippingDistance,
                                    this.mFarClippingDistance);

        let modelView = m4.translation(-this.mEyeSeparation / 2, 0.0, 0.0);

        return { projection: projection, modelView: modelView };
    };
}
