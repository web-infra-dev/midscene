#pragma once

#include <algorithm>
#include <chrono>

#include "rdp_helper_session.hpp"

namespace midscene::rdp {

// FreeRDP embeds its context first; shared by the callback and native tests.
struct MidsceneRdpContext {
  rdpContext context;
  FreeRdpSessionTransport* owner = nullptr;
  pcRdpgfxStartFrame original_graphics_start_frame = nullptr;
  pcRdpgfxEndFrame original_graphics_end_frame = nullptr;
};

// Compute the next initial-screenshot wakeup without consulting wall time.
inline std::chrono::steady_clock::time_point ScreenshotWakeAt(
    std::chrono::steady_clock::time_point started,
    std::chrono::steady_clock::time_point last_update) {
  return std::min(std::max(started, last_update) + std::chrono::milliseconds(300),
                  started + std::chrono::seconds(3));
}

}  // namespace midscene::rdp
