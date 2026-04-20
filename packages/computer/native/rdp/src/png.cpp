#include "rdp_helper_png.hpp"

#include <array>
#include <stdexcept>

namespace midscene::rdp {

namespace {

void AppendUint32BigEndian(std::vector<uint8_t>& output, uint32_t value) {
  output.push_back(static_cast<uint8_t>((value >> 24) & 0xFF));
  output.push_back(static_cast<uint8_t>((value >> 16) & 0xFF));
  output.push_back(static_cast<uint8_t>((value >> 8) & 0xFF));
  output.push_back(static_cast<uint8_t>(value & 0xFF));
}

uint32_t ComputeCrc32(std::string_view chunk_type, const std::vector<uint8_t>& data) {
  uint32_t crc = 0xFFFFFFFFU;
  auto update = [&crc](uint8_t byte) {
    crc ^= byte;
    for (int bit = 0; bit < 8; bit++) {
      const uint32_t mask = 0U - (crc & 1U);
      crc = (crc >> 1U) ^ (0xEDB88320U & mask);
    }
  };

  for (const char ch : chunk_type) {
    update(static_cast<uint8_t>(ch));
  }
  for (const uint8_t byte : data) {
    update(byte);
  }

  return crc ^ 0xFFFFFFFFU;
}

uint32_t ComputeAdler32(const std::vector<uint8_t>& data) {
  constexpr uint32_t kMod = 65521;
  uint32_t a = 1;
  uint32_t b = 0;
  for (const uint8_t byte : data) {
    a = (a + byte) % kMod;
    b = (b + a) % kMod;
  }
  return (b << 16) | a;
}

void AppendChunk(std::vector<uint8_t>& output,
                 std::string_view chunk_type,
                 const std::vector<uint8_t>& data) {
  AppendUint32BigEndian(output, static_cast<uint32_t>(data.size()));
  output.insert(output.end(), chunk_type.begin(), chunk_type.end());
  output.insert(output.end(), data.begin(), data.end());
  AppendUint32BigEndian(output, ComputeCrc32(chunk_type, data));
}

std::vector<uint8_t> BuildImageData(const RawFrame& frame) {
  if (frame.size.width <= 0 || frame.size.height <= 0 || frame.stride == 0 ||
      frame.bgra.empty()) {
    throw std::runtime_error("Remote framebuffer snapshot is empty");
  }

  const size_t width = static_cast<size_t>(frame.size.width);
  const size_t height = static_cast<size_t>(frame.size.height);
  if (frame.stride < width * 4) {
    throw std::runtime_error("Remote framebuffer stride is too small");
  }

  std::vector<uint8_t> image_data;
  image_data.reserve(height * (1 + width * 4));

  for (size_t y = 0; y < height; y++) {
    image_data.push_back(0);
    const size_t row_offset = y * frame.stride;
    for (size_t x = 0; x < width; x++) {
      const size_t pixel_offset = row_offset + x * 4;
      if (pixel_offset + 3 >= frame.bgra.size()) {
        throw std::runtime_error("Remote framebuffer buffer is truncated");
      }

      const uint8_t blue = frame.bgra[pixel_offset];
      const uint8_t green = frame.bgra[pixel_offset + 1];
      const uint8_t red = frame.bgra[pixel_offset + 2];
      const uint8_t alpha = frame.bgra[pixel_offset + 3];

      image_data.push_back(red);
      image_data.push_back(green);
      image_data.push_back(blue);
      image_data.push_back(alpha);
    }
  }

  return image_data;
}

std::vector<uint8_t> BuildStoredZlibStream(const std::vector<uint8_t>& data) {
  std::vector<uint8_t> stream;
  stream.reserve(data.size() + data.size() / 65535 * 5 + 6);
  stream.push_back(0x78);
  stream.push_back(0x01);

  size_t offset = 0;
  while (offset < data.size()) {
    const size_t remaining = data.size() - offset;
    const uint16_t block_size =
        static_cast<uint16_t>(remaining > 65535 ? 65535 : remaining);
    const bool is_last = (offset + block_size) == data.size();

    stream.push_back(is_last ? 0x01 : 0x00);
    stream.push_back(static_cast<uint8_t>(block_size & 0xFF));
    stream.push_back(static_cast<uint8_t>((block_size >> 8) & 0xFF));
    const uint16_t inverted_size = static_cast<uint16_t>(~block_size);
    stream.push_back(static_cast<uint8_t>(inverted_size & 0xFF));
    stream.push_back(static_cast<uint8_t>((inverted_size >> 8) & 0xFF));
    stream.insert(stream.end(),
                  data.begin() + static_cast<std::ptrdiff_t>(offset),
                  data.begin() + static_cast<std::ptrdiff_t>(offset + block_size));
    offset += block_size;
  }

  AppendUint32BigEndian(stream, ComputeAdler32(data));
  return stream;
}

}  // namespace

std::vector<uint8_t> EncodeFrameAsPng(const RawFrame& frame) {
  std::vector<uint8_t> image_data = BuildImageData(frame);

  std::vector<uint8_t> png;
  png.reserve(image_data.size() + 256);

  constexpr std::array<uint8_t, 8> kPngSignature = {137, 80, 78, 71, 13, 10, 26, 10};
  png.insert(png.end(), kPngSignature.begin(), kPngSignature.end());

  std::vector<uint8_t> ihdr;
  ihdr.reserve(13);
  AppendUint32BigEndian(ihdr, static_cast<uint32_t>(frame.size.width));
  AppendUint32BigEndian(ihdr, static_cast<uint32_t>(frame.size.height));
  ihdr.push_back(8);
  ihdr.push_back(6);
  ihdr.push_back(0);
  ihdr.push_back(0);
  ihdr.push_back(0);
  AppendChunk(png, "IHDR", ihdr);

  const std::vector<uint8_t> compressed = BuildStoredZlibStream(image_data);
  AppendChunk(png, "IDAT", compressed);
  AppendChunk(png, "IEND", {});

  return png;
}

std::string EncodeBase64(const std::vector<uint8_t>& bytes) {
  static constexpr char kAlphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  std::string encoded;
  encoded.reserve(((bytes.size() + 2) / 3) * 4);

  size_t index = 0;
  while (index < bytes.size()) {
    const size_t remaining = bytes.size() - index;
    const uint32_t octet_a = bytes[index++];
    const uint32_t octet_b = remaining > 1 ? bytes[index++] : 0;
    const uint32_t octet_c = remaining > 2 ? bytes[index++] : 0;
    const uint32_t triplet = (octet_a << 16) | (octet_b << 8) | octet_c;

    encoded.push_back(kAlphabet[(triplet >> 18) & 0x3F]);
    encoded.push_back(kAlphabet[(triplet >> 12) & 0x3F]);
    encoded.push_back(remaining > 1 ? kAlphabet[(triplet >> 6) & 0x3F] : '=');
    encoded.push_back(remaining > 2 ? kAlphabet[triplet & 0x3F] : '=');
  }

  return encoded;
}

}  // namespace midscene::rdp
