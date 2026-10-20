#!/usr/bin/env bash
# Rebuild the 3D models from the Blender scripts and compress them for phones.
#   Needs Blender as a Python module:  python3 -m venv .bpy && .bpy/bin/pip install bpy==5.2.2
#   Usage:  BPY_PYTHON=.bpy/bin/python npm run assets
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${BPY_PYTHON:-.bpy/bin/python}"
RAW="$(mktemp -d)"
"$PY" assets-src/blender/windmill.py -- "$RAW"
"$PY" assets-src/blender/props.py -- "$RAW"
for f in windmill walls cup lantern rocks decor; do
  # Quantize only (KHR_mesh_quantization): ~35% smaller and needs no WebAssembly decoder,
  # so it also works on hosts whose security policy blocks WASM.
  npx gltf-transform quantize "$RAW/$f.glb" "src/assets/models/$f.glb"
done
ls -la src/assets/models
