#include "rdp_helper_png.hpp"

#include <stdexcept>

namespace midscene::rdp {

std::vector<uint8_t> EncodeFrameAsPng(const RawFrame& frame) {
  static_cast<void>(frame);
  throw std::runtime_error(
      "Cross-platform helper scaffold is not wired to a PNG encoder yet.");
}

std::string EncodeBase64(const std::vector<uint8_t>& bytes) {
  static_cast<void>(bytes);
  throw std::runtime_error(
      "Cross-platform helper scaffold is not wired to a base64 encoder yet.");
}

}  // namespace midscene::rdp
