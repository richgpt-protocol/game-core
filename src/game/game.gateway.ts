import { InjectRepository } from '@nestjs/typeorm';
import { SubscribeMessage, WebSocketGateway, MessageBody, WsResponse, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Game } from './entities/game.entity';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GameService } from './game.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class GameGateway {

  delay = (ms: number) => new Promise(res => setTimeout(res, ms))

  @WebSocketServer()
  server: Server;

  constructor(
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
    private emitter: EventEmitter2,
    private gameService: GameService,
  ) {}

  @Cron('0 1 */1 * * *', { utcOffset: 0 })
  // async emitDrawResult(@MessageBody() data: unknown): Promise<WsResponse<unknown>> {
  async emitDrawResult(@MessageBody() data: unknown) {
    try {
      const lastGame = await this.gameRepository.findOne({
        where: { isClosed: true },
        order: { id: 'DESC' },
        relations: { drawResult: true }
      });
      const drawResult = lastGame.drawResult.sort((a, b) => b.id - a.id);
      for (let i = drawResult.length - 1; i < 0; i--) {
        const result = drawResult[i];
        // return { event: 'events', data: result };
        this.server.emit('liveDrawResult', result);

        await this.delay(2000);
      }

      await this.gameService.updateDrawResult(drawResult, lastGame.id);

    } catch (error) {
      // inform admin
    }
  }
}

// frontend example
// <html>
//   <head>
//     <script src="https://cdn.socket.io/4.3.2/socket.io.min.js" integrity="sha384-KAZ4DtjNhLChOB/hxXuKqhMLYvx3b5MlT55xPEiNmREKRzeEm+RVPlTnAn0ajQNs" crossorigin="anonymous"></script>
//     <script>
//       const socket = io('http://localhost:3000');
//       // socket.on('connect', function() {
//       //   console.log('Connected');

//       //   socket.emit('events', { test: 'something here...' });
//       // });
//       socket.on('liveDrawResult', data => {
//         console.log(data);
//       });
//     </script>
//   </head>

//   <body></body>
// </html>
