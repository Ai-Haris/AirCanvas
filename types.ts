import * as THREE from 'three';

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Stroke {
  points: Point2D[];
  color: string;
  width: number;
  closed: boolean;
}

export interface HandLandmarks {
  landmarks: Point2D[];
  worldLandmarks?: Point3D[];
}

export type GestureType =
  | 'none'
  | 'draw'      // Index finger extended
  | 'pinch'     // Thumb + index pinch
  | 'palm'      // Open palm
  | 'fist'      // Closed fist
  | 'poke'      // Index pointing at object
  | 'swipe';    // Fast horizontal movement

export interface GestureState {
  current: GestureType;
  previous: GestureType;
  duration: number;      // How long current gesture has been held
  velocity: Point2D;     // Hand movement velocity
  confidence: number;
}

export interface BalloonObject {
  id: string;
  mesh: THREE.Mesh;
  color: string;
  originalStroke: Stroke;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  rotation: THREE.Euler;
  rotationSpeed: THREE.Vector3;
  bobOffset: number;
  bobSpeed: number;
  scale: number;
  targetScale: number;
  createdAt: number;
  isGrabbed: boolean;
  squishAmount: number;
}

export interface AppState {
  isDrawing: boolean;
  currentStroke: Stroke | null;
  objects: BalloonObject[];
  selectedObject: BalloonObject | null;
  handDetected: boolean;
  gestureState: GestureState;
  currentColorIndex: number;
}
