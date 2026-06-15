#include "rdp_helper_png.hpp"

#include <cstdint>
#include <iostream>
#include <string>
#include <string_view>
#include <vector>

namespace {

bool Fail(std::string_view message) {
  std::cerr << "png_test failed: " << message << '\n';
  return false;
}

uint32_t ReadUint32BigEndian(const std::vector<uint8_t>& bytes, size_t offset) {
  return (static_cast<uint32_t>(bytes[offset]) << 24) |
         (static_cast<uint32_t>(bytes[offset + 1]) << 16) |
         (static_cast<uint32_t>(bytes[offset + 2]) << 8) |
         static_cast<uint32_t>(bytes[offset + 3]);
}

bool HasPngSignature(const std::vector<uint8_t>& png) {
  static constexpr uint8_t kSignature[] = {137, 80, 78, 71, 13, 10, 26, 10};
  if (png.size() < sizeof(kSignature)) {
    return false;
  }
  for (size_t index = 0; index < sizeof(kSignature); index++) {
    if (png[index] != kSignature[index]) {
      return false;
    }
  }
  return true;
}

bool TestRdpFramebufferAlphaIsIgnored() {
  midscene::rdp::RawFrame frame;
  frame.size.width = 1;
  frame.size.height = 1;
  frame.stride = 4;
  frame.bgra = {
      0x03,  // blue
      0x02,  // green
      0x01,  // red
      0x00,  // unused alpha/padding; must not make the pixel transparent
  };

  const std::vector<uint8_t> png = midscene::rdp::EncodeFrameAsPng(frame);
  if (!HasPngSignature(png)) {
    return Fail("missing PNG signature");
  }

  size_t offset = 8;
  bool saw_ihdr = false;
  bool saw_idat = false;
  while (offset + 12 <= png.size()) {
    const uint32_t length = ReadUint32BigEndian(png, offset);
    offset += 4;
    if (offset + 4 + length + 4 > png.size()) {
      return Fail("truncated PNG chunk");
    }

    const std::string type(
        reinterpret_cast<const char*>(&png[offset]), 4);
    offset += 4;
    const size_t data_offset = offset;

    if (type == "IHDR") {
      saw_ihdr = true;
      if (length != 13) {
        return Fail("unexpected IHDR length");
      }
      if (png[data_offset + 8] != 8) {
        return Fail("unexpected PNG bit depth");
      }
      if (png[data_offset + 9] != 2) {
        return Fail("RDP screenshot PNG must be truecolor RGB");
      }
    } else if (type == "IDAT") {
      saw_idat = true;
      const std::vector<uint8_t> expected = {
          0x78, 0x01,  // zlib stored stream
          0x01,        // final stored block
          0x04, 0x00,  // block length
          0xFB, 0xFF,  // one's complement
          0x00,        // PNG filter byte
          0x01,        // red
          0x02,        // green
          0x03,        // blue
      };
      if (length < expected.size()) {
        return Fail("IDAT is too short");
      }
      for (size_t index = 0; index < expected.size(); index++) {
        if (png[data_offset + index] != expected[index]) {
          return Fail("IDAT did not encode the expected opaque RGB pixel");
        }
      }
    }

    offset += length + 4;
  }

  if (!saw_ihdr) {
    return Fail("missing IHDR");
  }
  if (!saw_idat) {
    return Fail("missing IDAT");
  }
  return true;
}

}  // namespace

int main() {
  return TestRdpFramebufferAlphaIsIgnored() ? 0 : 1;
}
