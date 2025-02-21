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

/*
const findFile = (dir, extensions) => {
  const files = fs.readdirSync(dir);
  return files.find(file => extensions.some(ext => file.endsWith(ext)));
};

const audioFile = findFile(audioDir, ['.wav', '.mp3']);
const pdfFile = findFile(pdfDir, ['.pdf']);
*/

const findLatestFile = (dir, extensions) => {
  const files = fs.readdirSync(dir)
    .filter(file => extensions.some(ext => file.endsWith(ext)))
    .map(file => ({
      file,
      time: fs.statSync(path.join(dir, file)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  return files.length > 0 ? files[0].file : null;
};

const audioFile = findLatestFile(audioDir, ['.wav', '.mp3']);
const pdfFile = findLatestFile(pdfDir, ['.pdf']);

const fileContent = `
export const pdfFilePath = '${pdfFile ? `./currentPlay/${pdfFile}` : ''}';
export const audioFilePath = '${audioFile ? `./currentPlay/${audioFile}` : ''}';
`;

fs.writeFileSync(filePath, fileContent, 'utf8');
console.log('File paths generated successfully.');


async function moveFiles(sourceDir, destinationDir) {
  try {
    // Ensure the destination directory exists
    //await fs.mkdir(destinationDir, { recursive: true });

    // Read all files and subdirectories in the source directory

    const fspro = fs.promises;
    const files = await fspro.readdir(sourceDir);

    for (let file of files) {
      const sourcePath = path.join(sourceDir, file);
      const destinationPath = path.join(destinationDir, file);

      // Get file status information to determine if it is a file
      const stats = await fspro.stat(sourcePath);
      if (stats.isFile()) {
        // Move the file
        await fspro.rename(sourcePath, destinationPath);
        console.log(`Moved: ${sourcePath} to ${destinationPath}`);
      } else {
        console.log(`Skipping directory: ${sourcePath}`);
      }
    }
  } catch (error) {
    console.error('Error moving files:', error);
  }
}

// Use the function
const sourceDirectory = './src/wordCard'; // Source directory path
const destinationDirectory = './public/wordCard'; // Destination directory path

moveFiles(sourceDirectory, destinationDirectory);