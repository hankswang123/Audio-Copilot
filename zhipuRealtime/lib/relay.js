import { WebSocketServer } from 'ws';
import { ZPRealtimeClient } from '../../src/lib/zhipuRealtime/client.js';

export class RealtimeRelayZhipu {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.sockets = new WeakMap();
    this.wss = null;
  }

  listen(port) {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', this.connectionHandler.bind(this));
    this.log(`Listening on ws://localhost:${port}`);
  }

  pcmToWav(pcmData, sampleRate = 44100, numChannels = 1, bitsPerSample = 16) {
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const wavHeader = new ArrayBuffer(44);
    const headerView = new DataView(wavHeader);
  
    // "RIFF" chunk descriptor
    headerView.setUint32(0, 0x52494646, false); // "RIFF"
    headerView.setUint32(4, 36 + pcmData.byteLength, true); // File size - 8 bytes
    headerView.setUint32(8, 0x57415645, false); // "WAVE"
  
    // "fmt " sub-chunk
    headerView.setUint32(12, 0x666d7420, false); // "fmt "
    headerView.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
    headerView.setUint16(20, 1, true); // Audio format (1 for PCM)
    headerView.setUint16(22, numChannels, true); // Number of channels
    headerView.setUint32(24, sampleRate, true); // Sample rate
    headerView.setUint32(28, byteRate, true); // Byte rate
    headerView.setUint16(32, blockAlign, true); // Block align
    headerView.setUint16(34, bitsPerSample, true); // Bits per sample
  
    // "data" sub-chunk
    headerView.setUint32(36, 0x64617461, false); // "data"
    headerView.setUint32(40, pcmData.byteLength, true); // PCM data size
  
    // Combine header and PCM data
    const wavBuffer = new Uint8Array(wavHeader.byteLength + pcmData.byteLength);
    wavBuffer.set(new Uint8Array(wavHeader), 0);
    wavBuffer.set(new Uint8Array(pcmData), wavHeader.byteLength);
  
    return wavBuffer.buffer;
  }  


  async connectionHandler(ws, req) {
    if (!req.url) {
      this.log('No URL provided, closing connection.');
      ws.close();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    console.log(url);
    const pathname = url.pathname;
    console.log(pathname); 

    if (pathname !== '/') {
      this.log(`Invalid pathname: "${pathname}"`);
      ws.close();
      return;
    }

    // Instantiate new client
    this.log(`Connecting with key "${this.apiKey.slice(0, 3)}..."`);
    const client = new ZPRealtimeClient({ apiKey: this.apiKey });

    // Relay: ZhipuAI Realtime API Event -> Browser Event
    client.realtime.on('server.*', (event) => {
      this.log(`Relaying "${event.type}" to Client`);
      this.log(event);
      ws.send(JSON.stringify(event));
    });
    client.realtime.on('close', () => ws.close());

    // Relay: Browser Event -> ZhipuAI Realtime API Event
    // We need to queue data waiting for the ZhipuAI connection
    const messageQueue = [];
    const messageHandler = (data) => {
      try {
        const event = JSON.parse(data);
        this.log(`Relaying "${event.type}" to ZhipuAI`);
        this.log(event);
        //this.log(event.item.content);
        if(event.session){
          client.realtime.send(event.type, {session: event.session});
          this.log({type: event.type, session: event.session});
          //client.realtime.send(event.type, { event.session });
        }else if(event.item){
          //client.realtime.send(event.type, {item: event.item});
          //this.log({type: event.type, item: event.item});

          client.realtime.dispatch(`client.${event.type}`, event);
          client.realtime.dispatch('client.*', event);
          this.log(`sent:`, event.type, event);
          client.realtime.ws.send(JSON.stringify(event));          

        }else if(event.audio){
          client.realtime.send(event.type, {audio: event.audio});
          //zhipu only supports wav format
          //client.realtime.send(event.type, {audio: this.pcmToWav(event.audio)});
        }else{
          client.realtime.send(event.type);
        }
      } catch (e) {
        console.error(e.message);
        this.log(`Error parsing event from client: ${data}`);
      }
    };
    ws.on('message', (data) => {
      if (!client.isConnected()) {
        messageQueue.push(data);
      } else {
        messageHandler(data);
      }
    });
    ws.on('close', () => client.disconnect());    


    // Connect to ZhipuAI Realtime API
    try {
      this.log(`Connecting to ZhipuAI...`);
      await client.connect();
    } catch (e) {
      this.log(`Error connecting to ZhipuAI: ${e.message}`);
      ws.close();
      return;
    }
    this.log(`Connected to ZhipuAI ZhipuAI!`);
    while (messageQueue.length) {
      messageHandler(messageQueue.shift());
    }   

  }

  log(...args) {
    console.log(`[RealtimeRelay]`, ...args);
  }
}
