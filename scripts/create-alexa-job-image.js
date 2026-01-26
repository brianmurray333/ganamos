#!/usr/bin/env node
/**
 * Script to create the default image for Alexa-created jobs
 * Crops the top portion of community-fixing.jpg (scenic background)
 */

const sharp = require('sharp');
const path = require('path');

async function createAlexaJobImage() {
  const inputPath = path.join(__dirname, '../public/images/community-fixing.jpg');
  const outputPath = path.join(__dirname, '../public/images/alexa-job-default.jpg');
  
  try {
    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    console.log(`Original image: ${metadata.width}x${metadata.height}`);
    
    // Crop the top-center portion (scenic sky, tree, and buildings)
    // This removes the person in the foreground
    const cropHeight = Math.floor(metadata.height * 0.55); // Top 55% of the image
    const cropWidth = metadata.width;
    
    await sharp(inputPath)
      .extract({
        left: 0,
        top: 0,
        width: cropWidth,
        height: cropHeight
      })
      .resize(800, 450, { // Standard 16:9 aspect ratio
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
    
    console.log(`✅ Created Alexa job default image: ${outputPath}`);
    console.log(`   Dimensions: 800x450 (16:9 aspect ratio)`);
  } catch (error) {
    console.error('❌ Error creating image:', error);
    process.exit(1);
  }
}

createAlexaJobImage();

