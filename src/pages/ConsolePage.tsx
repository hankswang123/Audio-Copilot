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

import React, { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { instructions, additional_info } from '../utils/conversation_config.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Zap, Edit, Play, Pause, Mic, MicOff, Plus, Minus, ArrowLeft, ArrowRight } from 'react-feather';
import { Button } from '../components/button/Button';

import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

import './ConsolePage.scss';
import { audioCaptions, keywords } from '../utils/scripts2captions.js';
import { pdfFilePath, audioFilePath } from '../filePaths.js'; // Import the file paths
import Chat, {openai} from '../components/chat/Chat';
import PdfViewerWithIcons from '../components/pdf/PdfViewerWithIcons';
//import nodemailer from 'nodemailer';

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

  //Timer of SearchBox animation effect for Youtube Video
  let animation: NodeJS.Timeout;    

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
   * References for
   * - Chat component which will be used to display voice conversations
   */
  const chatRef = useRef(null);  

  /**
   * All of our variables for displaying application state
   * - items are all conversation items (dialog)
   * - memoryKv is for set_memory() function
   * - coords, marker are for get_weather() function
   */
  const [items, setItems] = useState<ItemType[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});

  //hanks - Implementation of audio copilot
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0); // State to control playback speed
  const [keyword, setKeyword] = useState(''); // State to store keyword
  const [isHidden, setIsHidden] = useState(true); // State to control audio/video visibility
  const [isDragging, setIsDragging] = useState(false);
  const [isProgressDragging, setIsProgressDragging] = useState(false);
  const [isSplitterDragging, setIsSplitterDragging] = useState(false);
  const [currentCaption, setCurrentCaption] = useState(''); // State to display current caption
  const [totalDuration, setTotalDuration] = useState(0); // State to store total duration
  const [currentTime, setCurrentTime] = useState(0); // State to store current play time
  const [isCaptionVisible, setIsCaptionVisible] = useState(false); // State to manage caption visibility
  const [isMuteBtnDisabled, setIsMuteBtnDisabled] = useState(false);
  const [isCloseRightPanelDisabled, setIsCloseRightPanelDisabled] = useState(true);
  const [isConnectionError, setIsConnectionError] = useState(false);
  const [startingText, setStartingText] = useState('Connecting to Copilot');
  const [dotCount, setDotCount] = useState(0);
  const progressBarRef = useRef(null);  
  const playPauseBtnRef = useRef<HTMLButtonElement>(null); // Add a ref for the play/pause button
  const muteBtnRef = useRef<HTMLButtonElement>(null); // Add a ref for the play/pause button
  const audioRef = useRef<HTMLAudioElement | null>(null);  
  const videoRef = useRef<HTMLVideoElement | null>(null);  
  const conversationDivRef = useRef<HTMLDivElement | null>(null);
  const floatingButtonRef = useRef(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  const [numPages, setNumPages] = useState<number>();
  //const [pageNumber, setPageNumber] = useState<number>(1);
  const containerRef = useRef(null); // Ref for the scrollable container
  const pageRefs = useRef<React.RefObject<HTMLDivElement>[]>([]); // Array of refs for each page
  const [scale, setScale] = useState(1); // Zoom level
  const [renderedPages, setRenderedPages] = useState([1]); // Track pages rendered in the DOM

  const timeUpdateHandlerRef = useRef<(this: HTMLAudioElement, ev: Event) => any>();
  const endedHandlerRef = useRef<(this: HTMLAudioElement, ev: Event) => any>();
  const [isLoop, setIsLoop] = useState(false);  

  // Some times isConnected could not reflect the actual connection status due to the delay of the state update
  // To solve this issue, we use a ref to store the actual connection status
  const isConnectedRef = useRef(isConnected);
  // Update the ref whenever `isConnected` changes
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  interface FormatTimeProps {
    time: number;
  }  

  interface PageRefs {
    current: Array<React.RefObject<HTMLDivElement>>;
  }

  interface GoToPageProps {
    pageNumber: number;
  }

  const goToPage = ({ pageNumber }: GoToPageProps): void => {
    if (pageRefs.current[pageNumber]){
      // Scroll the specific page into view
      pageRefs.current[pageNumber].current?.scrollIntoView({
        behavior: 'auto', // Instantly jumps to the page
        block: 'start', // Align the top of the page with the container
      });
    } else {
      alert(`Page ${pageNumber} is out of range!`);
    }
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);

    pageRefs.current = Array(numPages)
      .fill(null)
      .map((_, i) => pageRefs.current[i] || React.createRef());    
  }

  interface OnPageLoadSuccessProps {
    pageNumber: number;
  }

  const onPageLoadSuccess = ({ pageNumber }: OnPageLoadSuccessProps): void => {
    console.log(`Page ${pageNumber} loaded successfully.`);

    // Add the next page to the DOM
    setRenderedPages((prev) => {
      const nextPage = Math.min(pageNumber + 1, numPages || 0);
      return prev.includes(nextPage) ? prev : [...prev, nextPage];
    });    
  };

  const closeRightArrowNew = () => {
    closeRightPanel();

    const rightArrow = document.getElementById('openRightArrow');
    if(rightArrow){
      rightArrow.style.display = 'flex';
    }

    const closeRightArrow = document.getElementById('closeRightArrow');
    if(closeRightArrow){
      closeRightArrow.style.display = 'none';
    }    
  }

  const closeRightPanel = () => {
    setIsCloseRightPanelDisabled(true);
    const splitter = document.getElementById('splitter');
    const chatBot = document.getElementById('chatContainer');
    const rightPanel = rightRef.current;
    if(rightPanel)
    {
      splitter.style.display = 'none';
      (rightPanel as HTMLDivElement).style.display = 'none';
      chatBot.style.display = 'none';
      conversationDivRef.current.style.display = 'flex'; 

      /* isMuted = true when UI button IS NOT Muted
      if(!isMuted){
        toggleMuteRecording();
      }     */ 
    }
  }

  //Show Conversion list
  const showConversation = () => {
    setIsCloseRightPanelDisabled(false);
    const splitter = document.getElementById('splitter');
    const chatBot = document.getElementById('chatContainer');

    if((splitter as HTMLDivElement).style.display === 'flex'){
      //(splitter as HTMLDivElement).style.display = 'none';
      //rightRef.current.style.display = 'none';    
      if(conversationDivRef.current.style.display === 'none') {
        chatBot.style.display = 'none';
        conversationDivRef.current.style.display = 'flex';        
      }
    }
    else{
      (splitter as HTMLDivElement).style.display = 'flex';
      rightRef.current.style.display = 'flex';
      chatBot.style.display = 'none';
      conversationDivRef.current.style.display = 'flex';
    }    
    openRightPanel();  
  };    

  // Handle zooming of the PDF when the user clicks the '-' button
  const zoomIn = () => {
    setScale((prevScale) => Math.min(prevScale + 0.05, 3.0)); // Increase scale, max 3.0

    const container = containerRef.current as HTMLDivElement | null;
    if(container){
      
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      // Calculate new scroll position based on the scale change
      const newScrollTop = scrollTop * scale;
      const newScrollLeft = scrollLeft * scale;      

      container.scrollLeft = newScrollLeft;
      container.scrollTop  = newScrollTop;
    }
  };

  // Handle zooming of the PDF when the user clicks the '+' button  
  const zoomOut = () => {
    setScale((prevScale) => Math.max(prevScale - 0.05, 0.5)); // Decrease scale, min 0.5

    const container = containerRef.current as HTMLDivElement | null;
    if(container){
      
      const scrollTop = container.scrollTop;
      const scrollLeft = container.scrollLeft;

      // Calculate new scroll position based on the scale change
      const newScrollTop = scrollTop * scale;
      const newScrollLeft = scrollLeft * scale;      

      container.scrollLeft = newScrollLeft;
      container.scrollTop  = newScrollTop;
    }    

  };   

  // Handle text are selected, show the popup to read aloud
  let readAloudBuffer = null; // Global buffer to store the read aloud audio
  const selectionTTS = async (input: string) => { 

    if(readAloudBuffer) {
      wavStreamPlayerRef.current.add16BitPCM(readAloudBuffer);
    }else{
      const pcm = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        response_format: "pcm",
        speed: 1.0,
        input: input,
      });
      const pcmArrayBuffer = await pcm.arrayBuffer(); // Convert the response to an ArrayBuffer
      const int16Pcm = new Int16Array(pcmArrayBuffer);
      wavStreamPlayerRef.current.add16BitPCM(int16Pcm);

      chatRef.current.updateSelection(input);

      const wavFile = await WavRecorder.decode(
        int16Pcm,
        24000,
        24000
      );    
      chatRef.current.updateReadAloud(wavFile.url);

      readAloudBuffer = int16Pcm;
    }
  }

  // Test new connection to Realtime API by WebRTC
  // Refer: https://platform.openai.com/docs/guides/realtime-webrtc
  const test_webrtc = async () => {
    // Get an ephemeral key from your server - see server code below
    const tokenResponse = await fetch("http://localhost:3001/api/session");
    const data = await tokenResponse.json();
    const EPHEMERAL_KEY = data.client_secret.value;
  
    // Create a peer connection
    const pc = new RTCPeerConnection();
  
    // Set up to play remote audio from the model
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    pc.ontrack = e => audioEl.srcObject = e.streams[0];
  
    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true
    });
    pc.addTrack(ms.getTracks()[0]);
    

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    dc.addEventListener("message", (e) => {
      // Realtime server events appear here!
      console.log(e);
    });   

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
  
    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-mini-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp"
      },
    });
 
    const answer = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer as RTCSessionDescriptionInit);

    // JSON, and sending it over the data channel
    /*
    const responseCreate = {
      type: "response.create",
      response: {
        modalities: ["text"],
        instructions: "Write a haiku about code",
      },
    };
    dc.send(JSON.stringify(responseCreate));     */
  }  

  // Try to prevent zoom in/out event for the whole page
  // Status: logic not work yet
  const handleWheelZoom = (event: WheelEvent): void => {
    
    const buttonRow: HTMLDivElement | null = document.getElementById('button-row') as HTMLDivElement | null;
    if (buttonRow) {
      if(event.target === buttonRow) {return;}
    }

    if (event.ctrlKey) {
      // Prevent default zoom behavior
      if (event.target !== containerRef.current) {return;}
      event.preventDefault();
      event.stopPropagation();

      //const zoomSpeed = 0.05; // Adjust sensitivity
      // Adjust zoom level
      const newScale = scale + (event.deltaY < 0 ? 0.1 : -0.1);
      setScale(Math.max(newScale, 0.5)); // Minimum zoom level of 0.5

      if (buttonRow) {
        buttonRow.style.transform = `scale(${1 / newScale})`;
      }
    }
  };

  // Add the zoom handler with `capture` mode
  useEffect(() => {
    const container = containerRef.current as HTMLDivElement | null;

    if (container !== null) {
      if (container) {
        container.addEventListener('wheel', handleWheelZoom, { capture: true });
      }
    }

      // Prevent wheel events from affecting the window when inside the container
      const preventWindowZoom = (event: WheelEvent) => {
        if (event.ctrlKey && event.target === container) {
          event.preventDefault();
        }
      };
      window.addEventListener('wheel', preventWindowZoom, { passive: false });    

    // Cleanup the event listener on unmount
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheelZoom, { capture: true });
        window.removeEventListener('wheel', preventWindowZoom);
      }
    };
  }, [scale]);  

  //Dynamic effect of 'Copilot is turning on......' 
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
  
    if (isMuteBtnDisabled) {
      intervalId = setInterval(() => {
        setDotCount((prevCount) => (prevCount + 1) % 4); // Cycle through 0, 1, 2, 3
      }, 500);
    } else {
      //setStartingText(''); // Clear the text when not starting
      setStartingText(`Connect${'.'.repeat(dotCount)}` + '\u00A0\u00A0\u00A0'); // Clear the text when not starting
    }
  
    return () => clearInterval(intervalId); // Cleanup interval on component unmount or when isMuteBtnDisabled changes
  }, [isMuteBtnDisabled]);  

  useEffect(() => {
    if (isMuteBtnDisabled) {
      //setStartingText(`Turning on${'.'.repeat(dotCount)}`);
      //setStartingText(`Connecting${'.'.repeat(dotCount)}`);
      if (dotCount === 0) {
        setStartingText(`Connect${'.'.repeat(dotCount)}` + '\u00A0\u00A0\u00A0');
      }
      if (dotCount === 1) {
        setStartingText(`Connect${'.'.repeat(dotCount)}` + '\u00A0\u00A0');
      }
      if (dotCount === 2) {
        setStartingText(`Connect${'.'.repeat(dotCount)}` + '\u00A0');
      } 
      if (dotCount === 3) {
        setStartingText(`Connect${'.'.repeat(dotCount)}`);
      }            
    }
  }, [dotCount, isMuteBtnDisabled]);  

  // Load the audio file when the component mounts
  useEffect(() => {
    audioRef.current = new Audio(audioFilePath);

    //audioRef.current = new Audio('./audio/ngl_issue23_uk.wav');
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

  const toggleCaptionVisibility = () => {
    setIsCaptionVisible(!isCaptionVisible);
  };     

  const adjustCaptionFontSize = (adjustment: number) => { 
    const captionDisplay = document.getElementById('captionDisplay');
    if (captionDisplay && captionDisplay.parentElement) {

      const currentFontSize = window.getComputedStyle(captionDisplay).fontSize;
      const parentFontSize = window.getComputedStyle(captionDisplay.parentElement).fontSize;
      const baseFontSize = parseFloat(parentFontSize); // Get the base font size of the parent element
      const currentFontSizeInEm = parseFloat(currentFontSize) / baseFontSize; // Convert px to em based on parent font size
      const newFontSizeInEm = (currentFontSizeInEm + adjustment) > 3 ? 3 : ((currentFontSizeInEm + adjustment) < 1 ? 1 : (currentFontSizeInEm + adjustment)) ; // Adjust the font size
      captionDisplay.style.fontSize = `${newFontSizeInEm}em`;                  
    }      
  }

  const formatDuration = ({ time }: FormatTimeProps): string => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    return hours > 0
      ? `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`
      : `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  interface SpeedControlClickEvent extends React.MouseEvent<HTMLDivElement> {
    stopPropagation: () => void;
  }

  const handleSpeedControlClick = (event: SpeedControlClickEvent, speed: number): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setPlaybackRate(speed);
    console.log(`Speed set to ${speed}`);
  };  
  
  const handleLoopClick = (event: SpeedControlClickEvent): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setIsLoop(!isLoop);
  };    

  const createHandleTimeUpdate = (audioElement: HTMLAudioElement, currentTime: number, endTime: number) => {
    return () => {

     /* if(!isLoop) {
        if (timeUpdateHandlerRef.current) {
          audioElement.removeEventListener('timeupdate', timeUpdateHandlerRef.current);
        }          
      }  */    
      
      if (audioElement.currentTime >= endTime) {
        audioElement.currentTime = currentTime; // Reset to start time
        audioElement.play();
      }
    };
  };
  
  const createHandleEnded = (audioElement: HTMLAudioElement, currentTime: number, endTime: number) => {
    return () => {

      /*if(!isLoop) {
        if (endedHandlerRef.current) {
          audioElement.removeEventListener('ended', endedHandlerRef.current);
        }          
      }    */  

      if (audioElement.currentTime < endTime) {
        audioElement.currentTime = currentTime;
        audioElement.play();

      }
    };
  };  

  const loopKeywordPlay = (event: SpeedControlClickEvent, keyword: string, currentTime: number, endTime: number, page: number) => {

    setKeyword(keyword);
    if (audioRef.current) {

      // Remove any existing event listeners to prevent multiple registrations
      if (timeUpdateHandlerRef.current) {
        audioRef.current.removeEventListener('timeupdate', timeUpdateHandlerRef.current);
      }
      if (endedHandlerRef.current) {
        audioRef.current.removeEventListener('ended', endedHandlerRef.current);
      }      

      goToPage({ pageNumber: page });
      const pdfViewer = document.getElementById("pdfFile");
      if (pdfViewer) {
        (pdfViewer as HTMLObjectElement).data = pdfFilePath + `?t=` + (new Date()).getTime() + `#page=` + page;//&t=${new Date().getTime()}
        console.log((pdfViewer as HTMLObjectElement).data);
      }          

      audioRef.current.currentTime = currentTime;

      if(!isPlaying){
        if (playPauseBtnRef.current) {
          playPauseBtnRef.current.click(); // Trigger the button click event
        }
      }

      //audioRef.current.play(); 
/*
      const handleTimeUpdate = () => {
        if (audioRef.current && audioRef.current.currentTime >= endTime) {
          audioRef.current.currentTime = currentTime; // Reset to start time
          audioRef.current.play();
        }
      };
  
      const handleEnded = () => {
        if (audioRef.current && audioRef.current.currentTime < endTime) {
          audioRef.current.currentTime = currentTime;
          audioRef.current.play();
        }
      }; 

      audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
      audioRef.current.removeEventListener('ended', handleEnded);           
      
      audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
      audioRef.current.addEventListener('ended', handleEnded);      
  
      // Clean up event listeners when the audio is paused or stopped
      audioRef.current.onpause = () => {
        if (audioRef.current) {
          audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
          audioRef.current.removeEventListener('ended', handleEnded);      
        }
      };*/
      //if(isLoop) {
        const handleTimeUpdate = createHandleTimeUpdate(audioRef.current, currentTime, endTime);
        const handleEnded = createHandleEnded(audioRef.current, currentTime, endTime);

        // Store event handlers in refs
        timeUpdateHandlerRef.current = handleTimeUpdate;
        endedHandlerRef.current = handleEnded;      

        // Remove any existing event listeners to prevent multiple registrations
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
        audioRef.current.removeEventListener('ended', handleEnded);
    
        audioRef.current.addEventListener('timeupdate', handleTimeUpdate);
        console.log('timeupdate event listener registered');
    
        audioRef.current.addEventListener('ended', handleEnded);
        console.log('ended event listener registered');
    
        // Clean up event listeners when the audio is paused or stopped
        audioRef.current.onpause = () => {
          if (audioRef.current) {
            audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
            audioRef.current.removeEventListener('ended', handleEnded);
            console.log('event listeners removed');
          }
        };
      //}            
    }    

  }
  
  const handleKeywordClick = (event: SpeedControlClickEvent, keyword: string, currentTime: number, endTime: number, page: number): void => {
    event.stopPropagation(); // Prevent the event from bubbling up to the progress bar

    setKeyword(keyword);
    if (audioRef.current) {
      audioRef.current.currentTime = currentTime;

      goToPage({ pageNumber: page });
      const pdfViewer = document.getElementById("pdfFile");
      if (pdfViewer) {
        (pdfViewer as HTMLObjectElement).data = pdfFilePath + `?t=` + (new Date()).getTime() + `#page=` + page;//&t=${new Date().getTime()}
        console.log((pdfViewer as HTMLObjectElement).data);
      }
    }
  };    

  //Update the progress bar and current time when the audio is playing
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentTime(audio.currentTime);
      }
    };

    interface Caption {
      text: string;
      time: number;
    }

    interface WordTiming {
      word: string;
      startTime: number;
      endTime: number;
    }

    const splitCaptionIntoWords = (caption: Caption, nextCaptionTime?: number): WordTiming[] => {
      const words = caption.text.split(' ');
      //const words = caption.text.split(/(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\w)\s/); // Preserve phrases

      // Calculate duration based on the next caption or assume a default duration
      const duration = nextCaptionTime ? nextCaptionTime - caption.time : 2; // Assume 2 seconds for the last caption
      const wordDuration = duration / words.length; // Evenly distribute word timing

      return words.map((word, index) => ({
      word,
      startTime: caption.time + index * wordDuration,
      endTime: caption.time + (index + 1) * wordDuration,
      }));
    };
    
    const updateCaption = () => {
      const currentTime = audio.currentTime;

      // Find the current caption
      const currentCaptionIndex = audioCaptions.findIndex((caption, index) => {
        const nextCaption = audioCaptions[index + 1];
        return currentTime >= caption.time && (!nextCaption || currentTime < nextCaption.time);
      });
    
      if (currentCaptionIndex !== -1) {
        const currentCaption = audioCaptions[currentCaptionIndex];
        const nextCaption = audioCaptions[currentCaptionIndex + 1];
        const wordsWithTiming = splitCaptionIntoWords(currentCaption, nextCaption?.time);
    
        // Find the active word
        const currentWord = wordsWithTiming.find(
          (word, index) =>
            currentTime >= word.startTime && currentTime < word.endTime ||
            (index === 0 && currentTime < word.endTime) // Special case for the first word
        );
    
        if (currentWord) {
          // Highlight the active word
          const highlightedCaption = wordsWithTiming
            .map((word) =>
              word === currentWord
                ? ` <span style="border-radius: 4px; color: #00FFFF; display: inline-block; margin: 0 1px;">${word.word}</span> `
                : ` <span style="display: inline; margin: 0 1px;">${word.word}</span> `
            )
            .join(' ');
    
          setCurrentCaption(highlightedCaption); // Update the UI
        }
      }
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

  const handleSplitterMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setIsSplitterDragging(true);
    resizePanel(e.nativeEvent);       
  };  

  const resizePanel = (e: MouseEvent | React.MouseEvent<HTMLDivElement>) => {
    const rightPanel = rightRef.current;
    const tempWidth = window.innerWidth - e.clientX - 12;
    const newrightWidth = tempWidth > 700 ? 700 : tempWidth < 400 ? 400 : tempWidth;    
    if(rightPanel)
    {
      (rightPanel as HTMLDivElement).style.width = `${newrightWidth}px`;
    }

    const closeRightArrow = document.getElementById('closeRightArrow');
    if(closeRightArrow){
      const newCloseRightArrowRight = newrightWidth + 15;
      closeRightArrow.style.right = `${newCloseRightArrowRight}px`;
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

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true);
      setIsProgressDragging(true);
      updateProgress(e.nativeEvent);

      if (audioRef.current) {
        if (timeUpdateHandlerRef.current) {
          audioRef.current.removeEventListener('timeupdate', timeUpdateHandlerRef.current);
        }
        if (endedHandlerRef.current) {
          audioRef.current.removeEventListener('ended', endedHandlerRef.current);
        }     
      }      

    };

  const handleMouseMove = (e: MouseEvent) => {

    const buttonRowTop = document.getElementById('.button-row-top');
    if ( buttonRowTop && e.clientY < 50) { // Adjust the value as needed
      buttonRowTop.style.display = 'flex';
    }    

    if (isDragging) {
      if (isProgressDragging) {
        updateProgress(e);
      }
      if (isSplitterDragging) {
        resizePanel(e);
      }
    }   
  };

  const handleMouseUp = (e: MouseEvent) => {
    setIsDragging(false);
    setIsProgressDragging(false);
    setIsSplitterDragging(false);

    const selectedText = window.getSelection().toString().trim();
  
    // If no text is selected, remove the popup    
    if (!selectedText) {
      if (e.target !== currentPopup && currentPopup) {
        currentPopup.remove();
        currentPopup = null;
        clearTimeout(popupTimeout);
      }
      return; // Exit early since no action is needed
    }

    if (selectedText && isConnectedRef.current) {
      showPopup(e.clientX, e.clientY, selectedText);
    }   

  };

  let popupTimeout = null; // Global timeout variable to track dismissal
  let currentPopup = null; // To keep track of the current popup  

  const showPopup = (x, y, text) => {
  // Clear previous popup and timeout if it exists
  if (currentPopup) {
    currentPopup.remove();
    clearTimeout(popupTimeout);
    readAloudBuffer = null; // Clear the buffer
  }

    const popup = document.createElement('div');
    popup.id = 'readAloudPopup';
    //popup.className = 'read-aloud-popup';
    popup.textContent = 'Read Aloud';
    popup.style.position = 'absolute';
    popup.style.left = `${x + 10}px`; // Adjust position as needed
    popup.style.top = `${y + 10}px`; // Adjust position as needed
    popup.style.backgroundColor = '#fff';
    popup.style.border = '1px solid #000';
    popup.style.borderRadius = '4px';
    popup.style.padding = '5px';
    popup.style.cursor = 'pointer';
    popup.onclick = () => selectionTTS(text);
  
  // Attach mouse leave event to manage timeout
    popup.onmouseleave = () => {
      popupTimeout = setTimeout(() => {
        popup.remove();
        currentPopup = null; // Reset the current popup
        readAloudBuffer = null; // Clear the buffer
      }, 1000); // 3-second delay
    };

  // Clear the timeout if the mouse re-enters
    popup.onmouseenter = () => {
      clearTimeout(popupTimeout);
    };    

    document.body.appendChild(popup);
    currentPopup = popup;
    readAloudBuffer = null; // Clear the buffer
  }

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

  /**
   * Converts a standard YouTube video URL to an embeddable URL.
   * @param {string} url - The original YouTube video URL.
   * @returns {string | null} - The embeddable YouTube URL or null if invalid.
   */
  function convertToEmbedUrl(url: string): string | null {
    // Regular expression to extract the video ID from the URL
    const videoIdMatch = url.match(/(?:youtube\.com\/.*v=|youtu\.be\/)([^&]+)/);
    
    // Check if a video ID was found
    if (videoIdMatch && videoIdMatch[1]) {
      const videoId = videoIdMatch[1];
      // Construct and return the embed URL
      return `https://www.youtube.com/embed/${videoId}`;
    } else {
      // Return null if the URL is not a valid YouTube video URL
      return null;
    }
  }    

  //Display the Video Popup
  useEffect(() => {
    const closeButton = document.getElementById('closePopup');
    const popupOverlay = document.getElementById('popupOverlay');
    const videoFrame = document.getElementById('videoFrame');  
    const searchBox = document.getElementById('searchBox');  

    if( closeButton && popupOverlay && videoFrame && searchBox) { 
    // Close the popup and stop the video
      closeButton.addEventListener('click', () => {
        (videoFrame as HTMLIFrameElement).src = '';
        popupOverlay.style.display = 'none';

        (searchBox as HTMLInputElement).value = ''; // Clear the search box
      });
    }    

    return () => {
      //closeButton.removeEventListener('mouseup', handleMouseUp);
    };       

  }, []);      

  // Keydown event handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {

      const searchBox = document.getElementById('searchBox');        
      const chatInputBox = document.getElementById('chatInputBox');    
      
      if (e.code === 'Space') {
        //if (e.target !== searchBox || e.target !== chatInputBox) {
          if (e.target !== chatInputBox) {
          e.preventDefault(); // Prevent default space bar action (scrolling)
          if (playPauseBtnRef.current) {
            playPauseBtnRef.current.click(); // Trigger the button click event
          }      
        }  
      } else if (e.code === 'Escape') {

        //closeRightPanel();
        closeRightArrowNew();

        // Close the popup when pressing the Escape key
        const popupOverlay = document.getElementById('popupOverlay');
        if (popupOverlay) {
          const videoFrame = document.getElementById('videoFrame');
          if (videoFrame) {
            (videoFrame as HTMLIFrameElement).src = '';
          }
          popupOverlay.style.display = 'none';

          (searchBox as HTMLInputElement).value = ''; // Clear the search box

        }
      }else if (e.code === 'Enter') { 
        // When Enter is hit in the search box, search for the video       
        if (e.target === searchBox) {
          e.preventDefault();

          const searchValue = (searchBox as HTMLInputElement).value.trim();
          if (searchValue !== '') {
              if (searchBox) {
                searchBox.blur();                
                setTimerforSearchBox(searchValue);
                /*
                if(isPlaying){
                  if (playPauseBtnRef.current) {
                    playPauseBtnRef.current.click(); // Trigger the button click event
                  }  
                }*/
              }
              showVideofromYoutube(searchValue);
            }
          }        
        }       
      };
  
    document.addEventListener('keydown', handleKeyDown);
  
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const setTimerforSearchBox = (searchValue: string) => {
    const searchBox = document.getElementById('searchBox');

    let count = 0;
    const maxDots = 3;
    const interval = 250; // Time in ms between updates
    animation = setInterval(() => {
        count = (count + 1) % (maxDots + 1); // Cycle between 0, 1, 2, 3
        (searchBox as HTMLInputElement).value = searchValue + ".".repeat(count);
    }, interval);       
  }

  const clearTimerforSearchBox = (info: string) => {
    const searchBox = document.getElementById('searchBox');

    if (animation) {
      clearInterval(animation); // Stop the animation
      if (searchBox) {
        (searchBox as HTMLInputElement).style.color = 'red'; // Reset the color
        (searchBox as HTMLInputElement).value = info; // Clear the search box
      }
    }    
  }

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

  // Handle function calls from the Chatbot
  // e.g. get_news, get_video, etc.
  const functionCallHandlerForChat = async (call): Promise<string> => {   
    const args = JSON.parse(call.function.arguments);
    if (call?.function?.name === "get_video") {     
      return performYoutubeSearch(args.query)
      .then((results) => {
        if (results.length > 0) {
          // Access the first result
          const firstResult = results[0];
          
          // Convert to embeddable URL
          const embedUrl = convertToEmbedUrl(firstResult.url);
          
          if (embedUrl) {
            // Assistant message of Chat will render the youtube video in iframe
            return `<iframe width="100%" height="68%" src="${embedUrl}" style={{ borderRadius: '9px'}} allowfullscreen></iframe>`;
          } else {
            return 'Failed to convert to embeddable URL.';
          }
        } else {
          return 'No results found.';
        }
      })
      .catch((error) => {
        return 'Error occurred during YouTube search';
      });           
    } 
    return '';
  };

  /*
   * Utility for search Videos by Youtube by addTool
   * it will be called back from Realtime API and a popup will be displayed
   */
  const showVideofromYoutube = async (query: string) => {

    const searchBox = document.getElementById('searchBox');
    const popupOverlay = document.getElementById('popupOverlay');
    const videoFrame = document.getElementById('videoFrame');
    const popupContent = document.getElementById('popupContent');
    const chatBot = document.getElementById('chatBot');
   
    performYoutubeSearch(query)
    .then((results) => {
      if (results.length > 0) {
        // Access the first result
        const firstResult = results[0];
        console.log(`Title: ${firstResult.title}`);
        console.log(`Original URL: ${firstResult.url}`);
        
        // Convert to embeddable URL
        const embedUrl = convertToEmbedUrl(firstResult.url);
        
        if (embedUrl) {
          console.log(`Embeddable URL: ${embedUrl}`);
          (videoFrame as HTMLIFrameElement).src = embedUrl;
          (videoFrame as HTMLIFrameElement).style.display = 'flex';
          (chatBot as HTMLIFrameElement).style.display = 'none';
          (popupContent as HTMLIFrameElement).className = 'popup-content-video';
          if (popupOverlay){
            popupOverlay.style.display = 'flex';
            clearTimerforSearchBox(query);
            (searchBox as HTMLInputElement).style.color = 'blue'; // Reset the color

            //insert the video searched into the conversation list
            chatRef.current.updateVideo(`<iframe width="100%" height="68%" src="${embedUrl}" style={{ borderRadius: '9px'}} allowfullscreen></iframe>`);
            //return `<iframe width="100%" height="68%" src="${embedUrl}" style={{ borderRadius: '9px'}} allowfullscreen></iframe>`;
          }
        } else {
          //clearTimerforSearchBox('Failed to convert to embeddable URL.');
          clearTimerforSearchBox('Error occurred during video search.');
          console.log('Failed to convert to embeddable URL.');
        }
      } else {
        clearTimerforSearchBox('No results found.');
        console.log('No results found.');
      }
    })
    .catch((error) => {
      clearTimerforSearchBox('Error occurred during YouTube search');
      console.error('Error occurred during YouTube search:', error);
    });                    
  }
  
  /**
   * Utility for search Videos from Youtube by SERP_API
   */
  async function performYoutubeSearch(query: string): Promise<Array<{ title: string, url: string }>> {
    try {
      const response: Response = await fetch(`http://localhost:3001/api/videos?q=${encodeURIComponent(query)}`);

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
      console.error('Error in performYoutubeSearch:', error);
      return [
        {
          title: '',
          url: ''
        }
      ];
    }
  }    

  const scrollToBottom = (element: HTMLElement) => {
    element.scrollTop = element.scrollHeight;
  };  

  const openRightPanel = () => {
    //openChatbot();

    const rightArrow = document.getElementById('openRightArrow');
    if(rightArrow){
      rightArrow.style.display = 'none';
    }

    const closeRightArrow = document.getElementById('closeRightArrow');
    const rightPanel = rightRef.current;
    if(closeRightArrow){
      closeRightArrow.style.display = 'flex';

      const computedStyle = getComputedStyle(rightPanel);
      const rightPanelWidth = computedStyle.width;      

      const newCloseRightArrowRight = parseInt(rightPanelWidth, 10) + 15;
      closeRightArrow.style.right = `${newCloseRightArrowRight}px`;
    }        

  }

  const openChatbot = () => {
    setIsCloseRightPanelDisabled(false);

    const splitter = document.getElementById('splitter');
    const chatBot = document.getElementById('chatContainer');

    if((splitter as HTMLDivElement).style.display === 'flex'){   
      if(chatBot.style.display === 'none') {
        chatBot.style.display = 'flex';
        conversationDivRef.current.style.display = 'none';        
      }
    }
    else{
      (splitter as HTMLDivElement).style.display = 'flex';
      rightRef.current.style.display = 'flex';
      chatBot.style.display = 'flex';
      conversationDivRef.current.style.display = 'none';
    }

    scrollToBottom(rightRef.current);
    rightRef.current.scrollIntoView({ behavior: 'smooth' });

    openRightPanel();    
/*
    if(!isMuted){
      toggleMuteRecording();
    }*/
  }

  const toggleMuteRecording = async () => {
    if (wavRecorderRef.current && clientRef.current) {
      if (isMuted) {
        await unmuteRecording();

        const client = clientRef.current;
        if (client.isConnected()){
          //showConversation();
          openChatbot();
        }         

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
      //for test, to trigger start of conversation
      /*      
      client.sendUserMessageContent([
        {
          type: `input_text`,
          text: `Hello!`,
          // text: `For testing purposes, I want you to list ten car brands. Number each item, e.g. "one (or whatever number you are one): the item name".`
        },
      ]);     */
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
    setItems(client.conversation.getItems());
    setItems(items);
    await chatRef.current.updateItems(client.conversation.getItems());


    try{
      setIsConnectionError(false);
      // Connect to realtime API
  
      const apiKey = LOCAL_RELAY_SERVER_URL
        ? ''
        : localStorage.getItem('tmp::voice_api_key') ||
          prompt('OpenAI API Key') ||
          '';
      if(LOCAL_RELAY_SERVER_URL !== '') {
          await client.connect();
      } else if (apiKey !== '') {
        localStorage.setItem('tmp::voice_api_key', apiKey);

        client.realtime.apiKey = apiKey;        
        //await client.connect();        
        /*  To use the latest model: 'gpt-4o-realtime-preview-2024-12-17' 
                                  or 'gpt-4o-mini-realtime-preview-2024-12-17'
            with lower cost, call the inside logic of client.connect() directly */
        //And also avoid touching codes of RealtimeClient.connect() and RealtimeAPI.connect()
        if (client.isConnected()) {
          throw new Error(`Already connected, use .disconnect() first`);
        }
        //await client.realtime.connect({ model: 'gpt-4o-realtime-preview-2024-12-17' });
        await client.realtime.connect({ model: 'gpt-4o-mini-realtime-preview-2024-12-17' });
        client.updateSession();      
        /* End of inside logic client.connect() */

      } else {
        setIsMuteBtnDisabled(false);        
      }

    } catch (error) {
      setIsMuted(true);
      setIsMuteBtnDisabled(false);
      setIsConnectionError(true);
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

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();   

  }, []);

  /** Test for capturing audio from other apps
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

    // Add tools - Functions(Calling) that can be called by the client
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
    // hanks - Capabilities of Aduio Copilot
    client.addTool(
      { //Capabilities demo: when a listener wants to ask for a google search
        name: 'youtube_search',
        description:
          'Performs a Youtube video search and returns the top 1 results.',
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

        const searchBox = document.getElementById('searchBox');  
        if (searchBox) {
          (searchBox as HTMLInputElement).value = query; // Clear the search box

          let count = 0;
          const maxDots = 3;
          const interval = 250; // Time in ms between updates
          animation = setInterval(() => {
              count = (count + 1) % (maxDots + 1); // Cycle between 0, 1, 2, 3
              (searchBox as HTMLInputElement).value = query + ".".repeat(count);
          }, interval);            

        }        

        await showVideofromYoutube(query);

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
        //This helps listeners to consume the audio in the local language
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
      { //When a listener wants to learn or explore the content of the audio by the keyword
        name: 'learn_by_keyword',
        description:
          'learn the content of the audio by the keyword',
        parameters: {
          type: 'object',
          properties: {
            keyword: {
              type: 'string',
              description: 'topic keyword to learn/explore',
            },
          },          
        },
      },
      async ({ keyword }: { [key: string]: any }) => {       
        if( keyword in keywords) {
          const range = keywords[keyword as keyof typeof keywords];
          return [range[0], range[1]];
        } else {
          return { ok: false, info: 'No such a keyword' };
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
      { //Capabilities demo: when a listener wants to send a mail to a friend
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

      // Pass the latest items to the chat component
      // This will trigger a re-render of the chat component,e.g transcript will be updated
      // audio stream will be decoded and replayed in the chat lis
      await chatRef.current.updateItems(items);
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
    client.realtime.on('server.conversation.item.created', async (event) => {
      const { item, delta } = client.conversation.processEvent(event);
      await chatRef.current.updateItems(client.conversation.getItems());

      // insert one audio message to the chat list
      await chatRef.current.updateItemID(item.id); 
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

      setIsConnected(true);
    });      
    // hanks

    setItems(client.conversation.getItems());
    chatRef.current.updateItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  interface DragEvent extends React.MouseEvent<HTMLDivElement> {
    clientX: number;
    clientY: number;
  }

  interface FloatingButtonElement extends HTMLDivElement {
    dragOffsetX: number;
    dragOffsetY: number;
  }

  const handleDragStart = (e: DragEvent): void => {
    const button = floatingButtonRef.current;
    if (button) {
      const rect = (button as FloatingButtonElement).getBoundingClientRect();
      (button as FloatingButtonElement).dragOffsetX = e.clientX - rect.left;
      (button as FloatingButtonElement).dragOffsetY = e.clientY - rect.top;
    }
  };

  interface DragEvent extends React.MouseEvent<HTMLDivElement> {
    clientX: number;
    clientY: number;
  }

  interface FloatingButtonElement extends HTMLDivElement {
    dragOffsetX: number;
    dragOffsetY: number;
  }

  const handleDrag = (e: DragEvent): void => {
    if (e.clientX === 0 && e.clientY === 0) return; // Ignore invalid drag events
    const button = floatingButtonRef.current as FloatingButtonElement | null;
    if (button) {
      button.style.left = `${e.clientX - button.dragOffsetX}px`;
      button.style.top = `${e.clientY - button.dragOffsetY}px`;
    }
  };

/**
   * Disconnect and reset conversation state
   */
const disconnectConversation = useCallback(async () => {
  setIsConnected(false);
  setRealtimeEvents([]);
  setItems([]);
  await chatRef.current.updateItems([]);
  setMemoryKv({});

  const client = clientRef.current;
  client.disconnect();

  const wavRecorder = wavRecorderRef.current;
  await wavRecorder.end();

  const wavStreamPlayer = wavStreamPlayerRef.current;
  await wavStreamPlayer.interrupt();

  setIsMuteBtnDisabled(false);
  setIsMuted(true);
}, []);  

/**
 * Disconnect and reset conversation state
 */
const disConnnectRealtimeAPI = async () => {
  disconnectConversation();
  closeRightArrowNew();
}

/**
 * Connect and start conversation/Chatbot
 */
const connnectRealtimeAPI = async () => {
  if(muteBtnRef.current) {
    muteBtnRef.current.click(); // Trigger the button click event   
  }      
};  

//Test for variable evaluation in template string dynamically
let audioUrl = "";
let transcript = "";
const getMarkdownContent = () => `
${transcript}  
<audio src="${audioUrl}" controls></audio>
`; 


  /**
   * Render the application
   */
  return (
    <div data-component="ConsolePage">
      
      {/* Popup Layer for display the video from youtube search or AI Chatbot  */}      
      <div id="popupOverlay" className="popup-overlay">
        <div id="popupContent" className="popup-content-chat">
          <span id="closePopup" className="close-button"><X /></span>
          <iframe id="videoFrame" width="1000" height="562.5" src="" allow="fullscreen" allowFullScreen style={{display: 'none'}}></iframe>
          <iframe id="chatBot" width="100%" height="100%" src="http://localhost:4000/examples/audio-copilot" allow="fullscreen" allowFullScreen style={{display: 'none', borderRadius: '9px'}}></iframe> 
        </div>
      </div>

      {/* Test Floating button */}
      { (items.length < 0) && (!isCaptionVisible) &&
        <div className="floating-button" ref={floatingButtonRef}  
             onMouseDown={handleDragStart}
             onMouseMove={handleDrag}
        >
          <Button
            style={{ height: '10px'}}
            label={'Conversation List'}
            buttonStyle={'flush'}
            onClick={showConversation}
            className='button'
          />
        </div>}    

      {/* Top buttons in row to control PDF operation */}
      <div className="top-hover-area">
      <div id='button-row-top' className='button-row-top'>
        <Button
          style={{height: '10px'}}
          label={''}
          icon={Plus}
          buttonStyle={'flush'}
          onClick={zoomIn}
          className='button'
        />
        <Button
          style={{height: '10px'}}
          label={''}
          icon={Minus}
          buttonStyle={'flush'}
          onClick={zoomOut}
          className='button'
        />     
        <Button
          style={{height: '10px'}}
          label={'WebRTC Test'}
          onClick={test_webrtc}
        />
        <div className="right-buttons">
          {/*<div style={{ fontSize: '1em' }}>{isConnected ? ( <> Copilot: <span className="highlightgreen">On</span> </> ) : (isMuteBtnDisabled ? startingText : (isConnectionError ? ( <><span className="highlightred">Error Occurred!</span></> ) : ( <> Copilot: <span className="highlightred">Off</span> </> )) )}</div> */}
          <div>
            <Button
                label={isConnected ? 'Disconnect' : (isMuteBtnDisabled ? startingText : 'Connect\u00A0\u00A0\u00A0' ) }
                iconPosition={isConnected ? 'end' : 'start'}
                icon={isConnected ? X : Zap}
                //buttonStyle={isConnected ? 'regular' : 'action'}
                disabled={isMuteBtnDisabled}
                onClick={ isConnected ? disConnnectRealtimeAPI : connnectRealtimeAPI }
              />    
          </div>                        
          <div className="content-api-key">
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
      </div>
      </div>

      <div className="content-main" ref={leftRef}>

        {/* Left Area to display PDF Magzine */}
        {/*First div is to control display the scrollbar*/}
        <div style={{
          display: 'none', 
        }}>
          <PdfViewerWithIcons
            pdfFilePath={pdfFilePath} // Path to the PDF file
          />
        </div>         
        <div style={{
          display: 'flex',        // Enable flexbox
          //display: 'none',        // Enable flexbox
          margin: '0 auto',       // Center horizontally
          //marginTop: '2.5em', 
          width: '100%',           // Adjust the width as needed
          overflowY: 'auto',      // Enable scrolling
          scrollbarWidth: 'auto',
          top: '400px', 
        }}>
          <div ref={containerRef}  // Attach zoom handler to this container only
                    style={{       
                      margin: '0 auto',       // Center horizontally
                      width: '100%',           // Adjust the width as needed
                      overflowY: 'auto',      // Enable scrolling
                      scrollbarWidth: 'none', // Hide scrollbar 
                      top: '400px',               // Top of the viewport
                      backgroundColor: 'white', // Optional: background color
                      transform: `scale(${scale})`, // Apply CSS transform for zooming
                      transformOrigin: 'top center', // Set the origin for the transform                    
                }}>
            <Document file={pdfFilePath} onLoadSuccess={onDocumentLoadSuccess}>

              {renderedPages.map((pageNumber) => (
                    <div
                    ref={pageRefs.current[pageNumber]}
                    key={`page_${pageNumber + 1}`}
                    style={{
                      marginBottom: '10px',
                      flexShrink: 0, // Prevent shrinking
                      margin: '20px auto', // Center the page horizontally
                      width: 'fit-content', // Shrink wrapper to fit content width                    
                    
                    }}
                  >            
                <Page
                  key={`page_${pageNumber}`}
                  pageNumber={pageNumber}
                  renderTextLayer={true} 
                  renderAnnotationLayer={false}               
                  onLoadSuccess={() => onPageLoadSuccess({ pageNumber })} // Incrementally add pages
                  loading={<p>Loading page {pageNumber}...</p>} // Page loading indicator
                />
                </div>
              ))}

            </Document>
          </div> 
        </div>

        {/* Splitter Area */}
        {/* Open(Left Arrow<-) or Close((Right Arrow->)) Right Panel */}
        <div className="tooltip-container">
        <div id="openRightArrow" className="close-icon-right" onClick={openChatbot} style={{display: (isConnected? "flex": "none")}}><ArrowLeft style={{ width: '15px', height: '15px' }} /></div>
        <div className="tooltip"><span><strong className='tooltip-title'>Open Chatbot</strong></span></div></div>
        <div id="closeRightArrow" className="close-icon-left" onClick={closeRightArrowNew} style={{display: "none"}}><ArrowRight style={{ width: '15px', height: '15px' }} /></div>
        <div id="splitter" className="splitter" onMouseDown={handleSplitterMouseDown} style={{display: "none"}}></div>

        {/* Right Area: show the chatbot and conversation list on the right side panel */}
        <div className="content-right" ref={rightRef} style={{display: "none"}}>
          <div id="chatContainer" style={{display: "none"}}><Chat functionCallHandler={functionCallHandlerForChat} ref={chatRef} /></div>

          <div className="content-main" ref={conversationDivRef} style={{display: "none"}}>
                <div className="content-logs">
                  <div className="content-block conversation">
                    {/*<div className="content-block-title">Conversation List</div>*/}
                    <div className="content-block-body" data-conversation-content>
                      {/*{!items.length && `awaiting connection...`}*/}
                      {!items.length && `Conversation List`}
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
                              {conversationItem.formatted.file && (() => {
                                  console.log("Audio URL:", conversationItem.formatted.file.url); 
                                  //console.log("Audio:", conversationItem.status);
                                  return (
                                    <audio
                                      src={conversationItem.formatted.file.url}
                                      controls
                                    />
                                  );
                                })()
                              }
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
          </div>
        </div>
      </div>

      {/* Bottom toolbar area to display different buttons, captions, progress bar, mute/unmute button */}
      <div id='button-row' className='button-row'>
        {/* Adjust the caption font size if it is visible */}
        {isCaptionVisible && ( 
          <div>
            <div className="captionFont" style={{cursor:'pointer'}} onClick={() => {adjustCaptionFontSize(+0.1)}}>+</div>
            <div className="captionFont" style={{cursor:'pointer'}} onClick={() => {adjustCaptionFontSize(-0.1)}}>-</div>            
          </div> )
        }

        {/* Add a div to display the current caption */}
        {isCaptionVisible && ( 
          <div id='captionDisplay' className="caption-display"
              dangerouslySetInnerHTML={{ __html: currentCaption }}
              style={{ fontSize: '2em', marginTop: '20px' }}
          ></div> )
        } 
        <div className="content-caption">
          <Button
                    label={isCaptionVisible ? 'Hide Captions' : 'Show Captions'}
                    buttonStyle={'regular'}
                    onClick={toggleCaptionVisibility}
                    className='button'
                  />           
        </div>

        {/* This hidden button is to receive space bar down event to play/pause the audio */}
        <button ref={playPauseBtnRef} onClick={toggleAudio} className='hidden-button'></button>
        <div className="tooltip-container">
          <Button
                  label={isPlaying ? 'Pause' : 'Play\u00A0'}
                  iconPosition={'start'}
                  icon={isPlaying ? Pause : Play}
                  buttonStyle={'regular'}
                  onClick={toggleAudio}
                  className='button'
          />
          <div className="tooltip">
            <span>Press Space(空格键) to <> {isPlaying ? 'Pause' : 'Play'} </> the on-going Audio</span><br />
          </div>             
        </div>

        {/* Progress bar area */}
        <div 
          ref={progressBarRef}
          style={{position: 'relative', width: '60%', backgroundColor: '#ccc', height: '0.625em', borderRadius: '0.3125em', marginTop: '0.2em', marginLeft: '-1px' }}
          onMouseDown={handleMouseDown}>
          <div style={{ 
                        width: `${progress}%`,
                        backgroundColor: '#007bff',
                        height: '0.625em',
                        borderRadius: '0.3125em' }}
          />
          {/* Three Speed control Options at the left-down of progress area */}
          <div className="speed-controls" onMouseDown={(e) => {
                                                                e.stopPropagation(); // Prevent event from reaching the progress bar
                                                              }}>
            <div className="speed-control" style={{ 
              backgroundColor: playbackRate === 0.85 ? '#666' : '#ccc', // Darker if active
              color: playbackRate === 0.85 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}  onClick={(e) => handleSpeedControlClick(e, 0.85)}>Slower</div>
            <div className="speed-control"         style={{
              backgroundColor: playbackRate === 1.0 ? '#666' : '#ccc', // Darker if active
              color: playbackRate === 1.0 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleSpeedControlClick(e, 1.0)}>Normal</div>
            <div className="speed-control"         style={{
              backgroundColor: playbackRate === 1.2 ? '#666' : '#ccc', // Darker if active
              color: playbackRate === 1.2 ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleSpeedControlClick(e, 1.2)}>Faster</div>  
            <div></div>
            <div className="speed-control"         style={{
              display: 'none',
              backgroundColor: isLoop === true ? '#666' : '#ccc', // Darker if active
              color: isLoop === true ? '#fff' : '#000', // Adjust text color for contrast
              borderRadius: '0.3125em',
            }}    onClick={(e) => handleLoopClick(e)}>Loop</div>  
            <div className="spacer" />           
            <div>Keywords:</div>
            {/* Click keyword to go to specific page and seek the current time */}
            {Object.entries(keywords).map(([key, [value1, value2, value3]], index) => (
              <div
                key={index} // Use index as the key for React
                className="keyword"
                style={{
                  backgroundColor: keyword === key ? '#666' : '#ccc', // Darker if active
                  color: keyword === key ? '#fff' : '#000', // Adjust text color for contrast
                  borderRadius: '0.3125em',
                  whiteSpace: 'nowrap',
                }}
                //onClick={(e) => handleKeywordClick(e, key, value1, value2, value3)} // Directly play the keyword segment
                onClick={(e) => loopKeywordPlay(e, key, value1, value2, value3)} // Loop play the keyword segment
              >
                {key} {/* Display the key */}
              </div>
            ))}                         
            {/* Place the search box for video at the right-down of progress bar area */}  
            <div style={{position: 'fixed', transform:'translateX(41.5em)', bottom: '1px'}}>
              <input id="searchBox" 
                    type="text"                      
                    className='dynamic-searchBox' 
                    placeholder="Type and Press Enter to Search a Video" 
                    style={{display:"none"}}
                    onFocus={() => { const searchBox = document.getElementById('searchBox');                                        
                                      (searchBox as HTMLInputElement).value = ''; 
                                      (searchBox as HTMLInputElement).style.color = 'blue'; 
                                    }} 
              /> 
            </div>  
          </div>

          {/* Display the current play time and Total time */}
          <div
            style={{
              position: 'absolute',
              top: '-2em', // Adjust as needed
              left: `${progress}%`, // Move with the progress bar
              transform: 'translateX(-20%)', // Center the text
              backgroundColor: 'rgba(255, 255, 255, 0)',
              color: 'rgba(0, 0, 0, 0.7)',
              padding: '0.3125em',
              borderRadius: '0.3125em',
              fontSize: '0.9em',
            }}>
            {formatDuration({time: currentTime})}
          </div>                    
          {/* total duration */}
          <div className="audio-duration">
            {formatDuration({time: totalDuration})}
          </div>          
        </div>  

        {/* AI Button to display the Right panel to ask Question */}
        <div className="tooltip-container">
          <Button
                label={'Chatbot'}
                buttonStyle={'regular'}
                disabled={!isConnected}
                onClick={openChatbot}
              /> 
          <div className="tooltip">
            <span><strong className='tooltip-title'>Open an AI Chatbot to: </strong><br/>Ask for general questions or Search a Video from youtube or Search in the Magzine</span><br />
          </div>             
        </div>
        {/* Mute/Unmute Button to have a real time conversion */}                      
        <button ref={muteBtnRef} onClick={toggleMuteRecording} className='hidden-button'></button>  
        <div className="tooltip-container">
          <Button
              id="muteButton"
              label={isMuted ? '' : ''}
              iconPosition={'start'}
              icon={isMuted ? MicOff : Mic}
              //disabled={isMuteBtnDisabled}
              disabled={!isConnected}
              buttonStyle={'regular'}
              onClick={toggleMuteRecording}
            />
          <div className="tooltip">
            <strong className='tooltip-title'>Turn <>{isMuted ? 'on' : 'off'}</> microphone</strong><br />
            {!isConnected && <>The <span className="highlightred">first</span> turning on will start the Audio Copilot.<br /><br /> </>}
            {isConnected && <><br /> </>}
          </div>            
        </div>   
        {/*Display Copilot Status*/}      
        <div style={{ fontSize: '1em' }}>{isConnected ? ( <> Copilot: <span className="highlightgreen">On</span> </> ) : (isMuteBtnDisabled ? startingText : (isConnectionError ? ( <><span className="highlightred">Error Occurred!</span></> ) : ( <> Copilot: <span className="highlightred">Off</span> </> )) )}</div>      
      </div>   

    </div>
  );
}