/**
 * Running a local relay server will allow you to hide your API key
 * and run custom logic on the server
 *
 * Set the local relay server address to:
 * REACT_APP_LOCAL_RELAY_SERVER_URL=http://localhost:8081
 *
 * This will also require you to set OPENAI_API_KEY= in a `.env` file
 * You can run it with `npm run relay`, in parallel with `npm start`
 */
const LOCAL_RELAY_SERVER_URL: string =
  process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions, additional_info } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap, ArrowUp, ArrowDown, Play, Pause, Mic, MicOff } from 'react-feather';
import { Button } from '../components/button/Button';
import { Toggle } from '../components/toggle/Toggle';
import { Map } from '../components/Map';

import './ConsolePage.scss';
import { isJsxOpeningLikeElement } from 'typescript';
import e from 'express';
import { audioCaptions } from '../utils/audio_captions.js';

//import nodemailer from 'nodemailer';
/**
 * Type for result from get_weather() function call
 */
interface Coordinates {
  lat: number;
  lng: number;
  location?: string;
  temperature?: {
    value: number;
    units: string;
  };
  wind_speed?: {
    value: number;
    units: string;
  };
}

/**
 * Type for all event logs
 */
interface RealtimeEvent {
  time: string;
  source: 'client' | 'server';
  count?: number;
  event: { [key: string]: any };
}

