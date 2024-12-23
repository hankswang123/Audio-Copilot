import React, { useRef, useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Document, Page } from "react-pdf";
import * as pdfjsLib from "pdfjs-dist";
import { Speaker } from "react-feather";
import { pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `node_modules/pdfjs-dist/build/pdf.worker.js`;

// This component renders a PDF file with speaker icons overlayed on the text
// NOT WORK AS EXPECTED NOW
const PdfViewerWithIcons = ({ pdfFilePath }) => {
  const [numPages, setNumPages] = useState(null);
  const containerRef = useRef();
  const pageRefs = useRef({});
  const scale = 1.0; // Zoom scale

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);

    // Preinitialize refs for each page
    for (let i = 1; i <= numPages; i++) {
      pageRefs.current[i] = React.createRef();
    }
  };

  const onPageLoadSuccess = async ({ pageNumber }) => {
    const pdf = await pdfjsLib.getDocument(pdfFilePath).promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const textContent = await page.getTextContent();
    //const textItems: TextItem[] = textContent.items.filter((item): item is TextItem => 'str' in item);
    const pageContainer = pageRefs.current[pageNumber]?.current;

    if (pageContainer) {
      // Overlay speaker icons on the text
      
      textContent.items.forEach((item) => {
        if ('str' in item && 'transform' in item) {
          const { str, transform } = item;
          const [scaleX, , , scaleY, offsetX, offsetY] = transform;
          const x = offsetX;
          const y = viewport.height - offsetY;

          // Create the div element with the icon
          const overlayDiv = document.createElement('div');
          overlayDiv.style.position = 'absolute';
          overlayDiv.style.left = `${x}px`;
          overlayDiv.style.top = `${y}px`;
          overlayDiv.style.transform = `scale(${scaleX}, ${scaleY})`;
          overlayDiv.style.display = 'flex';
          overlayDiv.style.alignItems = 'center';
          overlayDiv.style.justifyContent = 'center';
          overlayDiv.style.color = 'red'; // Customize the color of your icon
          overlayDiv.style.fontSize = '14px'; // Adjust size as needed

          // Insert your React component (icon) or plain HTML icon
          ReactDOM.render(<Speaker />, overlayDiv);

          // Add click event for text-to-speech
          /*icon.addEventListener("click", () => {
            console.log("Read aloud:", str); // Replace with TTS logic
          });*/

          // Append the icon to the page container
          pageContainer.appendChild(overlayDiv);          
        }
      });
    }    
    
  };

  return (
    <div
      style={{
        margin: "0 auto",
        marginTop: "2.5em",
        width: "100%",
        overflowY: "auto",
        scrollbarWidth: "auto",
        top: "400px",
      }}
    >
      <div
        ref={containerRef}
        style={{
          margin: "0 auto",
          width: "100%",
          overflowY: "auto",
          scrollbarWidth: "none",
          top: "400px",
          backgroundColor: "white",
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        <Document file={pdfFilePath} onLoadSuccess={onDocumentLoadSuccess}>
          {Array.from(new Array(numPages), (el, index) => (
            <div
              ref={pageRefs.current[index + 1]}
              key={`page_${index + 1}`}
              style={{
                marginBottom: "10px",
                flexShrink: 0,
                margin: "20px auto",
                width: "fit-content",
                position: "relative", // Enable absolute positioning for icons
              }}
            >
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                renderTextLayer={true}
                renderAnnotationLayer={false}
                onLoadSuccess={() => onPageLoadSuccess({ pageNumber: index + 1 })}
                loading={<p>Loading page {index + 1}...</p>}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
};

export default PdfViewerWithIcons;
