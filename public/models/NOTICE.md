# Optional exercise model provenance

`push-up-3f77e479.glb` is a simplified, quantized derivative of the OpenGym3D
push-up model and its animation. The source project describes both the
MakeHuman/MPFB2 character and the Mesh2Motion/Quaternius push-up motion as
CC0-1.0, including commercial use. This is a visual demonstration, not a
clinical or form assessment, and has not been verified by a physical therapist.
It is mapped only to the catalog's `push-up` (bodyweight push-up), not to
similarly named variations or the separate `swedish-dip` entry.

- Source copy: <https://github.com/EdgeAIG/workout-animation-studio/blob/2e27c411b310cc98a49bbb3aedeb57be99d89d8c/assets/3d/opengym3d-push-up-cc0.glb>
- Upstream provenance: <https://github.com/EdgeAIG/workout-animation-studio/blob/2e27c411b310cc98a49bbb3aedeb57be99d89d8c/assets/3d/NOTICE.md>
- Upstream asset registry at the time of review: <https://github.com/AssiamahS/opengym3d/blob/ea3a60130fdcfb3c4771e44d09f84ebab4ee9bae/assets/ASSET_LIBRARY.json> (entries `human/mpfb2-male-muscle` and `motion/cc0/pushup`)
- CC0 terms: <https://creativecommons.org/publicdomain/zero/1.0/>
- Original SHA-256: `67bfd1bf9c9c679dfd81f34202c661f954ce0ec4b15baac56a5781a372d11326`
- Derivative SHA-256: `3f77e47991e9f3135568fc2471f60299fa09d802efd8b33f020a256b1368b797`
- Transformation: glTF-Transform CLI 4.2.1, `optimize --compress quantize --simplify-ratio 0.25 --simplify-error 0.001 --flatten false --join false --texture-compress false`. The original animation remains embedded. Model colours are neutralized at runtime to avoid implying measured muscle activation.
- The viewer uses Three.js, distributed under the MIT license in its npm package.

Only this model is currently supplied. Other moves retain their existing
illustrations. The model is downloaded on request, cached after successful
viewing by the web app where supported, and is not included in the single-file
offline edition.
