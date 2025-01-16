import React, {forwardRef, useImperativeHandle, useState, useEffect, useRef } from "react";
import styles from "./Chat.module.css";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw"; // required to render raw HTML - render iframe in chat
import { AssistantStream } from "openai/lib/AssistantStream";
import { OpenAI } from "openai";
import { AssistantStreamEvent } from "openai/resources/beta";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { RealtimeClient } from '@openai/realtime-api-beta';

import { Button } from '../button/Button';
import { Mic, MicOff, Send, Plus, Minus, ArrowLeft, ArrowRight } from 'react-feather';
import { openDB } from 'idb';
//import { pdfFilePath, audioFilePath } from '../filePaths.js';

/*
async function initializeDB() {
  return openDB('my-database', 1, {
    upgrade(db) {
      // Check if the 'keyval' store exists, if not create it
      if (!db.objectStoreNames.contains('keyval')) {
        db.createObjectStore('keyval');
      }
    },
  });
}

async function setData(key, value) {
  const db = await openDB('my-database', 1, {
    upgrade(db) {
      db.createObjectStore('keyval');
    },
  });
  await db.put('keyval', value, key);
}

async function getData(key) {
  //const db = await openDB('my-database', 1);
  const db = await initializeDB(); // Ensure database and object store are initialized
  return await db.get('keyval', key);
}
*/

let apiKey = localStorage.getItem('tmp::voice_api_key');
if (apiKey === '') {
  apiKey = prompt('OpenAI API Key');
  if (apiKey === null) {
    throw new Error('API Key is required');
  } else {  
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }  
}

//tbd: assistant creation when the existing assistant is not available
//const assistantId = ""; // indicate the new assistant to not alter or transform HTML content when including <iframe>
let assistantId = localStorage.getItem('tmp::asst_id');
if (assistantId === null) {
  assistantId = prompt('Assistant Id needed');
  if (assistantId === null) {
    throw new Error('Assistant Id is required');
  } else {  
    localStorage.setItem('tmp::asst_id', assistantId);
  }  
}

export const openai = new OpenAI({
  apiKey: apiKey, 
  dangerouslyAllowBrowser: true // Set this option to allow usage in a browser environment
});

type MessageProps = {
  role: "user" | "assistant" | "code" | "audio" | "read_aloud";
  text: string;
  items: ItemType[];
};

const UserMessage = ({ text }: { text: string }) => {
  return <div className={styles.userMessage}>
          <Markdown rehypePlugins={[rehypeRaw]}>{text}</Markdown>
        </div>;
};

const AssistantMessage = ({ text }: { text: string }) => {

  const preprocessText = (text: string) => {
    if (!text.includes('<iframe') && !text.includes('</iframe>')) {
      return text.replace(/\n/g, '<br />');
    }
    return text;
  };  

  return (  
    <div className={styles.assistantMessage}>
	    <Markdown rehypePlugins={[rehypeRaw]}>{preprocessText(text)}</Markdown>
    </div>    
  );
  /* original code
    <div className={styles.assistantMessage}>
	    <Markdown rehypePlugins={[rehypeRaw]}>{preprocessText(text)}</Markdown>
    </div>    
  */
  /* test show img in chat history list
    <div className={styles.assistantMessage}>
      <Markdown rehypePlugins={[rehypeRaw]}>
        {'<img src="./wordCard/National Geographic Little Kids UK Issue 23 2024/Orange.png" style="border-radius: 9px; width: 200px; height: 200px;" />'}
      </Markdown>
    </div>
  */  
};

const ReadAloudMessage = ({ text }: { text: string }) => {
  return (  
    <div className={styles.assistantMessage}>
      <audio src={text} controls />
    </div>
  );
};

