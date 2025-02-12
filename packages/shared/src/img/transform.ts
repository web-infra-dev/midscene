import { Buffer } from 'node:buffer';
import getJimp from './get-jimp';

/**
/**
 * Saves a Base64-encoded image to a file
 *
 * @param options - An object containing the Base64-encoded image data and the output file path
 * @param options.base64Data - The Base64-encoded image data
 * @param options.outputPath - The path where the image will be saved
 * @throws Error if there is an error during the saving process
 */
export async function saveBase64Image(options: {
  base64Data: string;
  outputPath: string;
}): Promise<void> {
  const { base64Data, outputPath } = options;
  // Remove the base64 data prefix (if any)
  const base64Image = base64Data.split(';base64,').pop() || base64Data;

  // Converts base64 data to buffer
  const imageBuffer = Buffer.from(base64Image, 'base64');

  // Use Jimp to process the image and save it to the specified location
  const Jimp = await getJimp();
  const image = await Jimp.read(imageBuffer);
  await image.writeAsync(outputPath);
}

/**
 * Transforms an image path into a base64-encoded string
 * @param inputPath - The path of the image file to be encoded
 * @returns A Promise that resolves to a base64-encoded string representing the image file
 */
export async function transformImgPathToBase64(inputPath: string) {
  // Use Jimp to process images and generate base64 data
  const Jimp = await getJimp();
  const image = await Jimp.read(inputPath);
  const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
  return buffer.toString('base64');
}

/**
 * Resizes an image from a base64-encoded string
 *
 * @param base64Data - A base64-encoded string representing the image
 * @returns A Promise that resolves to a base64-encoded string representing the resized image
 * @throws An error if the width or height cannot be determined from the metadata
 */
export async function resizeImg(
  inputData: Buffer,
  newSize?: {
    width: number;
    height: number;
  },
): Promise<Buffer> {
  if (typeof inputData === 'string')
    throw Error('inputData is base64, use resizeImgBase64 instead');

  const Jimp = await getJimp();
  const image = await Jimp.read(inputData);
  const { width, height } = image.bitmap;

  if (!width || !height) {
    throw Error('Undefined width or height from the input image.');
  }

  const finalNewSize = newSize || calculateNewDimensions(width, height);

  if (finalNewSize.width === width && finalNewSize.height === height) {
    return inputData;
  }

  image.resize(
    finalNewSize.width,
    finalNewSize.height,
    Jimp.RESIZE_NEAREST_NEIGHBOR,
  );
  image.quality(90);
  const resizedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

  return resizedBuffer;
}

export async function resizeImgBase64(
  inputBase64: string,
  newSize?: {
    width: number;
    height: number;
  },
): Promise<string> {
  const splitFlag = ';base64,';
  const dataSplitted = inputBase64.split(splitFlag);
  if (dataSplitted.length !== 2) {
    throw Error('Invalid base64 data');
  }

  const imageBuffer = Buffer.from(dataSplitted[1], 'base64');
  const buffer = await resizeImg(imageBuffer, newSize);
  const content = buffer.toString('base64');
  return `${dataSplitted[0]}${splitFlag}${content}`;
}

/**
 * Calculates new dimensions for an image while maintaining its aspect ratio.
 *
 * This function is designed to resize an image to fit within a specified maximum width and height
 * while maintaining the original aspect ratio. If the original width or height exceeds the maximum
 * dimensions, the image will be scaled down to fit.
 *
 * @param {number} originalWidth - The original width of the image.
 * @param {number} originalHeight - The original height of the image.
 * @returns {Object} An object containing the new width and height.
 * @throws {Error} Throws an error if the width or height is not a positive number.
 */
export function calculateNewDimensions(
  originalWidth: number,
  originalHeight: number,
) {
  // In low mode, the image is scaled to 512x512 pixels and 85 tokens are used to represent the image.
  // In high mode, the model looks at low-resolution images and then creates detailed crop images, using 170 tokens for each 512x512 pixel tile. In practical applications, it is recommended to control the image size within 2048x768 pixels
  const maxWidth = 2048; // Maximum width
  const maxHeight = 768; // Maximum height
  let newWidth = originalWidth;
  let newHeight = originalHeight;

  // Calculate the aspect ratio
  const aspectRatio = originalWidth / originalHeight;

  // Width adjustment
  if (originalWidth > maxWidth) {
    newWidth = maxWidth;
    newHeight = newWidth / aspectRatio;
  }

  // Adjust height
  if (newHeight > maxHeight) {
    newHeight = maxHeight;
    newWidth = newHeight * aspectRatio;
  }

  return {
    width: Math.round(newWidth),
    height: Math.round(newHeight),
  };
}

