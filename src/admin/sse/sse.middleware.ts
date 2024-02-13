import { Injectable, NestMiddleware } from '@nestjs/common';
import { EventData } from 'express-sse-middleware/dist/EventBuilder';
import { MsgData } from './msg-data';
import { SseService } from './sse.service';

@Injectable()
export class SseMiddleware implements NestMiddleware {
  idCounter = 0;
  keepAliveCounter = 0;
  clientId = 0;
  clients = new Map<number, any>();

  constructor(readonly sseService: SseService) {
    sseService.sseMsg$.subscribe((msgData: MsgData) => {
      [...this.clients.values()].forEach((sse) => {
        this.idCounter += 1;
        const eventData: EventData<MsgData> = {
          id: String(this.idCounter),
          event: 'newData',
          data: msgData,
        };
        sse.send(eventData); // <- Push EventData with typed payload
      });
    });

    sseService.keepAliveMsg$.subscribe((msgData: MsgData) => {
      [...this.clients.values()].forEach((sse) => {
        this.keepAliveCounter += 1;
        const eventData: EventData<MsgData> = {
          id: String(this.keepAliveCounter),
          event: 'keepAlive',
          data: msgData,
        };
        sse.send(eventData);
      });
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  use(req, res, _next: any) {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    const sse = res.sse();

    this.clientId += 1;
    const clientId = this.clientId;
    this.clients.set(clientId, sse);
    req.on('close', () => {
      sse.close();
      this.clients.delete(clientId);
    });
  }
}
