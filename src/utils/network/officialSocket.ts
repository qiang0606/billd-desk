import { decode, encode } from '@msgpack/msgpack';
import { Socket, io } from 'socket.io-client';

import { useAppStore } from '@/store/app';
import { usePiniaCacheStore } from '@/store/cache';
import { useNetworkStore } from '@/store/network';
import { WsMsgTypeEnum } from '@/types/websocket';
import { IPC_EVENT } from '@/event';
import { WINDOW_ID_ENUM } from '@/constant';
import { ipcRendererInvoke } from '@/utils';

import {
  OFFICIAL_PROTOCOL_VERSION,
  decryptOfficialRelays,
  officialRequest,
} from './officialApi';

type Listener = (...args: any[]) => void;

// Socket.IO's public custom-parser contract. No vendor implementation is bundled.
class Decoder {
  private decoded: Listener[] = [];
  on(_name: string, listener: Listener) {
    this.decoded.push(listener);
    return this;
  }
  off(_name: string, listener: Listener) {
    this.decoded = this.decoded.filter((v) => v !== listener);
    return this;
  }
  add(data: ArrayBuffer | Uint8Array) {
    const packet = decode(new Uint8Array(data));
    this.decoded.forEach((fn) => fn(packet));
  }
  destroy() {}
}
class Encoder {
  encode(packet: any) {
    const { options: _options, ...wire } = packet;
    return [encode(wire)];
  }
}

export class OfficialConnection {
  readonly raw: Socket;
  readonly facade: Socket;
  private listeners = new Map<string, Listener[]>();
  private lastHeartbeat = 0;
  readonly peers = new Map<
    string,
    {
      uuid: string;
      verifyTurnServerId: string;
      remoteRecordId: number;
      iceServers: RTCIceServer[];
    }
  >();

  constructor(
    url: string,
    private roomId: string
  ) {
    const cache = usePiniaCacheStore();
    this.raw = io(url, {
      transports: ['websocket'],
      path: '/rtc',
      addTrailingSlash: false,
      parser: { Encoder, Decoder } as any,
      query: {
        'X-Billd-Env': 'windows',
        'X-Billd-App': 'billd_desk',
        'X-Billd-Appver': OFFICIAL_PROTOCOL_VERSION,
        'X-Billd-DeskUserUuid': cache.deskUserUuid,
        'X-Billd-DeskUserPassword': cache.deskUserPassword,
      },
      auth: { a: '1' },
    });
    const self = this;
    this.facade = {
      get id() {
        return self.raw.id;
      },
      get connected() {
        return self.raw.connected;
      },
      on(name: string, fn: Listener) {
        self.listeners.set(name, [...(self.listeners.get(name) || []), fn]);
        return this;
      },
      off(name: string, fn?: Listener) {
        self.listeners.set(
          name,
          fn ? (self.listeners.get(name) || []).filter((v) => v !== fn) : []
        );
        return this;
      },
      close() {
        self.close();
        return this;
      },
    } as unknown as Socket;
    this.raw.on('connect', () => this.notify('connect'));
    this.raw.on('disconnect', (reason) => {
      [...this.peers.keys()].forEach((id) => this.dropPeer(id));
      this.notify('disconnect', reason);
    });
    this.raw.on('connect_error', () =>
      this.notify('disconnect', '官方服务连接失败')
    );
    this.raw.onAny((event, ...args) => {
      const data = args[2];
      void this.receive(event, data).catch((error) => {
        window.$message?.error(error.message || '官方协议处理失败');
      });
    });
  }

  private notify(name: string, ...args: any[]) {
    (this.listeners.get(name) || []).forEach((fn) => fn(...args));
  }

  private emit(name: string, data: any, id: string = crypto.randomUUID()) {
    this.raw.emit(name, id, Date.now(), this.raw.id, data);
  }

  private displayInfo(streamid = '') {
    const app = useAppStore();
    return {
      streamid,
      os: 'windows',
      size: {
        width: app.primaryDisplaySize.width * app.scaleFactor,
        height: app.primaryDisplaySize.height * app.scaleFactor,
      },
      scale: app.scaleFactor,
      deviceName: 'Primary display',
      deviceString: '',
      id: 0,
      index: 0,
      displayid: 0,
      sourceid: '',
      isPrimary: true,
      origin: { x: 0, y: 0 },
      resolutions: [],
    };
  }