/**
 * Trims an image and returns the trimming information, including the offset from the left and top edges, and the trimmed width and height
 *
 * @param image - The image to be trimmed. This can be a file path or a Buffer object containing the image data
 * @returns A Promise that resolves to an object containing the trimming information. If the image does not need to be trimmed, this object will be null
 */
export async function trimImage(image: string | Buffer): Promise<{
  trimOffsetLeft: number; // attention: trimOffsetLeft is a negative number
  trimOffsetTop: number; // so as trimOffsetTop
  width: number;
  height: number;
} | null> {
  const Jimp = await getJimp();
  const jimpImage = await Jimp.read(
    Buffer.isBuffer(image) ? image : Buffer.from(image),
  );
  const { width, height } = jimpImage.bitmap;

  if (width <= 3 || height <= 3) {
    return null;
  }

  const trimmedImage = jimpImage.autocrop();
  const { width: trimmedWidth, height: trimmedHeight } = trimmedImage.bitmap;

  const trimOffsetLeft = (width - trimmedWidth) / 2;
  const trimOffsetTop = (height - trimmedHeight) / 2;

  if (trimOffsetLeft === 0 && trimOffsetTop === 0) {
    return null;
  }

  return {
    trimOffsetLeft: -trimOffsetLeft,
    trimOffsetTop: -trimOffsetTop,
    width: trimmedWidth,
    height: trimmedHeight,
  };
}

/**
 * Aligns an image's coordinate system based on trimming information
 *
 * This function takes an image and a center rectangle as input. It first extracts the center
 * rectangle from the image using Jimp and converts it to a buffer. Then, it calls
 * the trimImage function to obtain the trimming information of the buffer image. If there is no
 * trimming information, the original center rectangle is returned. If there is trimming information,
 * a new rectangle is created based on the trimming information, with its top-left corner
 * positioned at the negative offset of the trimming from the original center rectangle's top-left
 * corner, and its width and height set to the trimmed image's dimensions.
 *
 * @param image The image file path or buffer to be processed
 * @param center The center rectangle of the image, which is used to extract and align
 * @returns A Promise that resolves to a rectangle object representing the aligned coordinates
 * @throws Error if there is an error during image processing
 */
// export async function alignCoordByTrim(
//   image: string | Buffer,
//   centerRect: Rect,
// ): Promise<Rect> {
//   const isBuffer = Buffer.isBuffer(image);
//   let jimpImage;
//   if (isBuffer) {
//     jimpImage = await Jimp.read(image);
//   } else {
//     jimpImage = await Jimp.read(image);
//   }

//   const { width, height } = jimpImage.bitmap;
//   if (width <= 3 || height <= 3) {
//     return centerRect;
//   }
//   const zeroSize: Rect = {
//     left: 0,
//     top: 0,
//     width: -1,
//     height: -1,
//   };
//   const finalCenterRect: Rect = { ...centerRect };
//   if (centerRect.left > width || centerRect.top > height) {
//     return zeroSize;
//   }

//   if (finalCenterRect.left < 0) {
//     finalCenterRect.width += finalCenterRect.left;
//     finalCenterRect.left = 0;
//   }

//   if (finalCenterRect.top < 0) {
//     finalCenterRect.height += finalCenterRect.top;
//     finalCenterRect.top = 0;
//   }

//   if (finalCenterRect.left + finalCenterRect.width > width) {
//     finalCenterRect.width = width - finalCenterRect.left;
//   }
//   if (finalCenterRect.top + finalCenterRect.height > height) {
//     finalCenterRect.height = height - finalCenterRect.top;
//   }

//   if (finalCenterRect.width <= 3 || finalCenterRect.height <= 3) {
//     return finalCenterRect;
//   }

//   try {
//     const croppedImage = jimpImage.crop(
//       centerRect.left,
//       centerRect.top,
//       centerRect.width,
//       centerRect.height,
//     );
//     const buffer = await croppedImage.getBufferAsync(Jimp.MIME_PNG);
//     const trimInfo = await trimImage(buffer);
//     if (!trimInfo) {
//       return centerRect;
//     }

//     return {
//       left: centerRect.left - trimInfo.trimOffsetLeft,
//       top: centerRect.top - trimInfo.trimOffsetTop,
//       width: trimInfo.width,
//       height: trimInfo.height,
//     };
//   } catch (e) {
//     console.log(jimpImage.bitmap);
//     throw e;
//   }
// }