export function ConsolePage() {
  /**
   * Ask user for API Key
   * If we're using the local relay server, we don't need this
   */
  /*
  const apiKey = LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') ||
      prompt('OpenAI API Key') ||
      '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }*/

  //Comment out orinial API Key Prompt and 
  //Postpone the Prompt to first unmute click(will enable audio copilot)
  const apiKey = '';

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      LOCAL_RELAY_SERVER_URL
        ? { url: LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const eventsScrollHeightRef = useRef(0);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - realtimeEvents are event logs, which can be expanded
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<{
    [key: string]: boolean;
  }>({});
  const [isConnected, setIsConnected] = useState(false);
  const [canPushToTalk, setCanPushToTalk] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  const [coords, setCoords] = useState<Coordinates | null>({
    lat: 37.775593,
    lng: -122.418137,
  });
  const [marker, setMarker] = useState<Coordinates | null>(null);

  //hanks - Implementation of audio copilot
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0); // State to control playback speed
  const [isHidden, setIsHidden] = useState(true); // State to control audio/video visibility
  const [isDragging, setIsDragging] = useState(false);
  const [currentCaption, setCurrentCaption] = useState(''); // State to display current caption
  const [totalDuration, setTotalDuration] = useState(0); // State to store total duration
  const [currentTime, setCurrentTime] = useState(0); // State to store current play time
  const [isCaptionVisible, setIsCaptionVisible] = useState(false); // State to manage caption visibility
  const [isMuteBtnDisabled, setIsMuteBtnDisabled] = useState(false);
  const [isConnectionError, setIsConnectionError] = useState(false);
  const [startingText, setStartingText] = useState('Copilot is turning on');
  const [dotCount, setDotCount] = useState(0);
  const progressBarRef = useRef(null);  
  const playPauseBtnRef = useRef<HTMLButtonElement>(null); // Add a ref for the play/pause button
  const audioRef = useRef<HTMLAudioElement | null>(null);  
  const videoRef = useRef<HTMLVideoElement | null>(null);  

  /* Try to addTool for sending mail by voice
  // Create a transporter object
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'helloqianfeng@gmail.com', // Replace with your Gmail address
      pass: 'mgmz zicm yjwp xumx', // Replace with your Gmail password or App Password
    },
  });

  const sendEmail = async (title: string, content: string, to: string) => {
    try {
      await transporter.sendMail({
        from: 'helloqianfeng@gmail.com', // Replace with your Gmail address
        to: to, // Receiver's email
        subject: title, // Subject line
        text: content, // Plain text body
        html: `<p>${content}</p>`, // HTML body
      });
      console.log('Email sent successfully');
    } catch (error) {
      console.error('Error sending email:', error);
    }
  };*/

  //Dynamic effect of 'Copilot is turning on......' 
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
  
    if (isMuteBtnDisabled) {
      intervalId = setInterval(() => {
        setDotCount((prevCount) => (prevCount + 1) % 4); // Cycle through 0, 1, 2, 3
      }, 500);
    } else {
      setStartingText(''); // Clear the text when not starting
    }
  
    return () => clearInterval(intervalId); // Cleanup interval on component unmount or when isMuteBtnDisabled changes
  }, [isMuteBtnDisabled]);  

  useEffect(() => {
    if (isMuteBtnDisabled) {
      setStartingText(`Copilot is turning on${'.'.repeat(dotCount)}`);
    }
  }, [dotCount, isMuteBtnDisabled]);  

  //Test copilot for video file
  const toggleVisibility = () => {
    setIsHidden(!isHidden);

    if(isHidden) {

      //audio is hidden, switch from audio to video
      if (audioRef.current) {
        audioRef.current.pause();
      } else {
        audioRef.current = new Audio('./audio/ck_interview.mp3');
      }
      if (videoRef.current) {
        videoRef.current.play();
      }        
    } else {
      //video is hidden, swtich from video to audio
      if (audioRef.current) {
        audioRef.current.play();
      }
      else {
        audioRef.current = new Audio('./audio/ck_interview.mp3');
        //audioRef.current.play();
      }

      if (videoRef.current) {
        videoRef.current.pause();
      }  
    }
  };  

  useEffect(() => {
    audioRef.current = new Audio('./audio/ngl_sep_lite.mp3');
    //audioRef.current = new Audio('./audio/ngl_sep.wav');
    //audioRef.current = new Audio('./audio/ck_interview.mp3');
    //audioRef.current = new Audio('./audio/sap_news_jack.wav');
    //audioRef.current = new Audio('./audio/sap_new_notbooklm.wav');

    //audioRef.current.onplay
    //videoRef.current = new Video('./video/ck_interview.mp4');
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };    
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate; // Set the playback speed
    }
  }, [playbackRate]);

  const playVideo = () => {
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

  const pauseVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };  

  const toggleCaptionVisibility = () => {
    setIsCaptionVisible(!isCaptionVisible);
  };     

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentTime(audio.currentTime);
      }
    };
    
    const updateCaption = () => {
      const currentTime = audio.currentTime;
      const currentCaption = audioCaptions.find((caption, index) => {
        const nextCaption = audioCaptions[index + 1];
        return currentTime >= caption.time && (!nextCaption || currentTime < nextCaption.time);
      });
      setCurrentCaption(currentCaption ? currentCaption.text : '');     
    };   

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('timeupdate', updateCaption);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('timeupdate', updateCaption);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, []);  

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      updateProgress(e.nativeEvent);
    };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      updateProgress(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const updateProgress = (e: MouseEvent | React.MouseEvent<HTMLDivElement>) => {
      const progressBar = progressBarRef.current;
      if(progressBar)
      {
        const rect = (progressBar as HTMLDivElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const newProgress = (offsetX / rect.width) * 100;
        setProgress(newProgress);

        if (audioRef.current) {
          // Update the playback position based on newProgress          
          audioRef.current.currentTime = (newProgress / 100) * audioRef.current.duration;
        }
      }
    };

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);  

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault(); // Prevent default space bar action (scrolling)
        if (playPauseBtnRef.current) {
          playPauseBtnRef.current.click(); // Trigger the button click event
        }        
      }
    };
  
    document.addEventListener('keydown', handleKeyDown);
  
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // Empty dependency array to run only once on mount  

  const toggleAudio = async () => {
    if (audioRef.current && isHidden) {
      if (isPlaying) {
        //audio should be paused when User speaks or LLM speaks
        audioRef.current.pause();
      } else {
        try {
          //start playing or resuming audio
          audioRef.current.play();
        } catch (error) {
          console.error('Error playing audio:', error);
        }
      }
      setIsPlaying(!isPlaying);
    }
    if(videoRef.current && !isHidden) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        try {
          videoRef.current.play();
        } catch (error) {
          console.error('Error playing video:', error);
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  /**
   * Utility for search news by google by addTool
   */
  async function performGoogleSearch(query: string): Promise<Array<{ title: string, url: string }>> {
    try {
      const response: Response = await fetch(`http://localhost:3001/api/news?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const results: any = await response.json();
      console.log('Search results:', results);

      return results.map((item: any): { title: any; url: any } => ({
        title: item.title,
        url: item.link
      }));
    } catch (error) {
      console.error('Error in performGoogleSearch:', error);
      return [
        {
          title: '',
          url: ''
        }
      ];
    }
  }  

  const toggleMuteRecording = async () => {
    if (wavRecorderRef.current && clientRef.current) {
      if (isMuted) {
        await unmuteRecording();
      } else {
        await muteRecording();
      }
      setIsMuted(!isMuted);
    }

    const apiKey = localStorage.getItem('tmp::voice_api_key')
    if (apiKey == '' || !clientRef.current.isConnected() || isConnectionError) {
      setIsMuted(true);
    }        
  };

  /*
  * Unmute recording, the audio copilot by first unmuting the recording  
  */
  const unmuteRecording = async () => {
    //setIsMuted(false);
    //const wavRecorder = wavRecorderRef.current;
    const client = clientRef.current;
    if (client.isConnected()){
      setIsMuted(false);
      const wavRecorder = wavRecorderRef.current;      
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    } else {
      setIsMuteBtnDisabled(true);
      switchAudioCopilot('server_vad');
    }
  };    

  const muteRecording = async () => {
    const client = clientRef.current;
    if (client.isConnected()){
      setIsMuted(true);
      const wavRecorder = wavRecorderRef.current;
      await wavRecorder.pause();
    }
  };    

  /**
   * Switch between Audio Copilot On/Off
   */  
  const switchAudioCopilot = async (value: string) => {
    
    const client = clientRef.current;
    
    if(client.isConnected()) {  
      if(value === 'none') {
        await switchAudioCopilotOff();
      } else {
        await switchAudioCopilotOn();
      }
    }
    else{
      if(value === 'server_vad'){
        await switchAudioCopilotOn();
      }
    }    
  };

  /**
     * Switch to Audio Copilot On
     */
  const switchAudioCopilotOn = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    // Set state variables
    startTimeRef.current = new Date().toISOString();
    setRealtimeEvents(realtimeEvents);
    //setItems(client.conversation.getItems());
    setItems(items);

    /*
    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    // Enhanced with one parameter to resume playback when reply speek is finished
    await wavStreamPlayer.connect(audioRef.current, videoRef.current, setIsPlaying);
    wavStreamPlayer.askStop = true;
    */

    try{
      setIsConnectionError(false);
      // Connect to realtime API
      // debug finding: even without API_KEY is not set, the connection is still established
      // websocket connection is established, but the API_KEY is not set

  
      const apiKey = LOCAL_RELAY_SERVER_URL
        ? ''
        : localStorage.getItem('tmp::voice_api_key') ||
          prompt('OpenAI API Key') ||
          '';
      if (apiKey !== '') {
        localStorage.setItem('tmp::voice_api_key', apiKey);
      }      
      if (apiKey !== '') {
        client.realtime.apiKey = apiKey;
        await client.connect();
      } else {
        //setIsMuted(!isMuted);
        setIsMuteBtnDisabled(false);        
      }
      //await client.connect();

      /*
      // Connect to microphone
      await wavRecorder.begin();

      // Connect to audio output
      // Enhanced with one parameter to resume playback when reply speek is finished
      await wavStreamPlayer.connect(audioRef.current, videoRef.current, setIsPlaying);
      wavStreamPlayer.askStop = true;      
      */
      /*
      client.sendUserMessageContent([
        {
          type: `input_text`,
          text: `Hello!`,
          // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
        },
      ]);    */
      
      //setIsConnected(true);

      //if (client.getTurnDetectionType() === 'server_vad' && client.isConnected()) {
      //  await wavRecorder.record((data) => client.appendInputAudio(data.mono));
        // Test new feature - Capture audio from other apps 
        /*
        const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true });
        const audioContext = new AudioContext({ sampleRate: 44100 });
        const source = audioContext.createMediaStreamSource(stream);
    
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(audioContext.destination);
    
        processor.onaudioprocess = (audioEvent) => {
            const float32Data = audioEvent.inputBuffer.getChannelData(0);
            const pcm16Data = new Int16Array(float32Data.length);
    
            // Convert Float32 to PCM16
            for (let i = 0; i < float32Data.length; i++) {
                let s = Math.max(-1, Math.min(1, float32Data[i]));
                pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            client.appendInputAudio(pcm16Data);

            // pcm16Data now contains the PCM16 audio data
            console.log(pcm16Data);
            // You can now send pcm16Data to a server, save to file, etc.
        }; */         
        // Test new feature - Capture audio from other apps
        
      //}

      // mute recording by default when copilot is turned on
      //await muteRecording();            
    } catch (error) {
      setIsMuted(true);
      setIsMuteBtnDisabled(false);
      setIsConnectionError(true);
      //switchAudioCopilotOff();
      console.error('Error playing audio:', error);
    }

  }, []);
    
  /**
   * switch to Audio Copilot Off
   */
  const switchAudioCopilotOff = useCallback(async () => {
    setIsConnected(false);
    //setRealtimeEvents([]);
    //setItems([]);
    setMemoryKv({});
    setCoords({
      lat: 37.775593,
      lng: -122.418137,
    });
    setMarker(null);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();   

  }, []);

  /**
   * Capture audio from other apps, e.g. Microsoft Teams, 
   * This could be a new feature for Audio Copilot to prepare an reference answer when user is 
   * in an interview or in a customer-facing issue resolution.
   */
  async function captureAudioToPCM16() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (audioEvent) => {
        const float32Data = audioEvent.inputBuffer.getChannelData(0);
        const pcm16Data = new Int16Array(float32Data.length);

        // Convert Float32 to PCM16
        for (let i = 0; i < float32Data.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Data[i]));
            pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // pcm16Data now contains the PCM16 audio data
        console.log(pcm16Data);
        // You can now send pcm16Data to a server, save to file, etc.
    };
  }
//captureAudioToPCM16();

//hanks
  /**
   * Utility for formatting the timing of logs
   */
  const formatTime = useCallback((timestamp: string) => {
    const startTime = startTimeRef.current;
    const t0 = new Date(startTime).valueOf();
    const t1 = new Date(timestamp).valueOf();
    const delta = t1 - t0;
    const hs = Math.floor(delta / 10) % 100;
    const s = Math.floor(delta / 1000) % 60;
    const m = Math.floor(delta / 60_000) % 60;
    const pad = (n: number) => {
      let s = n + '';
      while (s.length < 2) {
        s = '0' + s;
      }
      return s;
    };
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  }, []);

  /**
   * When you click the API key
   */
  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      //window.location.reload();
    }
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * Auto-scroll the event logs
   */
  useEffect(() => {
    if (eventsScrollRef.current) {
      const eventsEl = eventsScrollRef.current;
      const scrollHeight = eventsEl.scrollHeight;
      // Only scroll if height has just changed
      if (scrollHeight !== eventsScrollHeightRef.current) {
        eventsEl.scrollTop = scrollHeight;
        eventsScrollHeightRef.current = scrollHeight;
      }
    }
  }, [realtimeEvents]);

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#009900',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    // Get refs
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    // Set instructions
    client.updateSession({ instructions: instructions });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });

    // hanks - Set turn detection to server VAD by default
    client.updateSession({ turn_detection: { type: 'server_vad' } });    
    // hanks

    // Add tools
    client.addTool(
      {
        name: 'set_memory',
        description: 'Saves important data about the user into memory.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'The key of the memory value. Always use lowercase and underscores, no other characters.',
            },
            value: {
              type: 'string',
              description: 'Value can be anything represented as a string',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }: { [key: string]: any }) => {
        setMemoryKv((memoryKv) => {
          const newKv = { ...memoryKv };
          newKv[key] = value;
          return newKv;
        });
        return { ok: true };
      }
    );
    client.addTool(
      {
        name: 'get_weather',
        description:
          'Retrieves the weather for a given lat, lng coordinate pair. Specify a label for the location.',
        parameters: {
          type: 'object',
          properties: {
            lat: {
              type: 'number',
              description: 'Latitude',
            },
            lng: {
              type: 'number',
              description: 'Longitude',
            },
            location: {
              type: 'string',
              description: 'Name of the location',
            },
          },
          required: ['lat', 'lng', 'location'],
        },
      },
      async ({ lat, lng, location }: { [key: string]: any }) => {
        setMarker({ lat, lng, location });
        setCoords({ lat, lng, location });
        const result = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m`
        );
        const json = await result.json();
        const temperature = {
          value: json.current.temperature_2m as number,
          units: json.current_units.temperature_2m as string,
        };
        const wind_speed = {
          value: json.current.wind_speed_10m as number,
          units: json.current_units.wind_speed_10m as string,
        };
        setMarker({ lat, lng, location, temperature, wind_speed });
        return json;
      }
    );
    // hanks - Capabilities of Aduio Copilot
    client.addTool(
      { //Capabilities demo: when a listener wants to ask for a google search
        name: 'google_search',
        description:
          'Performs a Google News search and returns the top 2 results.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to be used.',
            },           
          },
          required: ['query'],
        },
      },
      async({ query }: { query: string }) => {
        return await performGoogleSearch(query);
      }
    );    
    client.addTool(
      { //Capabilities demo: to retrieve the latest stock for a given company
        //e.g. get_stock_price(company: 'SAP') when valuation of SAP is heard, 
        //user is just a tiny SAP stock holder and want to check the latest SAP stock prcie 
        name: 'get_stock_price',
        description:
          'Retrieves the latest stock price for a given comppany. ',
        parameters: {
          type: 'object',
          properties: {
            company: {
              type: 'string',
              description: 'Name of the company',
            },
          },
          required: ['company'],
        },
      },
      async ({ company }: { [key: string]: any }) => {
        /*
        const result = await fetch(
          `https://api.openai.com/v1/stock_price?company=${company}`
        );*/
        const result = {
          ok: true,
          date: '2024-10-25',
          company: 'SAP',
          price: 237.69,
          currency: 'USD',
        };
        //const json = await result.json();
        return result;
      }
    );
    client.addTool(
      { //Voice commands to control the on-going playback, e,g. pause, resume, speed up, speed down, 
        //skip forward, skip backward, volume up, volume down, peek the current time of the audio
        name: 'audio_control',
        description:
          'Voice control the on-going playback. e.g. stop the audio, speed up or down the audio',
        parameters: {
          type: 'object',
          properties: {
            context: {
              type: 'string',
              description: 'additional information to control the audio',
            },
            command: {
              type: 'string',
              description: 'commoand to control the audio',
            },
          },
          required: ['context', 'command'],
        },
      },
      async ({ context, command }: { [key: string]: any }) => {
        //const audio = audioRef.current;
        const wavStreamPlayer = wavStreamPlayerRef.current;

        wavStreamPlayer.askStop = false;

        if (command === 'pause') {
          wavStreamPlayer.askStop = true;
        } else if (command === 'resume') {
          wavStreamPlayer.askStop = false;
        } else if (command === 'speed') {
          if (context === 'up') {
            setPlaybackRate(playbackRate + 0.25);
          } else if (context === 'down') {
            setPlaybackRate(playbackRate - 0.25);
          } else if (context === 'normal') {
            setPlaybackRate(1.0);
          }
        } else if (command === 'skip') {  
          if ( audioRef.current ) {
            if (context === 'forward') {
              audioRef.current.currentTime += 10;
            } else if (context === 'backward') {
              audioRef.current.currentTime -= 10;
              if (audioRef.current.currentTime < 0) {
                audioRef.current.currentTime = 0;
              }
            } else if ( context == 'start') {
              audioRef.current.currentTime = 0;
            }
          }
        } else if ( command === 'volume') {
          if (audioRef.current) {
            if (context === 'up') {
              audioRef.current.volume = Math.min(audioRef.current.volume + 0.1, 1.0);
            } else if (context === 'down') {
              audioRef.current.volume = Math.max(audioRef.current.volume - 0.5, 0.0);
            }
          }          
        } else if ( command === 'peek') {  
          if (audioRef.current) {
            return { ok: true, currentTime: audioRef.current.currentTime, duration: audioRef.current.duration };
          }
          
        }  
        return { ok: true };
      }
    );        
    client.addTool(
      { //Jury's feedback: What if it could interpret what Copilot hear into local language in realtime? 
        //e.g. Copilot hears English, and translate it into Chinese in realtime
        //This helps listners to consume the audio in the local language
        name: 'translation_current_sentence',
        description:
          'translate the current sentence to the target language, by default, it is Chinese if not specified target language',
        parameters: {
          type: 'object',
          properties: {
            target_lan: {
              type: 'string',
              description: 'target language',
            },
          },          
        },
      },
      async ({ target_lan }: { [key: string]: any }) => {
        if ( audioRef.current ) {
          if (target_lan === null) {
            return { ok: true, target_lan: 'zh', currentTime: audioRef.current.currentTime, duration: audioRef.current.duration};
          } else {
            return { ok: true, target_lan: target_lan, currentTime: audioRef.current.currentTime, duration: audioRef.current.duration  };
          }
        } else {
          return { ok: false, info: 'No audio file is playing' };
        }
        
      }
    );    
    client.addTool(
      { //Capabilities demo: when a lister wants to provide feedback
        //or similarly, sharing it to a friend...
        name: 'feedback_collection',
        description:
          'Collect feedback from the user. e.g. feedback on the company AI first strategy...',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'feedback title',
            },
            content: {
              type: 'string',
              description: 'feedback content',
            },
          },
          required: ['title', 'content'],
        },
      },
      async ({ title, content }: { [key: string]: any }) => {
        return { ok: true, info: 'Thanks for your feedback' };
      }
    );
    client.addTool(
      { //Capabilities demo: when a lister wants to send a mail to a friend
        name: 'send_mail',
        description:
          'help the user to send the mail to a specific Recipient',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'feedback title',
            },
            content: {
              type: 'string',
              description: 'feedback content',
            },
            to: {
              type: 'string',
              description: 'mail receiver',
            },            
          },
          required: ['query'],
        },
      },
      async ({ title, content }: { [key: string]: any }) => {
        return { ok: true, info: 'Thanks for mail' };
      }
    );
    // hanks

    // handle realtime events from client + server for event logging
    client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
      setRealtimeEvents((realtimeEvents) => {
        const lastEvent = realtimeEvents[realtimeEvents.length - 1];
        if (lastEvent?.event.type === realtimeEvent.event.type) {
          // if we receive multiple events in a row, aggregate them for display purposes
          lastEvent.count = (lastEvent.count || 0) + 1;
          return realtimeEvents.slice(0, -1).concat(lastEvent);
        } else {
          return realtimeEvents.concat(realtimeEvent);
        }
      });
    });
