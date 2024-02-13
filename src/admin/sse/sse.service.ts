import { Injectable, OnModuleInit } from '@nestjs/common';
import { BehaviorSubject, interval, Observable } from 'rxjs';
import { MsgData } from './msg-data';

@Injectable()
export class SseService implements OnModuleInit {
  onModuleInit() {
    // Keep client connection alive
    interval(20000).subscribe(() => {
      this.wakeUp('');
    });
  }

  private sseMsg = new BehaviorSubject<MsgData>(
    new MsgData('init', 'initial msg'),
  );
  private keepAliveMsg = new BehaviorSubject<MsgData>(
    new MsgData('init', 'initial msg'),
  );
  public sseMsg$: Observable<MsgData> = this.sseMsg.asObservable();
  public keepAliveMsg$: Observable<MsgData> = this.keepAliveMsg.asObservable();

  fire(msg: string) {
    this.sseMsg.next(new MsgData('fired', msg));
  }

  wakeUp(msg: string) {
    this.keepAliveMsg.next(new MsgData('wakeUp', msg));
  }
}
