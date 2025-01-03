import React, {forwardRef, useImperativeHandle, useState, useEffect, useRef } from "react";
import styles from "./Chat.module.css";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw"; // required to render raw HTML - render iframe in chat
import { AssistantStream } from "openai/lib/AssistantStream";
import { OpenAI } from "openai";
import { AssistantStreamEvent } from "openai/resources/beta";
import { RequiredActionFunctionToolCall } from "openai/resources/beta/threads/runs/runs";
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';

import { Button } from '../button/Button';
import { Mic, MicOff, Plus, Minus, ArrowLeft, ArrowRight } from 'react-feather';
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
if (assistantId === '') {
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
};

const ReadAloudMessage = ({ text }: { text: string }) => {
  return (  
    <div className={styles.assistantMessage}>
      <audio src={text} controls />
    </div>
  );
};

const AudioMessage = ({ itemId, items }: { itemId: string; items: ItemType[] }) => {
  const tempItem = items.find((conversationItem) => conversationItem.id === itemId);

  // Check if tempItem exists before accessing its properties
  const alignSelf = tempItem?.role === 'user' ? 'flex-end' : 'flex-start';

  return (
    <div style={{ alignSelf }}>
      {items
        .filter((conversationItem) => conversationItem.id === itemId) // Filter for the specific item
        .map((conversationItem) => (
          <div className={`cv-item`} key={conversationItem.id}>            
            <div className={`speaker ${conversationItem.role || ''}`} style={{ display: 'none' }}>
              <div>
                {(conversationItem.role || conversationItem.type).replaceAll('_', ' ')}
              </div>
            </div>
            <div className={`speaker-content`}>
              {/* Tool response */}
              {conversationItem.type === 'function_call_output' && (
                <div style={{ display: 'none' }}>{conversationItem.formatted.output}</div>
              )}
              {/* Tool call */}
              {!!conversationItem.formatted.tool && (
                <div style={{ display: 'none' }}>
                  {conversationItem.formatted.tool.name}(
                  {conversationItem.formatted.tool.arguments})
                </div>
              )}
              {!conversationItem.formatted.tool &&
                conversationItem.role === 'user' && (
                  <div style={{ alignSelf: 'flex-end', textAlign: 'right'}}>
                    {conversationItem.formatted.transcript ||
                      (conversationItem.formatted.audio?.length
                        ? '(awaiting transcript)'
                        : conversationItem.formatted.text || '(item sent)')}
                  </div>
                )}
              {!conversationItem.formatted.tool &&
                conversationItem.role === 'assistant' && (
                  <div>
                    {conversationItem.formatted.transcript ||
                      conversationItem.formatted.text || '(truncated)'}
                  </div>
                )}
              {conversationItem.formatted.file && (() => {
                console.log('Audio URL:', conversationItem.formatted.file.url);
                return (
                  <audio src={conversationItem.formatted.file.url} controls />
                );
              })()}
            </div>
          </div>
        ))}
    </div>
  );
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
};

//export function Chat({ functionCallHandler = () => Promise.resolve("") }: ChatProps, ref) {
const Chat = forwardRef(({ functionCallHandler = () => Promise.resolve("") }: ChatProps, ref) => {
  const [userInput, setUserInput] = useState("");
  //new codes by copilot
  const [messages, setMessages] = useState<{ role: "user" | "assistant" | "code" | "audio" | "read_aloud"; text: string }[]>([]);
  const [inputDisabled, setInputDisabled] = useState(false);
  const [threadId, setThreadId] = useState("");
  const threadIdRef = useRef<string | null>(null);
  const [items, setItems] = useState<ItemType[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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
    updateSelection(selection) {
      appendMessage("user", '[Read Aloud]:<br />'+ selection);
    },          

    updateReadAloud(audio_url) {
      appendMessage("read_aloud", audio_url);
    },        

    updateItems(items) {
      setItems(items); 
      //setItems((prevItems) => [...prevItems, ...items]);
    },

    updateItemID(updateItemID) {
      appendMessage("audio", updateItemID);
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
    if (!userInput.trim()) return;
    setMessages((prev) => [...prev, { role: "user", text: userInput }]);
    sendMessage(userInput);
    setUserInput("");
    setInputDisabled(true);
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
          placeholder="Enter your question"
        />  
        <button
          type="submit"
          className={styles.button}
          disabled={inputDisabled}
          style={{ display: 'none' }}
        >       
          Send
        </button>                 
        <Button
              type="submit"
              id="submitButton"
              className={styles.button}
              label='Send'
              iconPosition={'start'}
              //icon= { Mic }
              //disabled={isMuteBtnDisabled}
              disabled={inputDisabled}
              buttonStyle={'regular'}
              onFocus={() => {console.log('Mute/Unmute icon should not be displayed'); }}
              //onClick={toggleMuteRecording}
            />          
      </form>        
    </div>
  );
});

export default Chat;