'use strict';

class SseManager {
  constructor() {
    this.clients = new Set();
    this.keepAliveInterval = null;
    this.startKeepAlive();
  }

  startKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepAlive();
    }, 25000);
    if (this.keepAliveInterval.unref) {
      this.keepAliveInterval.unref();
    }
  }

  sendKeepAlive() {
    for (const res of this.clients) {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        this.clients.delete(res);
      }
    }
  }

  addClient(req, res, initialData = null) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    if (res.flushHeaders) {
      res.flushHeaders();
    }

    res.write(': connected\n\n');

    if (initialData) {
      try {
        res.write(`data: ${JSON.stringify(initialData)}\n\n`);
      } catch {
      }
    }

    this.clients.add(res);

    req.on('close', () => {
      this.clients.delete(res);
    });
  }

  broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(payload);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  closeAll() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    for (const res of this.clients) {
      try {
        res.end();
      } catch {
      }
    }
    this.clients.clear();
  }

  get clientCount() {
    return this.clients.size;
  }
}

const sseManager = new SseManager();

module.exports = {
  sseManager,
  SseManager
};