//  client.on('error', (event: any) => console.error(event));
    client.on('error', (event: any) => {
      console.error(event);
    });
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }  
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      // hanks - Resume audio when item is 'completed'
      wavStreamPlayer.setItemStatus(item.status);
      wavStreamPlayer.isHidden = isHidden;
      // hanks 

      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    // hanks - Pause on-going playback when speech is detected
    client.realtime.on('server.error', () => {
      console.error("Error from server");
    });    
    client.realtime.on('server.input_audio_buffer.speech_started', () => {
      if (audioRef.current){
        audioRef.current.pause();
        setIsPlaying(false);
      }      
      if (videoRef.current){
        videoRef.current.pause();
        setIsPlaying(false);
      }
    });     
    // Copilot will be activated at the first click of the mute button to unmute to ask for the first question
    client.realtime.on('server.session.created', async () => {
      //when a new connection is established as this first server event received
      //Ensure Mute/Unmute button is only active after both the connection is established and the recording is started

      const intervalId = setInterval(() => {
        if ('paused' === wavRecorderRef.current.getStatus()) {
          clearInterval(intervalId);
          setIsMuteBtnDisabled(false);
        }
      }, 100);      

      const client = clientRef.current;
      const wavRecorder = wavRecorderRef.current;
      const wavStreamPlayer = wavStreamPlayerRef.current;      

      // Connect to microphone
      await wavRecorder.begin();

      // Connect to audio output
      // Enhanced with one parameter to resume playback when reply speek is finished
      await wavStreamPlayer.connect(audioRef.current, videoRef.current, setIsPlaying);
      wavStreamPlayer.askStop = true;      

      /*
      client.sendUserMessageContent([
        {
          type: `input_text`,
          text: `Hello!`,
          // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
        },
      ]);    */
      setIsConnected(true);
      
      /*
      if (client.getTurnDetectionType() === 'server_vad' && client.isConnected()) {
        await wavRecorder.record((data) => client.appendInputAudio(data.mono));
      } */   

      /*
      const intervalId = setInterval(() => {
        if ('recording' === wavRecorderRef.current.getStatus()) {
          clearInterval(intervalId);
          setIsMuteBtnDisabled(false);
        }
      }, 100);*/
    });      
    // hanks

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  interface FormatTimeProps {
    time: number;
  }

  const formatDuration = ({ time }: FormatTimeProps): string => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return hours > 0
      ? `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
      : `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      <div className="content-top">
        <div className="content-title">
          <img src="/resource/great_developer.jpg" />
          <span>An <span>Audio Copilot</span> Empowered by LLM</span>
        </div>
        <div className="content-api-key">
          {!LOCAL_RELAY_SERVER_URL && (
            <Button
              icon={Edit}
              iconPosition="end"
              buttonStyle="flush"
              label={`api key: ${apiKey.slice(0, 3)}...`}
              onClick={() => resetAPIKey()}
            />
          )}
        </div>
      </div>
      <div>
        <object data="./resource/background_lite.pdf" type="application/pdf" width="100%" height="672px">
          {<p>Your browser does not support PDFs. <a href="./resource/background_lite.pdf">Download the PDF</a>.</p> }
        </object>        
      </div>
      {/* Add a div to display the current caption */}
      {isCaptionVisible && (
        <div className="caption-display">
          {currentCaption}
        </div>
      )}      
      <div className='button-row'>
        <Button
              label={isCaptionVisible ? 'Hide Captions' : 'Show Captions'}
              buttonStyle={'regular'}
              onClick={toggleCaptionVisibility}
              className='button'
            />  
        {/* This hidden button is to receive space bar down event to play/pause the audio */}
        <button ref={playPauseBtnRef} onClick={toggleAudio} className='hidden-button'></button>
        <Button
                label={isPlaying ? 'Pause' : 'Play\u00A0'}
                iconPosition={'start'}
                icon={isPlaying ? Pause : Play}
                buttonStyle={'regular'}
                onClick={toggleAudio}
                className='button'
              />
        <div 
          ref={progressBarRef}
          style={{position: 'relative', width: '45%', backgroundColor: '#ccc', height: '10px', borderRadius: '10px', marginTop: '10px', marginLeft: '-16px' }}
          onMouseDown={handleMouseDown}
        >
          <div
            style={{
              width: `${progress}%`,
              backgroundColor: '#007bff',
              height: '10px',
              borderRadius: '10px',
            }}
          />
          {/* Display the current play time */}
          <div
            style={{
              position: 'absolute',
              top: '-25px', // Adjust as needed
              left: `${progress}%`, // Move with the progress bar
              transform: 'translateX(-20%)', // Center the text
              backgroundColor: 'rgba(255, 255, 255, 0)',
              color: 'rgba(0, 0, 0, 0.7)',
              padding: '5px',
              borderRadius: '5px',
              fontSize: '0.9em',
            }}
          >
            {formatDuration({time: currentTime})}
          </div>          
          {/* Display the total duration */}
          <div className="audio-duration">
            {/*totalDuration*/}
            {/*formatTime({totalDuration})*/}
            {formatDuration({time: totalDuration})}
          </div>          
        </div>    
        {/* Hide the audio copilot Toggle component and set it on by default */}    
        {false && (            
          <Toggle
            defaultValue={true}
            labels={['\u00A0', 'Audio Copilot']}
            values={['none', 'server_vad']}
            onChange={(_, value) => switchAudioCopilot(value)}
          />
        )}
        <div className="container">
          <Button
              label={isMuted ? '' : ''}
              iconPosition={'start'}
              icon={isMuted ? MicOff : Mic}
              disabled={isMuteBtnDisabled}
              buttonStyle={'regular'}
              onClick={
                isMuted ? toggleMuteRecording : toggleMuteRecording
              }
            />
          <div className="tooltip">
            <strong className='tooltip-title'>Turn on/off microphone</strong><br />
            {!isConnected && <>The <span className="highlightred">first</span> turning on will start the Audio Copilot.<br /><br /> </>}
            {isConnected && <><br /> </>}
          </div>            
        </div> 
        <div style={{ fontSize: '1.1em' }}>{isConnected ? ( <> Copilot is <span className="highlightgreen">On</span> </> ) : (isMuteBtnDisabled ? startingText : (isConnectionError ? ( <><span className="highlightred">Connection error</span> occurred</> ) : ( <> Copilot is <span className="highlightred">Off</span> </> )) )}</div>
        <div className="content-api-key-1">
          {!LOCAL_RELAY_SERVER_URL && (
            <Button
              icon={Edit}
              iconPosition="end"
              buttonStyle="flush"
              label={`\u00A0`}
              title="Reset the OpenAI API Key"
              onClick={() => resetAPIKey()}
            />
          )}
        </div>        
      </div>      
      <div className="content-main">
        <div className="content-logs">
          <div className={isHidden ? 'content-block conversation-display' : 'content-block conversation'}>
            <div className="content-block-title">
              {isConnected ? (
                <>
                  Audio Copilot Status: <span className="highlightgreen">On</span>
                </>
              ) : (
                <>
                  Audio Copilot Status: <span className="highlightred">Off</span>
                </>
              )}
            </div>
            <div className="content-block-body" data-conversation-content>
              {items.map((conversationItem, i) => {
                return (
                  <div className="conversation-item" key={conversationItem.id}>
                    <div className={`speaker ${conversationItem.role || ''}`}>
                      <div>
                        {(
                          conversationItem.role || conversationItem.type
                        ).replaceAll('_', ' ')}
                      </div>
                      <div
                        className="close"
                        onClick={() =>
                          deleteConversationItem(conversationItem.id)
                        }
                      >
                        <X />
                      </div>
                    </div>
                    <div className={`speaker-content`}>
                      {/* tool response */}
                      {conversationItem.type === 'function_call_output' && (
                        <div>{conversationItem.formatted.output}</div>
                      )}
                      {/* tool call */}
                      {!!conversationItem.formatted.tool && (
                        <div>
                          {conversationItem.formatted.tool.name}(
                          {conversationItem.formatted.tool.arguments})
                        </div>
                      )}
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'user' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              (conversationItem.formatted.audio?.length
                                ? '(awaiting transcript)'
                                : conversationItem.formatted.text ||
                                  '(item sent)')}
                          </div>
                        )}
                      {!conversationItem.formatted.tool &&
                        conversationItem.role === 'assistant' && (
                          <div>
                            {conversationItem.formatted.transcript ||
                              conversationItem.formatted.text ||
                              '(truncated)'}
                          </div>
                        )}
                      {conversationItem.formatted.file && (
                        <audio
                          src={conversationItem.formatted.file.url}
                          controls
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={isHidden ? 'video' : 'video-display'}>     
            <video ref={videoRef} width="600px" controls>
                <source src="./video/ck_interview.mp4" type="video/mp4" />
                Your browser does not support the video tag.
            </video> 
          </div>                       
          <div className="content-actions">
          <Button
              label={isHidden ? 'A/V' : 'V/A'}
              buttonStyle={'regular'}
              onClick={toggleVisibility}
            />             
          <div className='spacer' />            
          <Button
              label={isPlaying ? 'Pause' : 'Play\u00A0'}
              iconPosition={'start'}
              icon={isPlaying ? Pause : Play}
              buttonStyle={'regular'}
              onClick={
                isPlaying ? toggleAudio : toggleAudio
              }
            />            
            <div className='spacer' />
            <div style={{ width: '63%', backgroundColor: '#ccc', height: '10px', borderRadius: '10px', marginTop: '10px', marginLeft: '-32px' }}>
              <div
                style={{
                  width: `${progress}%`,
                  backgroundColor: '#007bff',
                  height: '10px',
                  borderRadius: '10px',
                }}
              />
            </div>
            <div className="spacer" />            
            <Toggle
              defaultValue={false}
              labels={['\u00A0', 'Audio Copilot']}
              values={['none', 'server_vad']}
              onChange={(_, value) => switchAudioCopilot(value)}
            />
            <Button
                label={isMuted ? '' : ''}
                iconPosition={'start'}
                icon={isMuted ? MicOff : Mic}
                disabled={!isConnected}
                buttonStyle={'regular'}
                onClick={
                  isMuted ? toggleMuteRecording : toggleMuteRecording
                }
              />                       
          </div>          
          <div className="content-block events">
            <div className="visualization">
              <div className="visualization-entry client">
                <canvas ref={clientCanvasRef} />
              </div>
              <div className="visualization-entry server">
                <canvas ref={serverCanvasRef} />
              </div>
            </div>
            <div className="network-title">Network Activities</div>
            <div className="content-block-body" ref={eventsScrollRef}>
              {!realtimeEvents.length && `Copilot awaiting turned on...`}
              {realtimeEvents.map((realtimeEvent, i) => {
                const count = realtimeEvent.count;
                const event = { ...realtimeEvent.event };
                if (event.type === 'input_audio_buffer.append') {
                  event.audio = `[trimmed: ${event.audio.length} bytes]`;
                } else if (event.type === 'response.audio.delta') {
                  event.delta = `[trimmed: ${event.delta.length} bytes]`;
                }
                return (
                  <div className="event" key={event.event_id}>
                    <div className="event-timestamp">
                      {formatTime(realtimeEvent.time)}
                    </div>
                    <div className="event-details">
                      <div
                        className="event-summary"
                        onClick={() => {
                          // toggle event details
                          const id = event.event_id;
                          const expanded = { ...expandedEvents };
                          if (expanded[id]) {
                            delete expanded[id];
                          } else {
                            expanded[id] = true;
                          }
                          setExpandedEvents(expanded);
                        }}
                      >
                        <div
                          className={`event-source ${
                            event.type === 'error'
                              ? 'error'
                              : realtimeEvent.source
                          }`}
                        >
                          {realtimeEvent.source === 'client' ? (
                            <ArrowUp />
                          ) : (
                            <ArrowDown />
                          )}
                          <span>
                            {event.type === 'error'
                              ? 'error!'
                              : realtimeEvent.source}
                          </span>
                        </div>
                        <div className="event-type">
                          {event.type}
                          {count && ` (${count})`}
                        </div>
                      </div>
                      {!!expandedEvents[event.event_id] && (
                        <div className="event-payload">
                          {JSON.stringify(event, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>          
        </div>
        <div className="divider"></div>
        <div className="content-right">
          <div className="content-block map">
            <div dangerouslySetInnerHTML={{ __html: additional_info }} />
          </div>
          <div className="content-block kv">
            <div className="content-block-title">set_memory()</div>
            <div className="content-block-body content-kv">
              {JSON.stringify(memoryKv, null, 2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
