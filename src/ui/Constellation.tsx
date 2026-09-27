// Live rebuild of the R2a reference frame (constellation-frame.svg): a
// tilted ring of wireframe satellites with dashed crosslinks, slow
// clockwise rotation, gentle parallax on the outer arcs. Original build;
// only the direction comes from the reference (design brief v0.2, asset 7).
// Loaded lazily so three.js stays out of the main game bundle. If WebGL is
// unavailable (hardened browsers, blocklisted GPUs), falls back to the
// still reference frame instead of crashing.

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import frameUrl from './assets/constellation-frame.svg'

const PHOSPHOR = 0x35f095
const SAT_COUNT = 10
const RING_RADIUS = 2.2

function buildSatellite(): THREE.Group {
  const sat = new THREE.Group()
  const material = new THREE.LineBasicMaterial({ color: PHOSPHOR, transparent: true, opacity: 0.9 })
  const body = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.14, 0.14, 0.14)), material)
  sat.add(body)
  const panels = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.26, 0, 0),
      new THREE.Vector3(-0.09, 0, 0),
      new THREE.Vector3(0.09, 0, 0),
      new THREE.Vector3(0.26, 0, 0),
    ]),
    material,
  )
  sat.add(panels)
  return sat
}

export default function Constellation({ size = 320 }: { size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [webglFailed, setWebglFailed] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || webglFailed) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      setWebglFailed(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(size, size)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 2.6, 6.2) // slight three-quarter angle, as in the reference
    camera.lookAt(0, 0, 0)

    const ringGroup = new THREE.Group()
    scene.add(ringGroup)

    const ringPoints: THREE.Vector3[] = []
    for (let i = 0; i <= 128; i += 1) {
      const a = (i / 128) * Math.PI * 2
      ringPoints.push(new THREE.Vector3(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS))
    }
    ringGroup.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ringPoints),
        new THREE.LineBasicMaterial({ color: PHOSPHOR, transparent: true, opacity: 0.85 }),
      ),
    )

    const sats: THREE.Group[] = []
    for (let i = 0; i < SAT_COUNT; i += 1) {
      const a = (i / SAT_COUNT) * Math.PI * 2
      const sat = buildSatellite()
      sat.position.set(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS)
      ringGroup.add(sat)
      sats.push(sat)
    }

    // Dashed crosslinks between alternating satellites, as in the frame.
    const linkIndices = [0, 2, 4, 6, 8]
    for (let i = 0; i < linkIndices.length; i += 1) {
      const from = sats[linkIndices[i]].position
      const to = sats[linkIndices[(i + 1) % linkIndices.length]].position
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]),
        new THREE.LineDashedMaterial({
          color: PHOSPHOR,
          transparent: true,
          opacity: 0.28,
          dashSize: 0.09,
          gapSize: 0.14,
        }),
      )
      line.computeLineDistances()
      ringGroup.add(line)
    }

    // Faint outer arcs on their own group for the parallax feel.
    const parallaxGroup = new THREE.Group()
    scene.add(parallaxGroup)
    const arcs: [number, number][] = [
      [2.9, 0.16],
      [3.4, 0.12],
    ]
    for (const [radius, opacity] of arcs) {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 90; i += 1) {
        const a = (i / 90) * Math.PI * 1.35
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
      }
      parallaxGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: PHOSPHOR, transparent: true, opacity }),
        ),
      )
    }

    scene.rotation.x = 0.06

    let raf = 0
    let last = 0
    const animate = (now: number) => {
      raf = requestAnimationFrame(animate)
      const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.1)
      last = now
      ringGroup.rotation.y -= dt * 0.12 // slow clockwise seen from above
      parallaxGroup.rotation.y -= dt * 0.05 // arcs drift slower: gentle parallax
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(raf)
      scene.traverse((obj) => {
        const anyObj = obj as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }
        anyObj.geometry?.dispose()
        if (anyObj.material) {
          const mats = Array.isArray(anyObj.material) ? anyObj.material : [anyObj.material]
          mats.forEach((m) => m.dispose())
        }
      })
      renderer.dispose()
      renderer.forceContextLoss() // actually release the GL context across remounts
      mount.removeChild(renderer.domElement)
    }
  }, [size, webglFailed])

  if (webglFailed) {
    return <img src={frameUrl} alt="" aria-hidden="true" style={{ width: size, height: size }} className="opacity-90" />
  }

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background:
          'radial-gradient(circle at 50% 50%, rgba(53, 240, 149, 0.1), rgba(53, 240, 149, 0.03) 55%, transparent 75%)',
      }}
    />
  )
}