const OriginalAudio = ({ align, itemId, items }: { align: string; itemId: string; items: ItemType[] }) => {
  return (
    <div style={{ alignSelf: align }} >
      {items
        .filter((conversationItem) => conversationItem.id === itemId) // Filter for the specific item
        .map((conversationItem) => (          
          <div key={conversationItem.id}>                       
              {conversationItem.formatted.file && (() => {
                return (
                  <audio src={conversationItem.formatted.file.url} controls />
                );
              })()}               
          </div>
      ))}
    </div>  
  );
}

const AudioMessage = ({ itemId, items }: { itemId: string; items: ItemType[] }) => {
  const tempItem = items.find((conversationItem) => conversationItem.id === itemId);

  // Check if tempItem exists before accessing its properties
  const role = tempItem?.role;
  const alignSelf = role === 'user' ? 'flex-end' : 'flex-start';

  switch (role) {
    case "user":
      return <> {/*Transcription for user audio or text only*/}
                <UserMessage text={tempItem.formatted.transcript ||
                                (tempItem.formatted.audio?.length
                                  ? '(awaiting transcript)'
                                  : tempItem.formatted.text || '(item sent)')} 
                />
                <OriginalAudio align={alignSelf} itemId={itemId} items={items} />
             </>    
    case "assistant":
      return <> {/*Transcription for system response audio*/}
                <AssistantMessage text={tempItem.formatted.transcript ||
                                    tempItem.formatted.text || '(truncated)'} 
                />
                <OriginalAudio align={alignSelf} itemId={itemId} items={items} />
            </>  
    default:
      return null;
  }      

};

const CodeMessage = ({ text }: { text: string }) => {
  return (
    <div className={styles.codeMessage}>
      {text.split("\n").map((line, index) => (
        <div key={index}>
          <span>{`${index + 1}. `}</span>
          {line}
        </div>
      ))}
    </div>
  );
};

const Message = ({ role, text, items }: MessageProps) => {
  switch (role) {
    case "user":
      return <UserMessage text={text} />;
    case "assistant":
      return <AssistantMessage text={text} />;
    case "code":
      return <CodeMessage text={text} />;
    case "audio":
      return <AudioMessage itemId={text} items={items} />;      
    case "read_aloud":
      return <ReadAloudMessage text={text} />;
    default:
      return null;
  }
};

type ChatProps = {
  functionCallHandler?: (
    toolCall: RequiredActionFunctionToolCall
  ) => Promise<string>;
  realtimeClient?: RealtimeClient;
  getIsMuted?: () => boolean;
};

