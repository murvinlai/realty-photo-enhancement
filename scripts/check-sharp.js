const sharp = require('sharp');

console.log('Sharp Version:', sharp.versions.sharp);
console.log('Libvips Version:', sharp.versions.vips);
console.log('Formats:', sharp.format);

try {
    const heif = sharp.format.heif;
    if (heif && heif.input && heif.input.buffer) {
        console.log('HEIC Decoding Supported: YES');
    } else {
        console.log('HEIC Decoding Supported: NO');
    }
} catch (e) {
    console.error('Error checking formats:', e);
}
