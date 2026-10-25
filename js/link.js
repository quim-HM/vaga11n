// Message links between the game, the operator page and whoever runs the vision:
// - LocalHost (host.js): everything inside the browser, the default (no install, no server).
// - WsLink: the legacy Python server (python -m vaga11n opens the game with ?servidor=1).
// - ChannelLink: the operator page talking to the game window through a BroadcastChannel.
// Every link exposes subscribe(fn) and send(obj); messages are plain objects. Pseudo-messages
// {type:"_open"} / {type:"_close"} report the connection state.

export const CHANNEL = "vaga11n";

export class WsLink {
  constructor(url) {
    this.url = url;
    this.subs = new Set();
    this.ws = null;
    this._connect();
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }

  _deliver(msg) { for (const fn of this.subs) fn(msg); }

  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }

  _connect() {
    let ws;
    try { ws = new WebSocket(this.url); } catch (e) { console.warn("WebSocket error", e); setTimeout(() => this._connect(), 1500); return; }
    ws.onopen = () => this._deliver({ type: "_open" });
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { console.warn("bad message", e); return; }
      this._deliver(msg);
    };
    ws.onclose = () => {
      this._deliver({ type: "_close" });
      setTimeout(() => this._connect(), 1500);
    };
    this.ws = ws;
  }
}

// Operator side of the in-browser mode. The game window answers {cmd:"hello"} heartbeats; without a
// game window open, the link reports _close after a few seconds of silence.
export class ChannelLink {
  constructor() {
    this.subs = new Set();
    this.open = false;
    this.lastMsg = 0;
    this.ch = new BroadcastChannel(CHANNEL);
    this.ch.onmessage = (ev) => {
      this.lastMsg = performance.now();
      if (!this.open) { this.open = true; this._deliver({ type: "_open" }); }
      this._deliver(ev.data);
    };
    const beat = () => {
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      this.send({ cmd: "hello", preview: visible, first: !this.open });
      if (this.open && performance.now() - this.lastMsg > 4000) { this.open = false; this._deliver({ type: "_close" }); }
    };
    beat();
    setInterval(beat, 1500);
  }

  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }

  _deliver(msg) { for (const fn of this.subs) fn(msg); }

  send(obj) { this.ch.postMessage(obj); }
}
