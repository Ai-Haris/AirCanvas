import * as THREE from 'three';
import { Stroke, Point2D } from './types';
import { SCENE } from './constants';

export class BalloonInflator {
  private camera: THREE.PerspectiveCamera;
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(camera: THREE.PerspectiveCamera, canvasWidth: number, canvasHeight: number) {
    this.camera = camera;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  updateSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  createBalloonMesh(stroke: Stroke): THREE.Mesh {
    // Simplify stroke points for better mesh generation
    const simplifiedPoints = this.simplifyPoints(stroke.points, 20);

    // Create the shape from 2D points
    const shape = this.createShape(simplifiedPoints);

    // Create extruded geometry with rounded bevel
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: SCENE.OBJECT_DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.3,
      bevelSize: 0.3,
      bevelOffset: 0,
      bevelSegments: 8,
      curveSegments: 24
    };

    let geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Center the geometry
    geometry.center();

    // Subdivide and smooth the geometry for balloon effect
    geometry = this.inflateGeometry(geometry);

    // Create material with the stroke color
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(stroke.color),
      roughness: 0.35,
      metalness: 0.0,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Position in 3D space based on stroke center
    const center = this.getStrokeCenter(stroke.points);
    const worldPos = this.screenToWorld(center.x, center.y);
    mesh.position.copy(worldPos);

    // Scale based on stroke size - smaller objects
    const strokeSize = this.getStrokeSize(stroke.points);
    const scale = Math.max(strokeSize.width, strokeSize.height) / 600;
    mesh.scale.set(scale, scale, scale);

    return mesh;
  }

  private simplifyPoints(points: Point2D[], targetCount: number): Point2D[] {
    if (points.length <= targetCount) return points;

    const step = points.length / targetCount;
    const simplified: Point2D[] = [];

    for (let i = 0; i < targetCount; i++) {
      const index = Math.min(Math.floor(i * step), points.length - 1);
      simplified.push(points[index]);
    }

    return simplified;
  }

  private createShape(points: Point2D[]): THREE.Shape {
    if (points.length < 3) {
      // Create a default circle if not enough points
      const shape = new THREE.Shape();
      shape.absarc(0, 0, 1, 0, Math.PI * 2, false);
      return shape;
    }

    // Normalize points to be centered around origin
    const center = this.getStrokeCenter(points);
    const normalizedPoints = points.map(p => ({
      x: (p.x - center.x) / 50,  // Scale down
      y: -(p.y - center.y) / 50  // Flip Y and scale
    }));

    // Create smooth curve through points
    const curve = new THREE.CatmullRomCurve3(
      normalizedPoints.map(p => new THREE.Vector3(p.x, p.y, 0)),
      true,  // closed
      'catmullrom',
      0.5
    );

    // Sample the curve for smooth shape
    const sampledPoints = curve.getPoints(64);

    const shape = new THREE.Shape();
    shape.moveTo(sampledPoints[0].x, sampledPoints[0].y);

    for (let i = 1; i < sampledPoints.length; i++) {
      shape.lineTo(sampledPoints[i].x, sampledPoints[i].y);
    }

    shape.closePath();

    return shape;
  }

  private inflateGeometry(geometry: THREE.ExtrudeGeometry): THREE.ExtrudeGeometry {
    // Get position attribute
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');

    if (!position || !normal) return geometry;

    // Compute bounding box for reference
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox!;
    const center = new THREE.Vector3();
    bbox.getCenter(center);

    // Inflate vertices outward from center
    const inflatedPositions = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);

      // Direction from center
      const dx = x - center.x;
      const dy = y - center.y;
      const dz = z - center.z;

      // Distance from center
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > 0.001) {
        // Inflate amount based on position
        const inflateAmount = SCENE.INFLATION_AMOUNT * 0.1;

        // Push vertex outward
        inflatedPositions[i * 3] = x + (dx / dist) * inflateAmount;
        inflatedPositions[i * 3 + 1] = y + (dy / dist) * inflateAmount;
        inflatedPositions[i * 3 + 2] = z + (dz / dist) * inflateAmount;
      } else {
        inflatedPositions[i * 3] = x;
        inflatedPositions[i * 3 + 1] = y;
        inflatedPositions[i * 3 + 2] = z;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(inflatedPositions, 3));
    geometry.computeVertexNormals();

    return geometry;
  }

  private getStrokeCenter(points: Point2D[]): Point2D {
    const sum = points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 }
    );

    return {
      x: sum.x / points.length,
      y: sum.y / points.length
    };
  }

  private getStrokeSize(points: Point2D[]): { width: number; height: number } {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    return {
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private screenToWorld(screenX: number, screenY: number): THREE.Vector3 {
    const vector = new THREE.Vector3();

    // Normalize screen coordinates to -1 to 1
    vector.x = (screenX / this.canvasWidth) * 2 - 1;
    vector.y = -(screenY / this.canvasHeight) * 2 + 1;
    vector.z = 0.5;

    // Unproject from screen to world
    vector.unproject(this.camera);

    // Calculate direction from camera
    const dir = vector.sub(this.camera.position).normalize();

    // Place object at z = 0
    const distance = -this.camera.position.z / dir.z;
    const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));

    return pos;
  }
}
