/**
 * Template matching functionality similar to OpenCV's cv2.matchTemplate
 * Implements normalized cross-correlation template matching for image comparison
 */

import { imageInfoOfBase64, bufferFromBase64 } from './info';
import { jimpFromBase64 } from './transform';
import getJimp from './get-jimp';

// Debug flag for template matching - only enable when explicitly requested
const TEMPLATE_MATCHING_DEBUG = process.env.MIDSCENE_TEMPLATE_DEBUG === 'true';

export interface TemplateMatchResult {
  x: number;
  y: number;
  confidence: number;
  width: number;
  height: number;
}

export interface TemplateMatchOptions {
  method?: 'TM_CCOEFF_NORMED' | 'TM_CCORR_NORMED' | 'TM_SQDIFF_NORMED';
  threshold?: number; // Minimum confidence threshold (0-1)
  maxResults?: number; // Maximum number of results to return
}

/**
 * Convert image to grayscale using luminance formula
 */
function rgbToGray(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

/**
 * Extract grayscale image data from Jimp image
 */
async function extractGrayscaleData(image: any): Promise<{
  data: number[];
  width: number;
  height: number;
}> {
  const { width, height } = image.bitmap;
  const data: number[] = new Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = image.bitmap.data[idx];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      data[y * width + x] = rgbToGray(r, g, b);
    }
  }
  
  return { data, width, height };
}

/**
 * Compute normalized cross-correlation coefficient (similar to TM_CCOEFF_NORMED)
 */
