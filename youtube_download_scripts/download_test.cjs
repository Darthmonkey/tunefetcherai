const { youtubeDl } = require('youtube-dl-exec')
const fs = require('fs');

const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const outputFilePath = 'test_download.mp3'; // Change this to your desired output path

async function downloadYouTubeAudio(url, outputPath) {
    try {
        console.log(`Attempting to download audio from: ${url}`);

        // Use youtube-dl-exec to download the audio
        const commandResult = await youtubeDl(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: outputPath,
        });

        console.log(`Successfully downloaded audio to: ${outputPath}`);
        process.exit(0); // Success
    } catch (error) {
        console.error('An error occurred during the download:', error);
        process.exit(1); // Failure
    }
}

// Call the download function
downloadYouTubeAudio(videoUrl, outputFilePath);