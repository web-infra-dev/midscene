#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "rdp_helper_session.hpp"

namespace midscene::rdp {

std::vector<uint8_t> EncodeFrameAsPng(const RawFrame& frame);
std::string EncodeBase64(const std::vector<uint8_t>& bytes);

}  // namespace midscene::rdp