//export function Chat({ functionCallHandler = () => Promise.resolve("") }: ChatProps, ref) {
const Chat = forwardRef(({ functionCallHandler = () => Promise.resolve(""), getIsMuted, realtimeClient }: ChatProps, ref) => {
  const [userInput, setUserInput] = useState("");
  //new codes by copilot
  const [messages, setMessages] = useState<{ role: "user" | "assistant" | "code" | "audio" | "read_aloud"; text: string }[]>([]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [threadId, setThreadId] = useState("");
  const threadIdRef = useRef<string | null>(null);
  const [items, setItems] = useState<ItemType[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [isChecked, setIsChecked] = useState(true);

  /* Load message from local storage or IDB
  useEffect(() => {
    const loadItems = async () => {
      try {
        const savedItems = await getData("items"); // Await the async operation
        setMessages(savedItems ? JSON.parse(savedItems) : []);
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    };

    loadItems();
  }, []);  

  useEffect(() => {
    const saveItems = async () => {
      try {
        await setData("items", JSON.stringify(items));
      } catch (error) {
        console.error("Failed to save messages:", error);
      }
    };
  
    saveItems(); // Call the async function
  }, [items]);  
  */
/*
  const [items, setItems] = useState<ItemType[]>(() => {
    // Load initial state from localStorage if available
    const savedItems = localStorage.getItem("items");
    return savedItems ? JSON.parse(savedItems) : [];
  });

  // Save `items` to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("items", JSON.stringify(items));
  }, [items]);  */

/*  
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const savedMessages = await getData("messages"); // Await the async operation
        setMessages(savedMessages ? JSON.parse(savedMessages) : []);
      } catch (error) {
        console.error("Failed to load messages:", error);
      }
    };

    loadMessages();
  }, []);  

  useEffect(() => {
    const saveMessages = async () => {
      try {
        await setData("messages", JSON.stringify(messages));
      } catch (error) {
        console.error("Failed to save messages:", error);
      }
    };
  
    saveMessages(); // Call the async function
  }, [messages]);
*/
  /*
  const [messages, setMessages] = useState<{ 
    role: "user" | "assistant" | "code" | "audio"; 
    text: string; 
  }[]>(() => {
    // Load initial state from localStorage if available
    //const savedMessages = localStorage.getItem("messages");
    //return savedMessages ? JSON.parse(savedMessages) : [];

    const savedMessages = getData("messages");
    return savedMessages ? JSON.parse(savedMessages) : [];
  });

  // Save `messages` to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("messages", JSON.stringify(messages));
  }, [messages]);  */

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Use useImperativeHandle to define functions that the parent can call
  useImperativeHandle(ref, () => ({
    updateData(audioData) {
      appendMessage("user", audioData);
    },
    updateVideo(embedUrl) {
      appendMessage("assistant", embedUrl);
    },  
    updateImage(imgUrl) {
      appendMessage("assistant", imgUrl);
    },     
    updateSelection(selection) {
      //appendMessage("user", `<div style={fontSize: '0.2em',}>[Read Aloud]:</div><br />`+ selection);
      appendMessage("user", '[Read Aloud]:<br />'+ selection);
    },          

    updateReadAloud(audio_url) {
      appendMessage("read_aloud", audio_url);
    },        

    updateItems(newItems) {
      //setItems(items); 
      //setItems((prevItems) => [...prevItems, ...items]);

      setItems((prevItems) => {
        // Create a Set of IDs for quick lookup of existing items
        const existingIds = new Set(prevItems.map((item) => item.id));
    
        // Filter newItems to include only those that are not already in the state
        const filteredNewItems = newItems.filter((item) => !existingIds.has(item.id));
    
        // Return the updated state by appending the filtered new items
        return [...prevItems, ...filteredNewItems];
      });      
    },

    updateItemID(updateItemID) {
      appendMessage("audio", updateItemID);
    },    

    explainSelection(userInput) {     
      sendMessage(userInput);
      setInputDisabled(true);
    },    

    chatFromExternal(userInput) {
      if (!userInput.trim()) return;
      
      const checkBox = document.getElementById('checkBox') as HTMLInputElement;
      //if(isChecked) {
      if(checkBox.checked) {
      // use Realtime API to reply user input/question
        //appendMessage("user", userInput);
        if(realtimeClient.isConnected()){
          realtimeClient.sendUserMessageContent([
            {
              type: `input_text`,
              text: userInput,
            },
          ]);
        }else{
          appendMessage("assistant", "RealTime API Connection error. Please Connect again...");
          setInputDisabled(false);
        }
      }else{
      // use Assistant API to reply user input/question
        setMessages((prev) => [...prev, { role: "user", text: userInput }]);
        sendMessage(userInput);
        //setUserInput("");
        setInputDisabled(true);
      }
      setUserInput("");
    },

  }));  

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getThreadId = async () => {
    /*
    const res = await fetch(`/api/assistants/threads`, {
      method: "POST",
    });
    const data = await res.json(); */
    try{
      if (!threadId) {
        const thread = await openai.beta.threads.create();
        setThreadId(thread.id);
        threadIdRef.current = thread.id;
      }
    } catch (error) {
      appendMessage("assistant", "Connection error. Please try again.");
      setInputDisabled(false);
    }
  };  

  const sendMessage = async (text: string) => {
    /*
    const response = await fetch(`/api/assistants/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: text,
      }),
    });*/

    try {
          await getThreadId(); 
          await openai.beta.threads.messages.create(threadIdRef.current, {
            role: "user",
            content: text,
          });
      
          const stream = openai.beta.threads.runs.stream(threadIdRef.current, {
            assistant_id: assistantId,
          });    
  
          //changed by copilot
          const readableStream = stream.toReadableStream();
          if (readableStream) {
            const assistantStream = AssistantStream.fromReadableStream(readableStream);
            handleReadableStream(assistantStream);
          } else {
            console.error("Response body is null");
          }
      } catch (error) {
        console.error("Error sending message", error);
        appendMessage("assistant", "Connection error. Please try again...");
        setInputDisabled(false);
      }
  };

  const submitActionResult = async (runId, toolCallOutputs) => {
    /*
    const response = await fetch(
      `/api/assistants/threads/${threadId}/actions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          runId: runId,
          toolCallOutputs: toolCallOutputs,
        }),
      }
    );*/

    const submitStream = openai.beta.threads.runs.submitToolOutputsStream(
      threadIdRef.current,
      runId,
      // { tool_outputs: [{ output: result, tool_call_id: toolCallId }] },
      { tool_outputs: toolCallOutputs }
    );    

    const assistantStream = AssistantStream.fromReadableStream(submitStream.toReadableStream());
    handleReadableStream(assistantStream);
  };  

  // handleRequiresAction - handle function call
  const handleRequiresAction = async (
    event: AssistantStreamEvent.ThreadRunRequiresAction
  ) => {
    const runId = event.data.id;
    const toolCalls = event.data.required_action.submit_tool_outputs.tool_calls;
    // loop over tool calls and call function handler
    const toolCallOutputs = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const result = await functionCallHandler(toolCall);
        return { output: result, tool_call_id: toolCall.id };
      })
    );
    setInputDisabled(true);
    submitActionResult(runId, toolCallOutputs);
  };  

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) {
      const muteButton = document.getElementById('muteButton');
      if (muteButton) {
        muteButton.click();
      }
      return;
    }

    const checkBox = document.getElementById('checkBox') as HTMLInputElement;
    //if(isChecked) {
    if(checkBox.checked) {
    // use Realtime API to reply user input/question
      //setMessages((prev) => [...prev, { role: "user", text: userInput }]);
      if(realtimeClient.isConnected()){
        realtimeClient.sendUserMessageContent([
          {
            type: `input_text`,
            text: userInput,
          },
        ]);
      }else{
        appendMessage("assistant", "RealTime API Connection error. Please Connect again...");
        setInputDisabled(false);
      }
    }else{
    // use Assistant API to reply user input/question
      setMessages((prev) => [...prev, { role: "user", text: userInput }]);
      sendMessage(userInput);
      //setUserInput("");
      setInputDisabled(true);
    }
    setUserInput("");
  };

  /* Stream Event Handlers */

  // textCreated - create new assistant message
  const handleTextCreated = () => {
    appendMessage("assistant", "");
  };
