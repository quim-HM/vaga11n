# Vendored third-party code

Copied verbatim so the game runs offline and without a build step. Update by replacing the files.

| Folder | Package | Version | License |
|---|---|---|---|
| `mediapipe/` | [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision): `vision_bundle.mjs` + `wasm/vision_wasm_module_internal.{js,wasm}` | 1.1.1 | Apache-2.0 (Google) |
| `../models/pose_landmarker_{full,lite}.task` | [MediaPipe Pose Landmarker models](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (float16, latest) | — | Apache-2.0 (Google) |
| `qrcode/` | [`qrcode-generator`](https://www.npmjs.com/package/qrcode-generator): `dist/qrcode.mjs` | 2.0.4 | MIT (Kazuhiko Arase) |

Only the ES-module Wasm loader is vendored: it is the one that loads inside a module Web Worker
(`FilesetResolver.forVisionTasks(path, true)`).

To refresh MediaPipe:

```powershell
npm pack @mediapipe/tasks-vision; tar -xzf mediapipe-tasks-vision-*.tgz
copy package\vision_bundle.mjs web\vendor\mediapipe\
copy package\wasm\vision_wasm_module_internal.* web\vendor\mediapipe\wasm\
curl -L -o web\models\pose_landmarker_full.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task
curl -L -o web\models\pose_landmarker_lite.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
```
