/**
 * This will generate the filePaths.js in the src folder
 * for referencing the current audio and pdf files in the public/currentPlay folder
 * 
 * This will will also be executed automatically by npm start due to the prestart script
 * "prestart": "node generateFilePaths.js", the latest pdf and audio file in the currentPlay
 * folder will be used as the default files to be played and rendered
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

//Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const audioDir = path.join(__dirname, 'public', 'currentPlay');
const pdfDir = path.join(__dirname, 'public', 'currentPlay');
const filePath = path.join(__dirname, 'src', 'filePaths.js');

const findFile = (dir, extensions) => {
  const files = fs.readdirSync(dir);
  return files.find(file => extensions.some(ext => file.endsWith(ext)));
};

const audioFile = findFile(audioDir, ['.wav', '.mp3']);
const pdfFile = findFile(pdfDir, ['.pdf']);

const fileContent = `
export const pdfFilePath = '${pdfFile ? `./currentPlay/${pdfFile}` : ''}';
export const audioFilePath = '${audioFile ? `./currentPlay/${audioFile}` : ''}';
`;

fs.writeFileSync(filePath, fileContent, 'utf8');
console.log('File paths generated successfully.');