;

  // textDelta - append text to last assistant message
  const handleTextDelta = (delta) => {
    if (delta.value != null) {
      appendToLastMessage(delta.value);
    };
    if (delta.annotations != null) {
      annotateLastMessage(delta.annotations);
    }
  };

  // imageFileDone - show image in chat
  interface ImageFileDoneEvent {
    file_id: string;
  }

  const handleImageFileDone = (image: ImageFileDoneEvent) => {
    appendToLastMessage(`\n![${image.file_id}](/api/files/${image.file_id})\n`);
  };

  // toolCallCreated - log new tool call
  interface ToolCall {
    type: string;
  }

  const toolCallCreated = (toolCall: ToolCall) => {
    if (toolCall.type != "code_interpreter") return;
    appendMessage("code", "");
  };

  // toolCallDelta - log delta and snapshot for the tool call
  interface ToolCallDelta {
    type: string;
    code_interpreter?: {
      input?: string;
    };
  }

  interface Snapshot {
    // Define the properties of the snapshot if needed
  }

  const toolCallDelta = (delta: ToolCallDelta, snapshot: Snapshot) => {
    if (delta.type != "code_interpreter") return;
    if (!delta.code_interpreter?.input) return;
    appendToLastMessage(delta.code_interpreter.input);
  };

  // handleRunCompleted - re-enable the input form
  const handleRunCompleted = () => {
    setInputDisabled(false);
  };  

  const handleReadableStream = (stream: AssistantStream) => {
    // messages
    stream.on("textCreated", handleTextCreated);
    stream.on("textDelta", handleTextDelta);

    // image
    stream.on("imageFileDone", handleImageFileDone);

    // code interpreter
    stream.on("toolCallCreated", toolCallCreated);
    stream.on("toolCallDelta", toolCallDelta);

    // events without helpers yet (e.g. requires_action and run.done)
    stream.on("event", (event) => {
      if (event.event === "thread.run.requires_action")
        handleRequiresAction(event);
      if (event.event === "thread.run.completed") handleRunCompleted();
    });
  };

  const appendToLastMessage = (text: string) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      const updatedLastMessage = { ...lastMessage, text: lastMessage.text + text };
      return [...prev.slice(0, -1), updatedLastMessage];
    });
  };
