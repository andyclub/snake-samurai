/** Transport-only ordering; never persisted as game state. Legacy packets remain compatible. */
export interface SnapshotOrder {
  publisherId?: string;
  publisherSession?: string;
  sequence?: number;
}

export class SnapshotTransport {
  private publisherId = '';
  private sequence = 0;
  private hostId = '';
  private hostSessions = new Set<string>();
  private received = new Map<string, number>();

  readonly sessionId: string;
  constructor(sessionId: string) { this.sessionId = sessionId; }

  setPublisher(id: string) { this.publisherId = id; }

  setHost(id: string, sessions: string[]) {
    this.hostId = id;
    this.hostSessions = new Set(sessions);
    // Presence removes retired sessions; keep ordering only for live publishers.
    for (const session of this.received.keys()) {
      if (!this.hostSessions.has(session)) this.received.delete(session);
    }
  }

  stamp<T extends object>(packet: T): T & SnapshotOrder {
    return { ...packet, publisherId: this.publisherId, publisherSession: this.sessionId, sequence: ++this.sequence };
  }

  accept(packet: SnapshotOrder): boolean {
    if (!packet || typeof packet !== 'object') return false;
    if (!packet.publisherId || !packet.publisherSession || !Number.isSafeInteger(packet.sequence)) return true;
    if (!this.hostId || packet.publisherId !== this.hostId) return false;
    if (this.hostSessions.size && !this.hostSessions.has(packet.publisherSession)) return false;
    const previous = this.received.get(packet.publisherSession) || 0;
    if (packet.sequence! <= previous) return false;
    this.received.set(packet.publisherSession, packet.sequence!);
    return true;
  }
}
