import Peer, { DataConnection } from 'peerjs';
import { Stroke } from './types';

export type MultiplayerEvent =
  | { type: 'stroke_start'; stroke: Stroke }
  | { type: 'stroke_update'; points: { x: number; y: number }[] }
  | { type: 'stroke_complete'; stroke: Stroke }
  | { type: 'balloon_created'; strokeData: Stroke }
  | { type: 'clear_all' }
  | { type: 'peer_joined'; peerId: string }
  | { type: 'peer_left'; peerId: string };

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type StatusCallback = (status: ConnectionStatus, message: string) => void;
export type EventCallback = (event: MultiplayerEvent) => void;

export class Multiplayer {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private roomCode: string = '';
  private statusCallback: StatusCallback | null = null;
  private eventCallback: EventCallback | null = null;
  private isHost = false;

  constructor() {
    this.roomCode = this.generateRoomCode();
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getRoomCode(): string {
    return this.roomCode;
  }

  onStatusChange(callback: StatusCallback): void {
    this.statusCallback = callback;
  }

  onEvent(callback: EventCallback): void {
    this.eventCallback = callback;
  }

  private updateStatus(status: ConnectionStatus, message: string): void {
    if (this.statusCallback) {
      this.statusCallback(status, message);
    }
  }

  private emitEvent(event: MultiplayerEvent): void {
    if (this.eventCallback) {
      this.eventCallback(event);
    }
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use the room code as the peer ID for easy connection
      const peerId = `aircanvas-${this.roomCode}`;

      this.peer = new Peer(peerId, {
        debug: 0 // Minimal logging
      });

      this.peer.on('open', (id) => {
        console.log('Connected to PeerJS with ID:', id);
        this.isHost = true;
        this.updateStatus('disconnected', 'Ready to connect');
        resolve();
      });

      this.peer.on('connection', (conn) => {
        this.handleConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        if (err.type === 'unavailable-id') {
          // ID is taken, generate a new one
          this.roomCode = this.generateRoomCode();
          this.peer?.destroy();
          this.initialize().then(resolve).catch(reject);
        } else if (err.type === 'peer-unavailable') {
          this.updateStatus('disconnected', 'Room not found');
        } else {
          this.updateStatus('disconnected', 'Connection error');
          reject(err);
        }
      });

      this.peer.on('disconnected', () => {
        this.updateStatus('disconnected', 'Disconnected from server');
      });
    });
  }

  private handleConnection(conn: DataConnection): void {
    const peerId = conn.peer;

    conn.on('open', () => {
      this.connections.set(peerId, conn);
      this.updateStatus('connected', `Connected (${this.connections.size} peer${this.connections.size > 1 ? 's' : ''})`);
      this.emitEvent({ type: 'peer_joined', peerId });
    });

    conn.on('data', (data) => {
      const event = data as MultiplayerEvent;
      this.emitEvent(event);

      // If host, broadcast to other peers
      if (this.isHost) {
        this.broadcastExcept(event, peerId);
      }
    });

    conn.on('close', () => {
      this.connections.delete(peerId);
      if (this.connections.size === 0) {
        this.updateStatus('disconnected', 'Not connected');
      } else {
        this.updateStatus('connected', `Connected (${this.connections.size} peer${this.connections.size > 1 ? 's' : ''})`);
      }
      this.emitEvent({ type: 'peer_left', peerId });
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
      this.connections.delete(peerId);
    });
  }

  async joinRoom(code: string): Promise<void> {
    if (!this.peer) {
      throw new Error('Peer not initialized');
    }

    const targetPeerId = `aircanvas-${code.toUpperCase()}`;

    this.updateStatus('connecting', 'Connecting...');

    return new Promise((resolve, reject) => {
      const conn = this.peer!.connect(targetPeerId, {
        reliable: true
      });

      const timeout = setTimeout(() => {
        conn.close();
        this.updateStatus('disconnected', 'Connection timeout');
        reject(new Error('Connection timeout'));
      }, 10000);

      conn.on('open', () => {
        clearTimeout(timeout);
        this.handleConnection(conn);
        this.isHost = false;
        resolve();
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        console.error('Failed to connect:', err);
        this.updateStatus('disconnected', 'Failed to connect');
        reject(err);
      });
    });
  }

  broadcast(event: MultiplayerEvent): void {
    const data = event;
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(data);
      }
    });
  }

  private broadcastExcept(event: MultiplayerEvent, excludePeerId: string): void {
    this.connections.forEach((conn, peerId) => {
      if (conn.open && peerId !== excludePeerId) {
        conn.send(event);
      }
    });
  }

  isConnected(): boolean {
    return this.connections.size > 0;
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  disconnect(): void {
    this.connections.forEach((conn) => {
      conn.close();
    });
    this.connections.clear();
    this.updateStatus('disconnected', 'Not connected');
  }

  destroy(): void {
    this.disconnect();
    this.peer?.destroy();
    this.peer = null;
  }
}