//changed by copilot
  const appendMessage = (role: "user" | "assistant" | "code" | "audio" | "read_aloud", text: string) => {
    setMessages((prev) => [...prev, { role, text }]);
  };

  const annotateLastMessage = (annotations) => {
    setMessages((prevMessages) => {
      const lastMessage = prevMessages[prevMessages.length - 1];
      const updatedLastMessage = {
        ...lastMessage,
      };
      annotations.forEach((annotation) => {
        if (annotation.type === 'file_path') {
          updatedLastMessage.text = updatedLastMessage.text.replaceAll(
            annotation.text,
            `/api/files/${annotation.file_path.file_id}`
          );
        }
      })
      return [...prevMessages.slice(0, -1), updatedLastMessage];
    });
    
  }  

  function handleCheckboxChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setIsChecked(event.target.checked);
  }

  return (
    <div className={styles.chatContainer}>
      <div className={styles.messages}>
        {messages.map((msg, index) => (
          <Message key={index} role={msg.role} text={msg.text} items={items} />
        ))}
        <div ref={messagesEndRef} />      
      </div>
      <form
        onSubmit={handleSubmit}
        className={`${styles.inputForm} ${styles.clearfix}`}
      >    
        <input
          id="chatInputBox"
          type="text"
          className={styles.input}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Ask me anything..."
          style={{marginRight: '1px'}}
        />  
        <Button
          type="submit"
          className={styles.button}
          disabled={realtimeClient.isConnected() ? false : true}
          label={''}
          iconPosition={'start'}
          icon={ getIsMuted() ? MicOff : Mic}          
          style={{ fontSize: 'medium', marginLeft: '1px', marginRight: '1px', display: userInput.trim() === '' ? 'flex' :'none' }}
        />                        
        <Button
              type="submit"
              id="submitButton"
              className={styles.button}
              label={''}
              iconPosition={'start'}
              icon= { Send }
              //disabled={isMuteBtnDisabled}
              disabled={realtimeClient.isConnected() ? inputDisabled : true}
              buttonStyle={'regular'}
              onFocus={() => {console.log('Mute/Unmute icon should not be displayed'); }}
              style={{fontSize: 'medium', marginLeft: '1px', marginRight: '1px', display: userInput.trim() === '' ? 'none' :'flex'}}
              //onClick={toggleMuteRecording}
            /> 
        <input
          id='checkBox'
          type="checkbox"
          title={ realtimeClient.isConnected() ? (isChecked ? "Voice & Text Reply" : "Text-Only Reply") : 'Text-Only Reply'}
          checked={realtimeClient.isConnected()? isChecked : false}
          disabled={!(realtimeClient.isConnected())? true : userInput.trim() === '' ? true : false}
          onChange={handleCheckboxChange}
          //style={{position: 'absolute', top: '5%', left: '97%', transform: 'translate(-50%, -50%)', zIndex: 1}}
        />
      </form>        
    </div>
  );
});

export default Chat;