  private async receive(event: string, data: any) {
    if (event === 'joinResult') {
      this.notify(WsMsgTypeEnum.billdDeskJoined, { live_room_id: this.roomId });
    } else if (event === 'message' && data?.data?.type === 'verifyTurnServer') {
      const cache = usePiniaCacheStore();
      this.emit('verifyTurnServerResult', {
        sender: this.raw.id,
        receiver: data.sender,
        verifyTurnServerId: data.verifyTurnServerId,
        slave_uuid: data.master_uuid,
        master_uuid: cache.deskUserUuid,
        master_password: cache.deskUserPassword,
        data: {
          type: 'verifyTurnServerResult',
          code: 0,
          data: {
            displayInfo: [this.displayInfo()],
            clientInfo: {
              env: 'windows',
              app: 'billd_desk',
              app_ver: OFFICIAL_PROTOCOL_VERSION,
            },
            deviceInfo: {},
            hardwareInfo: {},
          },
        },
        msg: 'ARM64 compatibility host ready',
      });
    } else if (event === 'startRtcResult') {
      if (data?.code !== 0) throw new Error(data?.msg || '官方服务拒绝连接');
      const info = data.data;
      if (
        !info?.sender ||
        info.remoteDeskUserUuid !== usePiniaCacheStore().deskUserUuid
      )
        return;
      const iceServers = await decryptOfficialRelays(info.turnServer);
      this.peers.set(info.sender, {
        uuid: info.deskUserUuid,
        verifyTurnServerId: info.verifyTurnServerId,
        remoteRecordId: info.remoteRecordId,
        iceServers,
      });
      this.notify(WsMsgTypeEnum.billdDeskStartRemoteResult, {
        code: 0,
        msg: '',
        data: {
          ...info,
          receiver: this.raw.id,
          maxBitrate: info.maxBitrate * 1000,
        },
      });
    } else if (
      ['nativeWebRtcAnswer', 'nativeWebRtcCandidate'].includes(event)
    ) {
      if (
        !data ||
        data.receiver !== this.raw.id ||
        !this.peers.has(data.sender)
      )
        return;
      this.notify(event, { ...data, isRemoteDesk: true });
    } else if (
      ['masterBreakRemote', 'leaveRemoteResult', 'breakRemote'].includes(event)
    ) {
      this.peers.forEach((peer, socketId) => {
        if (
          peer.uuid === data?.masterUuid ||
          peer.uuid === data?.remoteDeskUserUuid ||
          socketId === data?.sender
        ) {
          this.dropPeer(socketId);
        }
      });
    }
  }

  send(msgType: string, data: any, requestId: string) {
    const cache = usePiniaCacheStore();
    if (msgType === WsMsgTypeEnum.billdDeskJoin) {
      this.emit(
        'join',
        {
          roomId: this.roomId,
          deskUserUuid: cache.deskUserUuid,
          deviceInfo: {
            system: 'Windows ARM64',
            computerName: 'BilldDesk OpenSource ARM64',
          },
          startupTime: Date.now(),
        },
        requestId
      );
    } else if (msgType === WsMsgTypeEnum.billdDeskUpdateUser) {
      if (Date.now() - this.lastHeartbeat < 10000) return;
      this.lastHeartbeat = Date.now();
      void officialRequest('/ws/keep_alive', {
        accountUserName: '',
        socketId: this.raw.id,
        deskUserUuid: cache.deskUserUuid,
        deviceInfo: { system: 'Windows ARM64' },
      }).catch(() => {});
    } else if (
      [
        'nativeWebRtcOffer',
        'nativeWebRtcAnswer',
        'nativeWebRtcCandidate',
      ].includes(msgType)
    ) {
      const peer = this.peers.get(data.receiver);
      if (!peer) return;
      this.emit(
        msgType,
        {
          sender: this.raw.id,
          receiver: data.receiver,
          deskUserUuid: cache.deskUserUuid,
          remoteDeskUserUuid: peer.uuid,
          verifyTurnServerId: peer.verifyTurnServerId,
          remoteRecordId: peer.remoteRecordId,
          ...(data.sdp
            ? { sdp: { type: data.sdp.type, sdp: data.sdp.sdp } }
            : { candidate: data.candidate }),
        },
        requestId
      );
    }
  }

  handleData(rtc: any, message: any, stream?: MediaStream) {
    if (!this.peers.has(rtc.receiver)) return false;
    const channel = rtc.cbDataChannel;
    const reply = (msgType: string, data: any) => {
      if (channel?.readyState === 'open')
        channel.send(JSON.stringify({ msgId: message.msgId, msgType, data }));
    };
    if (message.msgType === 'ping') {
      reply('pong', { t: Date.now(), cb: '1' });
      return true;
    }
    if (message.msgType === 'screenInfo') {
      reply('screenInfoResult', { res: [this.displayInfo(stream?.id || '')] });
      return true;
    }
    if (message.msgType === 'videoLoadedmetadataResult') return true;
    if (message.msgType === 'remoteCmd') {
      void ipcRendererInvoke({
        windowId: WINDOW_ID_ENUM.remote,
        channel: IPC_EVENT.officialRemoteInput,
        requestId: message.msgId,
        data: { input: message.data },
      })
        .then((result) => {
          if (message.data?.cb)
            reply('remoteCmd', { code: result?.code ?? 1, cb: '1' });
        })
        .catch(() => {
          if (message.data?.cb) reply('remoteCmd', { code: 1, cb: '1' });
        });
      return true;
    }
    return false;
  }

  private dropPeer(socketId: string) {
    useNetworkStore().removeRtc(socketId);
    useAppStore().remoteDesk.delete(socketId);
    this.peers.delete(socketId);
    if (!this.peers.size)
      void ipcRendererInvoke({
        windowId: WINDOW_ID_ENUM.remote,
        channel: IPC_EVENT.officialRemoteInput,
        requestId: crypto.randomUUID(),
        data: { input: { type: 'releaseAll' } },
      }).catch(() => {});
  }

  close() {
    [...this.peers.keys()].forEach((id) => this.dropPeer(id));
    this.raw.close();
    this.listeners.clear();
  }
}