function computeNormalizedCrossCorrelation(
  image: { data: number[]; width: number; height: number },
  template: { data: number[]; width: number; height: number },
  startX: number,
  startY: number
): number {
  const { width: imgWidth } = image;
  const { width: tplWidth, height: tplHeight, data: tplData } = template;
  
  // Calculate means
  let imageMean = 0;
  let templateMean = 0;
  const numPixels = tplWidth * tplHeight;
  
  for (let ty = 0; ty < tplHeight; ty++) {
    for (let tx = 0; tx < tplWidth; tx++) {
      const imgIdx = (startY + ty) * imgWidth + (startX + tx);
      const tplIdx = ty * tplWidth + tx;
      imageMean += image.data[imgIdx];
      templateMean += tplData[tplIdx];
    }
  }
  
  imageMean /= numPixels;
  templateMean /= numPixels;
  
  // Calculate correlation coefficient
  let numerator = 0;
  let imageVariance = 0;
  let templateVariance = 0;
  
  for (let ty = 0; ty < tplHeight; ty++) {
    for (let tx = 0; tx < tplWidth; tx++) {
      const imgIdx = (startY + ty) * imgWidth + (startX + tx);
      const tplIdx = ty * tplWidth + tx;
      
      const imgDiff = image.data[imgIdx] - imageMean;
      const tplDiff = tplData[tplIdx] - templateMean;
      
      numerator += imgDiff * tplDiff;
      imageVariance += imgDiff * imgDiff;
      templateVariance += tplDiff * tplDiff;
    }
  }
  
  const denominator = Math.sqrt(imageVariance * templateVariance);
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Compute squared difference normalized (similar to TM_SQDIFF_NORMED)
 */
function computeSquaredDifferenceNormalized(
  image: { data: number[]; width: number; height: number },
  template: { data: number[]; width: number; height: number },
  startX: number,
  startY: number
): number {
  const { width: imgWidth } = image;
  const { width: tplWidth, height: tplHeight, data: tplData } = template;
  
  let sumSquaredDiff = 0;
  let imageSum = 0;
  let templateSum = 0;
  const numPixels = tplWidth * tplHeight;
  
  for (let ty = 0; ty < tplHeight; ty++) {
    for (let tx = 0; tx < tplWidth; tx++) {
      const imgIdx = (startY + ty) * imgWidth + (startX + tx);
      const tplIdx = ty * tplWidth + tx;
      
      const imgVal = image.data[imgIdx];
      const tplVal = tplData[tplIdx];
      const diff = imgVal - tplVal;
      
      sumSquaredDiff += diff * diff;
      imageSum += imgVal * imgVal;
      templateSum += tplVal * tplVal;
    }
  }
  
  const normalizationFactor = Math.sqrt(imageSum * templateSum);
  return normalizationFactor === 0 ? 1 : sumSquaredDiff / normalizationFactor;
}

/**
 * Compute correlation coefficient normalized (similar to TM_CCORR_NORMED)
 */
function computeCorrelationCoefficientNormalized(
  image: { data: number[]; width: number; height: number },
  template: { data: number[]; width: number; height: number },
  startX: number,
  startY: number
): number {
  const { width: imgWidth } = image;
  const { width: tplWidth, height: tplHeight, data: tplData } = template;
  
  let correlation = 0;
  let imageSum = 0;
  let templateSum = 0;
  
  for (let ty = 0; ty < tplHeight; ty++) {
    for (let tx = 0; tx < tplWidth; tx++) {
      const imgIdx = (startY + ty) * imgWidth + (startX + tx);
      const tplIdx = ty * tplWidth + tx;
      
      const imgVal = image.data[imgIdx];
      const tplVal = tplData[tplIdx];
      
      correlation += imgVal * tplVal;
      imageSum += imgVal * imgVal;
      templateSum += tplVal * tplVal;
    }
  }
  
  const normalizationFactor = Math.sqrt(imageSum * templateSum);
  return normalizationFactor === 0 ? 0 : correlation / normalizationFactor;
}

/**
 * Perform template matching on two base64-encoded images
 * Replicates OpenCV's cv2.matchTemplate functionality
 * 
 * @param sourceImageBase64 - Base64 encoded source image to search in
 * @param templateImageBase64 - Base64 encoded template image to search for
 * @param options - Template matching options
 * @returns Array of match results sorted by confidence (highest first)
 */
export async function matchTemplate(
  sourceImageBase64: string,
  templateImageBase64: string,
  options: TemplateMatchOptions = {}
): Promise<TemplateMatchResult[]> {
  const {
    method = 'TM_CCOEFF_NORMED',
    threshold = 0.5,
    maxResults = 10
  } = options;
  
  const Jimp = await getJimp();
  
  // Load and process images
  const sourceJimp = await jimpFromBase64(sourceImageBase64);
  const templateJimp = await jimpFromBase64(templateImageBase64);
  
  // Extract grayscale data
  const sourceGray = await extractGrayscaleData(sourceJimp);
  const templateGray = await extractGrayscaleData(templateJimp);
  
  // Validate template size
  if (templateGray.width > sourceGray.width || templateGray.height > sourceGray.height) {
    throw new Error('Template image must be smaller than source image');
  }
  
  const results: TemplateMatchResult[] = [];
  
  // Slide template across source image
  for (let y = 0; y <= sourceGray.height - templateGray.height; y++) {
    for (let x = 0; x <= sourceGray.width - templateGray.width; x++) {
      let confidence: number;
      
      switch (method) {
        case 'TM_CCOEFF_NORMED':
          confidence = computeNormalizedCrossCorrelation(sourceGray, templateGray, x, y);
          break;
        case 'TM_CCORR_NORMED':
          confidence = computeCorrelationCoefficientNormalized(sourceGray, templateGray, x, y);
          break;
        case 'TM_SQDIFF_NORMED':
          // For squared difference, lower values are better, so invert
          confidence = 1 - computeSquaredDifferenceNormalized(sourceGray, templateGray, x, y);
          break;
        default:
          throw new Error(`Unsupported template matching method: ${method}`);
      }
      
      // Only include results above threshold
      if (confidence >= threshold) {
        const matchResult = {
          x,
          y,
          confidence,
          width: templateGray.width,
          height: templateGray.height
        };
        results.push(matchResult);
        
        // Debug output for each valid match found
        if (TEMPLATE_MATCHING_DEBUG && results.length <= 3) { // Only log first 3 matches to avoid spam
          console.log(`🎯 Match #${results.length}: (${x}, ${y}) confidence=${(confidence * 100).toFixed(2)}%`);
        }
      }
    }
  }
  
  // Sort by confidence (highest first) and limit results
  results.sort((a, b) => b.confidence - a.confidence);
  
  if (TEMPLATE_MATCHING_DEBUG) {
    console.log(`📈 Template matching completed: found ${results.length} matches above threshold ${threshold}`);
  }
  
  return results.slice(0, maxResults);
}

/**
 * Find the best match for a template in a source image
 * Returns the match with highest confidence, or null if no match above threshold
 */
export async function findBestMatch(
  sourceImageBase64: string,
  templateImageBase64: string,
  options: TemplateMatchOptions = {}
): Promise<TemplateMatchResult | null> {
  const {
    threshold = 0.5,
    method = 'TM_CCOEFF_NORMED'
  } = options;
  
  if (TEMPLATE_MATCHING_DEBUG) {
    console.log('🔍 Template Matching Debug:');
    console.log(`📊 Method: ${method}, Threshold: ${threshold}`);
  }
  
  const results = await matchTemplate(sourceImageBase64, templateImageBase64, {
    ...options,
    maxResults: 1
  });
  
  if (results.length > 0) {
    const bestMatch = results[0];
    if (TEMPLATE_MATCHING_DEBUG) {
      console.log(`✅ Best Match Found: confidence=${(bestMatch.confidence * 100).toFixed(2)}%, position=(${bestMatch.x}, ${bestMatch.y}), size=${bestMatch.width}x${bestMatch.height}`);
    }
    return bestMatch;
  } else {
    if (TEMPLATE_MATCHING_DEBUG) {
      console.log(`❌ No match found above threshold ${threshold}`);
    }
    return null;
  }
}

/**
 * Check if template exists in source image with given confidence threshold
 */
export async function templateExists(
  sourceImageBase64: string,
  templateImageBase64: string,
  threshold: number = 0.8
): Promise<boolean> {
  const result = await findBestMatch(sourceImageBase64, templateImageBase64, {
    threshold,
    maxResults: 1
  });
  
  return result !== null;
}
